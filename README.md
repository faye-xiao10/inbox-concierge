# Inbox Concierge

An AI-powered Gmail triage system that classifies your inbox using a 4-tier pipeline — from zero-cost rule matching to semantic vector search to batch LLM classification — and visualizes the results as an interactive D3 force graph.


**Live demo:** [inbox-concierge.vercel.app](https://inbox-concierge.vercel.app) · **Demo mode:** no Gmail required

---

## What it does

Inbox Concierge fetches your 200 most recent Gmail threads and runs them through a classification pipeline. In practice, Gmail's native categories combined with domain pattern matching resolve roughly 60–90% of a typical inbox for free — the observed run in the screenshot above shows 209 of 233 emails (90%) handled before a single LLM token was spent. Vector similarity and Claude handle the remaining ambiguous cases.

Results stream to the UI in real time via SSE at per-email granularity.

**Five default buckets:** Direct · Updates · Newsletters · Promotions · Auto-Archive

You can also create custom buckets in plain English — the system enriches your description via LLM, generates exemplar vectors, and reclassifies your inbox against the new bucket automatically.

---



## Project Screenshots

Here is a visual overview of the Inbox Concierge interface and performance metrics.

| **Cluster Visualization** | **Pipeline Metrics** |
| :--- | :--- |
| <a href="https://github.com/user-attachments/assets/c5046eaa-79ae-4908-bfd3-ebdb3cc95646"><img src="https://github.com/user-attachments/assets/c5046eaa-79ae-4908-bfd3-ebdb3cc95646" height="400" alt="D3 Graph View" /></a> | <a href="https://github.com/user-attachments/assets/c4982120-78e5-496f-b044-c9759f483363"><img src="https://github.com/user-attachments/assets/c4982120-78e5-496f-b044-c9759f483363" height="400" alt="Performance Metrics" /></a> |
| *Interactive D3.js graph showing semantic email clusters and real-time reclassification.* | *T0–T3 processing hierarchy showing 90%+ AI offload efficiency via vector memory.* |

| **Full Dashboard Overview** |
| :--- |
| <a href="https://github.com/user-attachments/assets/5973f02d-d3a5-4fe9-8997-bcf0b07e1e80"><img src="https://github.com/user-attachments/assets/5973f02d-d3a5-4fe9-8997-bcf0b07e1e80" height="350" alt="Full System View" /></a> |
| *Comprehensive view of the inbox management suite, featuring the methodology legend and categorized thread list.* |


---

## Architecture

### Classification Pipeline

```
User clicks "Classify Inbox"
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PIPELINE ORCHESTRATOR                        │
│                    (streams SSE events)                         │
│                                                                 │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌────────┐  ┌───────┐   │
│  │ 1 SYNC  │─▶│ 2 EMBED  │─▶│ 3 T0+1 │─▶│ 4 T2+3 │─▶│ 5 UX  │   │
│  │         │  │ + SCAN   │  │        │  │        │  │       │   │
│  │ Gmail   │  │ Gemini   │  │ Gmail  │  │ Vector │  │Urgency│   │
│  │ API     │  │ embed +  │  │ cats + │  │ match +│  │score +│   │
│  │ 200     │  │ security │  │ domain │  │ batch  │  │triage │   │
│  │ threads │  │ regex    │  │ rules  │  │ LLM    │  │       │   │
│  └─────────┘  └──────────┘  └────────┘  └────────┘  └───────┘   │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────┐     ┌────────────────────┐
│    LIST VIEW       │ ◀▶  │   D3 GRAPH VIEW    │
│   (bucket tabs)    │     │  (cluster viz)     │
└────────────────────┘     └────────────────────┘
```

### Tier breakdown

| Tier | Method | Cost | Observed coverage |
|------|--------|------|-------------------|
| **Tier 0** | Gmail native categories (Promotions, Social) | Free | ~50-60% |
| **Tier 1** | Domain pattern matching (65+ rules, 18 sender regexes) | Free | ~20-30% of remainder |
| **Tier 2** | pgvector cosine nearest-neighbor against exemplar pool | Free (DB only) | ~10% of remainder |
| **Tier 3** | Batch LLM via Claude Sonnet 4.6 tool use | ~$0.01–0.15/run | Remainder (~10%) |

Tiers 0 and 1 together typically resolve 50–70% of a real inbox before any paid API is touched. The exact split depends on how much newsletter/promotional mail is in the inbox and how many new classification buckets the user makes. 

**Fallback chain for Tier 3:** Claude Sonnet 4.6 → Gemini 2.5 Flash (same tool schema) → best Tier 2 match (heuristic)

### Tier 3: parallel batch LLM

Tier 3 candidates are batched in groups of 12 and classified via `Promise.all` — all batches run in parallel rather than sequentially. Each batch uses Claude's tool use API (`tool_choice: { type: 'tool', name: 'classify_emails' }`) for structured output; no JSON-in-prose parsing.

### Urgency scoring

Each classified thread gets an urgency score (0.0–1.0) computed from:
- Base score by bucket type
- Modifiers: deadline language, contains a question, unread, sent today, active thread (>5 messages), user is a participant (not just CC'd)

### Custom buckets

1. User types a name + plain English description
2. Gemini 2.5 Flash generates an enriched description, boundary notes, and 3–5 synthetic exemplar emails
3. Exemplars are embedded and stored; overlap check runs against existing buckets (>0.88 cosine similarity triggers a warning)
4. Reclassification uses a **two-pass approach** that streams via SSE:
   - **Pass 1 (instant, ~1–2s)** — pgvector distance against the new bucket's embedding finds high-confidence matches and populates the bucket immediately
   - **Pass 2 (background)** — ambiguous candidates go through Tier 3 Claude batches run in parallel via `Promise.all`, delivering additional results as each batch completes

---

## D3 Graph View

Force-directed layout using UMAP 2D coordinates as initial node positions. Built with D3.js v7.

**Visual encoding:**

| Property | Visual channel |
|----------|----------------|
| Semantic meaning | Position (x, y from UMAP) |
| Bucket membership | Fill color |
| Recency | Fill opacity (today = 1.0, 7 days ago = 0.3) |
| Classification tier | Stroke color: none = T0/T1, yellow = T2, red = T3 |
| Urgency | Node radius (6px min → 20px max) |
| Security flag | Red badge on node |

**Interactions:**
- **Hover** — tooltip with subject, sender, snippet, confidence, tier, urgency
- **Drag-to-reclassify** — drag a node to a different cluster; the move is applied immediately and a new exemplar is created from that email to improve future matching
- **Filter panel** — keyword search, bucket toggles, tier checkboxes, confidence/urgency sliders
- **Zoom** — 0.5×–6× with cluster labels always visible
- **Toggle** — switch between list view and graph view

---

## Security Scanning

Runs in parallel with embedding. 15 regex patterns across 5 flag types:

- `phishing` — "verify your account", "suspended", "unusual activity"
- `financial_fraud` — "wire transfer", "prize claim", "inheritance"
- `suspicious_url` — bit.ly, t.co, tinyurl.com, goo.gl
- `pii` — SSN patterns (`\d{3}-\d{2}-\d{4}`), 16-digit card patterns
- `dangerous_attachment` — .exe, .bat, .ps1, .cmd, .scr, .zip, .rar filenames

Flagged emails show a red badge in both list and graph views. Flags are also injected into the Tier 3 LLM prompt as context.

---

## Pipeline Metrics

After each classify run, a metrics panel shows:
- AI efficiency (% classified without LLM)
- Tier breakdown (count per tier)
- Total AI operations logged
- Average confidence per tier
- Exemplar pool size per bucket
- Processing time

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, Framer Motion, CSS variables |
| Database | Neon Postgres + pgvector (384-dim vectors, HNSW index) |
| ORM | Drizzle ORM |
| Embeddings | Gemini `embedding-001` (384 dims, batched 100/request) |
| UMAP | umap-js (2D projection of embedding space) |
| Visualization | D3.js v7 — force simulation, zoom, drag |
| LLM (primary) | Claude Sonnet 4.6 — tool use for structured classification |
| LLM (fallback) | Gemini 2.5 Flash — same tool schema |
| Auth | Google OAuth 2.0, JWT sessions via jose, AES-GCM token encryption |
| Streaming | Server-Sent Events (SSE) at per-email granularity |
| Deployment | Vercel |

---

## Local Setup

### Prerequisites

- Node.js 20+
- pnpm
- A Neon Postgres database with pgvector enabled
- Google Cloud project with Gmail API + OAuth credentials
- Anthropic API key
- Google AI (Gemini) API key

### 1. Clone and install

```bash
git clone https://github.com/your-username/inbox-concierge.git
cd inbox-concierge
pnpm install
```

### 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in all values:

```bash
cp .env.local.example .env.local
```

```env
# Database
DATABASE_URL=postgresql://...

# Session
SESSION_SECRET=your-32-char-minimum-secret-here
NEXT_PUBLIC_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# AI APIs
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
```

### 3. Database setup

```bash
# Enable pgvector and run migrations
pnpm db:migrate
```

> For HNSW indexing (recommended for production), run the SQL in `drizzle/setup.sql` manually in your Neon console after the initial migration.

### 4. Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable the Gmail API
3. Create OAuth 2.0 credentials (Web application)
4. Add authorized redirect URI: `http://localhost:3000/api/auth/callback`
5. Copy Client ID and Client Secret to `.env.local`

### 5. Run locally

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Use **Try Demo** to explore a pre-classified inbox, or **Sign in with Google** to classify your real inbox.

---

## Demo Mode

Demo mode loads 20 pre-classified fixture threads across all 5 default buckets. It's a read-only view — the graph, filter panel, bucket tabs, and all visualizations are fully interactive, but classification cannot be re-run on fixture data. Sign in with Google to run the real pipeline against your inbox.

---

## Project Structure

```
src/
  app/
    api/                    # All API routes
      auth/                 # OAuth + demo + signout
      buckets/              # CRUD + reclassification SSE
      classify/             # Main pipeline SSE endpoint
      graph-data/           # Graph node data endpoint
      reclassify/           # Drag-to-reclassify endpoint
    inbox/                  # Inbox page (server component)
    page.tsx                # Marketing landing page
  components/
    graph/                  # D3 graph, filter panel, tooltip, drag
    inbox/                  # Bucket tabs, email list/row, classify button
    landing/                # Pipeline animation
    ui/                     # Button, ErrorBoundary
  fixtures/
    demo-threads.json       # 20 pre-built demo threads
  lib/
    buckets/                # Bucket enrichment (LLM + overlap detection)
    db/                     # Drizzle schema, seed scripts, vector type
    embed/                  # Gemini embedding + UMAP runner
    gmail/                  # Gmail API client + sync
    google/                 # OAuth token handling (AES-GCM encrypted)
    inbox/                  # Server-side data fetchers
    pipeline/               # Orchestrator + all 4 tiers + triage
    session.ts              # JWT session helpers
    utils/retry.ts          # Exponential backoff with jitter
  scripts/                  # One-off migration + diagnostic scripts
```

---

## Key Design Decisions

**Cost-first classification ladder** — The pipeline is ordered by cost: free rules first, paid LLM last. Observed runs show 60–90% of a real inbox resolved for $0, with Claude only touching the genuinely ambiguous remainder.

**pgvector for everything** — Both Tier 2 nearest-neighbor search and custom bucket reclassification use the pgvector `<=>` operator directly in SQL. No in-memory cosine loops; 241 emails evaluated in ~50ms.

**Two-pass reclassification** — When a custom bucket is created or updated, high-confidence semantic matches populate within 1–2 seconds via pgvector. Claude then processes ambiguous candidates in parallel batches and streams additional results as they complete — so the bucket feels immediately useful while the AI continues refining.

**SSE at per-email granularity** — Every `classification_result` event carries a `threadId + bucketId`, so emails appear in their bucket tab as they're classified rather than all at once at the end.

**Tool use only, never prompt JSON** — All LLM calls use structured tool use (`tool_choice: { type: 'tool', name: 'classify_emails' }`). No fragile JSON-in-prose parsing.

**Custom buckets as first-class citizens** — Custom bucket assignments survive full pipeline reruns (only default buckets are reset). On creation, enrichment runs inside the SSE stream before `close()` — preventing Vercel serverless from killing the background job.

**Exemplar promotion** — High-confidence (>0.7) Tier 3 results are promoted to `categoryExemplars` with `source='confirmed', weight=0.8`, improving future Tier 2 matching over time without any manual input.

---

## Tradeoffs

- **UMAP is run server-side** using umap-js. For large inboxes (1000+ emails) this would need to move to a background job or a Python microservice (UMAP in Python is significantly faster).
- **No token-level streaming to user** — Tier 3 batches are awaited before their `classification_result` events fire. Claude streams tokens internally but the classification isn't written until the full tool call completes.
- **Demo exemplars are synthetic** — Tier 2 accuracy in demo mode is lower than in production because the exemplars are bootstrapped from descriptions rather than real confirmed classifications.
- **Single-region DB** — Neon is single-region; latency would matter at scale. pgvector HNSW index handles ~10k vectors comfortably.

---

## Scripts

```bash
pnpm db:migrate           # Run Drizzle migrations
pnpm db:studio            # Open Drizzle Studio (DB GUI)
pnpm typecheck            # TypeScript strict check
pnpm format               # Prettier

# One-off scripts (tsx)
pnpm rename-buckets       # Migrates "Important"→"Direct", "Can Wait"→"Updates"
pnpm reseed-demo          # Resets demo user's classifications from fixtures
pnpm embed-existing-buckets  # Backfills bucket-level embedding vectors
pnpm check-exemplars      # Reports exemplar count/text coverage per bucket
```
