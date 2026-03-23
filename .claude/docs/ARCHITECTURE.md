# Architecture

## System Overview

```
User clicks "Classify Inbox"
         |
         v
┌─────────────────────────────────────────────────────────────────┐
│                    PIPELINE ORCHESTRATOR                        │
│                    (streams SSE events)                         │
│                                                                 │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌────────┐  ┌───────┐ │
│  │ 1 SYNC  │─>│ 2 EMBED  │─>│ 3 T0+1 │─>│ 4 T2+3 │─>│ 5 UX  │ │
│  │         │  │ + SCAN   │  │        │  │        │  │       │ │
│  │ Gmail   │  │ Gemini   │  │ Gmail  │  │ Vector │  │Urgency│ │
│  │ API     │  │ embed +  │  │ cats + │  │ match +│  │score +│ │
│  │ 200     │  │ security │  │ domain │  │ batch  │  │triage │ │
│  │ threads │  │ regex    │  │ rules  │  │ LLM    │  │       │ │
│  └─────────┘  └──────────┘  └────────┘  └────────┘  └───────┘ │
│         |           |            |            |           |     │
│         v           v            v            v           v     │
│     SSE events streamed to frontend at per-email granularity   │
└─────────────────────────────────────────────────────────────────┘
         |
         v
┌─────────────────────────┐     ┌─────────────────────────┐
│     LIST VIEW           │ <─> │     D3 GRAPH VIEW       │
│     (bucket tabs)       │     │     (cluster viz)        │
│     Required by prompt  │     │     Wow factor           │
└─────────────────────────┘     └─────────────────────────┘
```

---

## Classification Pipeline Detail

### Stage 1: Gmail Sync
- Fetch 200 most recent threads via Gmail API (2 paginated requests of 100)
- A thread is a conversation (1 to many emails). Extract per thread:
  - threadId
  - subject (from the FIRST message in the thread -- this is the thread topic)
  - senderName + senderEmail (from the MOST RECENT message -- who last replied)
  - snippet (from the MOST RECENT message -- what's current)
  - timestamp (from the MOST RECENT message)
  - messageCount (total messages in the thread)
  - gmailCategory (Primary, Social, Promotions, Updates, Forums)
  - attachmentFilenames (collected from ALL messages in the thread)
  - isParticipant (boolean: does the authenticated user's email appear as a sender in any message)
  - isUnread
- Upsert into classifications table (skip existing threadIds)
- SSE: `sync_progress` events (x/200)

### Stage 2: Embed + Security Scan (parallel)

**Embedding:**
- Concatenate: `[SUBJECT] {subject from first message} [FROM] {most recent senderName} <{senderEmail}> [PREVIEW] {most recent snippet} [MESSAGES] {messageCount} messages`
- Batch 100 per Gemini embedding-001 request (2 requests for 200 emails)
- Store 384-dim vectors in classifications.embedding
- Run UMAP (umap-js) on all vectors, store 2D coordinates in umapX, umapY
- SSE: `embed_progress` events (x/200)

**Security scan (runs in parallel with embedding):**
- Regex patterns on subject + snippet:
  - Phishing: "verify your account", "suspended", "unusual activity", "click here immediately", "confirm your identity"
  - Financial fraud: "wire transfer urgently", "prize claim", "inheritance", "lottery winner"
  - Suspicious URLs: bit.ly, t.co, tinyurl.com, goo.gl
  - PII exposure: SSN pattern (\d{3}-\d{2}-\d{4}), credit card patterns (16 digits)
  - Dangerous attachments: .exe, .bat, .ps1, .cmd, .scr, .zip, .rar in attachment filenames
- Store matched flags as JSON array in classifications.securityFlags
- SSE: `security_complete` event with flagged count

### Stage 3: Tier 0 + Tier 1 (free, instant)

**Tier 0 -- Gmail native categories:**
```
Gmail "CATEGORY_PROMOTIONS" -> Promotions bucket
Gmail "CATEGORY_SOCIAL"     -> Can Wait bucket
Gmail "CATEGORY_UPDATES"    -> Can Wait bucket
Gmail "CATEGORY_FORUMS"     -> Can Wait bucket
Gmail "CATEGORY_PRIMARY"    -> pass to Tier 1
No category                 -> pass to Tier 1
```

**Tier 1 -- Domain pattern matching:**
```
Domain map (extend as needed):
  github.com, gitlab.com, bitbucket.org     -> Auto-Archive (notifications)
  substack.com, beehiiv.com, mailchimp.com  -> Newsletters
  amazon.com, ups.com, fedex.com, usps.com  -> Auto-Archive (shipping)
  linkedin.com                              -> Can Wait
  noreply@*, no-reply@*                     -> Auto-Archive
  news@*, newsletter@*                      -> Newsletters
  marketing@*, promo@*                      -> Promotions
```

Both tiers set confidence=1.0 and tier=0 or tier=1.
SSE: `tier0_complete` and `tier1_complete` events with counts.
Expected resolution: 50-60% of emails.

### Stage 4: Tier 2 + Tier 3

**Tier 2 -- Semantic nearest-neighbor:**
- For each unclassified email, query pgvector for the single nearest exemplar across all buckets:
  ```sql
  SELECT ce.bucketId, ce.embedding <=> $emailEmbedding AS distance
  FROM category_exemplars ce
  ORDER BY distance ASC
  LIMIT 1
  ```
- Also get second-nearest from a DIFFERENT bucket for margin calculation
- Confidence = 1 - distance (convert distance to similarity)
- Margin = confidence - second_best_confidence
- If confidence > 0.70 AND margin > 0.15: classify with tier=2
- Otherwise: flag for Tier 3
- SSE: `tier2_progress` events per email

**Tier 3 -- Batch LLM classification:**
- Collect all Tier-3 candidates
- Batch into groups of 10-15
- Call Claude Sonnet 4 with tool use:

```typescript
tools: [{
  name: 'classify_emails',
  input_schema: {
    type: 'object',
    properties: {
      classifications: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            threadId: { type: 'string' },
            bucketId: { type: 'integer' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasoning: { type: 'string' }
          },
          required: ['threadId', 'bucketId', 'confidence', 'reasoning']
        }
      }
    },
    required: ['classifications']
  }
}],
tool_choice: { type: 'tool', name: 'classify_emails' }
```

- System prompt includes: all bucket names + descriptions, the batch of emails (threadId, subject, sender, snippet, security flags)
- Fallback chain: Claude -> retry once -> Gemini 2.0 Flash (same tool schema) -> heuristic (use Tier 2 best match regardless of confidence)
- Log every LLM call to aiUsage: model, inputTokens, outputTokens, estimatedCost
- High-confidence results (>0.7) become new exemplars: insert into categoryExemplars with source='confirmed', weight=0.8
- SSE: `tier3_progress` events per batch, `classification_result` per email

### Stage 5: Triage
- For each classified thread, compute urgency score (0.0-1.0):
  - Base urgency from bucket (Important=0.7, Can Wait=0.3, Newsletter=0.1, Promotions=0.1, Auto-Archive=0.0)
  - Modifiers:
    - contains deadline language (+0.2)
    - contains question (+0.1)
    - is unread (+0.1)
    - recency: today (+0.1)
    - messageCount > 5 (+0.1) -- active conversation thread
    - isParticipant (+0.15) -- user is directly involved, not just CC'd
  - Cap at 1.0
- Store urgencyScore in classifications
- SSE: `triage_complete` event

---

## D3 Cluster Visualization

### Data per node
```typescript
interface EmailNode {
  threadId: string;
  subject: string;
  sender: string;
  snippet: string;
  bucketId: number;
  bucketName: string;
  bucketColor: string;       // hex color
  classificationTier: 0 | 1 | 2 | 3;
  confidence: number;        // 0.0-1.0
  urgencyScore: number;      // 0.0-1.0
  timestamp: Date;
  securityFlags: string[];
  llmReasoning?: string;
  umapX: number;             // 2D position from UMAP
  umapY: number;
  cosineSimilarities: {      // distances to each bucket
    bucketId: number;
    bucketName: string;
    similarity: number;
  }[];
}
```

### Visual encoding
| Property | Visual channel |
|----------|---------------|
| Semantic meaning | Position (x, y from UMAP) |
| Bucket membership | Fill color (bucket color) |
| Recency | Fill opacity (today=1.0, 7d ago=0.3) |
| Classification tier | Stroke: none=T0/T1, yellow=T2, red=T3 |
| Classification tier | Stroke width: 0px T0/T1, 2px T2, 3px T3 |
| Urgency | Node radius (6px min, 20px max) |
| Confidence | Distance from cluster center (high=close, low=far) |
| Security flag | Red exclamation badge on node |

### Force simulation
```
forceCluster    -- pull each email toward its bucket centroid
                   strength scaled by confidence (high conf = tight cluster)
forceCollide    -- prevent node overlap, radius = urgencyToRadius + padding
forceCenter     -- gentle pull toward canvas center (prevent drift)
forceManyBody   -- gentle repulsion between all nodes
```

Cluster centers: average UMAP position of all emails in each bucket.

### Interactions
- **Hover**: tooltip with subject, sender, snippet, confidence, tier, urgency
- **Click**: open explainability panel (slide in from right)
- **Zoom**: d3.zoom, scaleExtent [0.5, 6]. Labels fade in at 2x zoom, more detail at 4x.
- **Drag-to-reclassify**: drag node, cluster centers highlight as drop targets. Drop in new cluster: API call, optimistic update, exemplar created, nearby nodes re-evaluate.
- **Cluster labels**: always visible, "{BucketName} ({count})" at cluster centroid

### Filter panel (Obsidian-style, collapsible)

**Filters section:**
- Keyword search input (searches subject + sender + snippet)
- Bucket toggles (one per bucket, show/hide entire cluster)
- Tier checkboxes (Tier 0, 1, 2, 3)
- Confidence range slider (0.0 to 1.0)
- Urgency threshold slider (only show urgency > X)

**Display section:**
- Node size multiplier slider
- Text fade threshold slider (when zoom labels start appearing)

All filters apply in real time. Hidden nodes fade out with opacity transition, remaining nodes rebalance via simulation restart. Reset button clears all filters.

---

## Custom Bucket Creation

1. User types name + description in plain English
2. Backend: call Claude to generate enriched description + boundary notes (what belongs vs what doesn't)
3. Embed the enriched description via Gemini -> create 3-5 synthetic exemplars
4. Check overlap: compute cosine similarity between new bucket's exemplar centroid and all existing bucket centroids. If any > 0.8, return overlap warning with the conflicting bucket name.
5. Save bucket to DB
6. Reclassification: re-run Tier 2 for all emails against the updated bucket set. Only emails that change classification or become ambiguous go through Tier 3.
7. Stream reclassification progress via SSE
8. D3: new cluster appears, emails animate from old clusters to new one

---

## API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/google` | GET | No | Redirect to Google OAuth consent |
| `/api/auth/callback` | GET | No | Exchange code for tokens, set session |
| `/api/auth/demo` | POST | No | Create demo session with fixture data |
| `/api/auth/signout` | POST | Yes | Clear session cookie |
| `/api/classify` | POST | Yes | Run full pipeline, return SSE stream |
| `/api/inbox` | GET | Yes | Return all classified threads + buckets |
| `/api/buckets` | GET | Yes | List user's buckets |
| `/api/buckets` | POST | Yes | Create custom bucket + reclassify |
| `/api/buckets/:id` | DELETE | Yes | Delete bucket + reclassify |
| `/api/reclassify` | POST | Yes | Manual reclassify (drag-to-reclassify) |
| `/api/metrics` | GET | Yes | Pipeline cost/tier metrics |
| `/api/explain/:threadId` | GET | Yes | Classification explainability data |

---

## Demo Mode

Fixture data: 20 email threads stored in src/fixtures/demo-threads.json.

Distribution:
- Important (4): boss email with deadline, client question, interview scheduling, urgent bug report
- Can Wait (4): team standup notes, FYI from colleague, company announcement, event invitation
- Newsletters (4): Substack post, Beehiiv newsletter, tech roundup, industry report
- Promotions (4): SaaS discount, product launch, webinar invite, Black Friday deal
- Auto-Archive (4): shipping confirmation, 2FA code, password reset, receipt

Each fixture includes: threadId, subject, sender (name + email), snippet, timestamp, gmailCategory, attachments (some with filenames). Pre-computed: embedding vectors (384-dim), UMAP coordinates, classification tier, confidence, urgency score.

Demo mode skips Gmail sync and embedding -- loads directly from fixtures. Classification pipeline still runs Tier 0-3 on the fixture metadata (so the pipeline logic is exercised). D3 visualization works identically.

---

## SSE Event Schema

All events are JSON, sent as `data: {json}\n\n`.

```typescript
type PipelineEvent =
  | { type: 'sync_progress'; current: number; total: number }
  | { type: 'sync_complete'; threadCount: number }
  | { type: 'embed_progress'; current: number; total: number }
  | { type: 'embed_complete' }
  | { type: 'security_complete'; flaggedCount: number }
  | { type: 'tier0_complete'; classifiedCount: number }
  | { type: 'tier1_complete'; classifiedCount: number }
  | { type: 'tier2_progress'; current: number; total: number }
  | { type: 'tier2_complete'; classifiedCount: number }
  | { type: 'tier3_progress'; current: number; total: number; batchNumber: number }
  | { type: 'classification_result'; threadId: string; bucketId: number; tier: number; confidence: number }
  | { type: 'triage_complete' }
  | { type: 'umap_complete' }
  | { type: 'pipeline_complete'; metrics: PipelineMetrics }
  | { type: 'error'; message: string; stage: string };

type PipelineMetrics = {
  totalThreads: number;
  tier0Count: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  llmCalls: number;
  estimatedCost: number;
  exemplarsAdded: number;
  durationMs: number;
};
```

---

## Error Handling Strategy

| Error | Response |
|-------|----------|
| Invalid/missing auth | 401 + redirect to login |
| Expired access token | Auto-refresh via refresh token, retry |
| Gmail API rate limit | Retry with exponential backoff (max 3) |
| Gmail API other error | SSE error event + user-friendly message |
| Embedding API failure | SSE error event + skip embedding (classify via Tier 0/1 only) |
| Claude rate limit/timeout | Retry once, then Gemini fallback |
| Gemini failure | Heuristic fallback (best Tier 2 match) |
| Both LLMs fail | Classify as "Uncategorized" with confidence=0 |
| Empty inbox (0 threads) | Show empty state, skip pipeline |
| Malformed email (no subject) | Use "(No subject)" as subject, continue |
| UMAP failure | Skip D3 visualization, show list view only |
| Classify endpoint rate limit | 429 + "Please wait before re-classifying" |
