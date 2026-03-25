# Build Plan

## Day 1 -- Foundation

### Step 1: Scaffold + Tooling
Create Next.js project with App Router. Install all dependencies. Configure ESLint + Prettier. Set up Drizzle with Neon Postgres connection. Enable pgvector extension. Run first migration (empty, just to verify connection). Deploy skeleton to Vercel.

Dependencies to install:
- next, react, react-dom, typescript
- drizzle-orm, drizzle-kit, @neondatabase/serverless, pg
- jose (JWT sessions)
- tailwindcss, framer-motion
- d3, umap-js
- @anthropic-ai/sdk, @google/generative-ai
- eslint, prettier, eslint-config-next

Acceptance:
- [ ] `pnpm dev` runs on localhost
- [ ] `pnpm lint` passes with zero errors
- [ ] `pnpm tsc --noEmit` passes
- [ ] Drizzle connects to Neon, migration runs
- [ ] pgvector extension enabled (`CREATE EXTENSION IF NOT EXISTS vector`)
- [ ] Deployed to Vercel, shows placeholder page

### Step 2: Database Schema
Create all Drizzle schema files per DATA_MODEL.md. Generate and run migrations. Verify tables exist in Neon.

Acceptance:
- [ ] All tables created: users, buckets, categoryExemplars, classifications, reclassificationLog, aiUsage
- [ ] pgvector column on classifications.embedding (384 dims) and categoryExemplars.embedding (384 dims)
- [ ] `pnpm db:migrate` runs clean
- [ ] Schema matches DATA_MODEL.md

### Step 3: Demo Mode
Create fixture data: 20 realistic email threads across 5 default buckets. Include variety: newsletters, promotions, urgent work emails, shipping confirmations, social notifications. Store as JSON in src/fixtures/. Build demo auth route that creates a session without Google OAuth. On demo login, seed fixture data into DB for that demo user.

Acceptance:
- [ ] `/api/auth/demo` creates session, redirects to /inbox
- [ ] 20 fixture threads with realistic subjects, senders, snippets, timestamps
- [ ] Fixture data spans all 5 default buckets
- [ ] Demo user sees fixture data in inbox view
- [ ] Can develop all features against demo data without hitting Gmail

### Step 4: Google OAuth
Set up Google Cloud project (manual). Implement OAuth flow: redirect route, callback route, token storage in httpOnly JWT cookie. Store access_token and refresh_token. Build token refresh logic. Add sign-in button to landing page.

Acceptance:
- [ ] Clicking "Sign in with Google" redirects to Google consent screen
- [ ] Callback exchanges code for tokens, sets session cookie
- [ ] Session persists across page refreshes
- [ ] Token refresh works when access_token expires
- [ ] Sign-out clears session
- [ ] Scopes: gmail.readonly (gmail.send NOT needed)

### Step 5: Gmail Sync
Fetch last 200 threads via Gmail API. Extract: threadId, subject, sender (name + email), snippet, timestamp, Gmail category (Primary/Social/Promotions/Updates/Forums), attachment filenames, labels. Store in classifications table. Handle pagination (Gmail returns max 100 per request, so 2 requests). Skip threads already in DB (idempotent).

Acceptance:
- [ ] Fetches 200 threads (2 paginated requests)
- [ ] All fields extracted and stored in classifications table
- [ ] Gmail native category stored (Primary, Social, Promotions, Updates, Forums)
- [ ] Re-running sync skips already-stored threads
- [ ] Works with real Gmail account
- [ ] Error handling: invalid token, API rate limit, network failure

### Step 6: Basic Inbox UI
Build the list view (required by prompt). Tab per bucket. Each tab shows emails with subject, sender, snippet preview, timestamp. Default buckets: Important, Can Wait, Newsletters, Promotions, Auto-Archive. Unclassified emails show in an "Uncategorized" tab until pipeline runs. Responsive layout.

Acceptance:
- [ ] Tab bar with all default buckets + Uncategorized
- [ ] Each email shows: subject (truncated), sender, snippet (truncated), relative timestamp
- [ ] Emails sorted by timestamp (newest first) within each bucket
- [ ] Works with demo data
- [ ] Mobile responsive
- [ ] Empty state for buckets with no emails

---

## Day 2 -- Pipeline + Classification

### Step 7: Embedding Pipeline
Batch embed all unembedded threads via Gemini embedding-001. Embed concatenated string: `[SUBJECT] {subject} [FROM] {sender} [PREVIEW] {snippet}`. Batch at 100 per request. Store 384-dim vectors in classifications.embedding via pgvector. Run UMAP on all embeddings, store 2D coordinates in classifications.umapX and classifications.umapY.

Acceptance:
- [ ] All 200 threads embedded in 2 API calls
- [ ] Structured input format: `[SUBJECT] ... [FROM] ... [PREVIEW] ...`
- [ ] Vectors stored in pgvector column
- [ ] UMAP 2D coordinates computed and stored
- [ ] Idempotent: skips already-embedded threads
- [ ] Error handling: API failure, malformed response

### Step 8: Tier 0 + Tier 1 Classification
Tier 0: Map Gmail native categories to buckets. Promotions -> Promotions. Social -> Can Wait. Updates/Forums -> context-dependent. Primary -> pass to next tier. Tier 1: Domain pattern matching. Build domain map: github.com/gitlab.com -> Auto-Archive (notifications), substack.com/beehiiv.com -> Newsletters, amazon.com/ups.com/fedex.com -> Auto-Archive (shipping), linkedin.com -> Can Wait. Mark classified emails with tier=0 or tier=1 and confidence=1.0.

Acceptance:
- [ ] Gmail categories mapped to buckets with sensible defaults
- [ ] Domain map covers at least 20 common domains
- [ ] Classified emails have tier and confidence set
- [ ] Unresolved emails pass through to Tier 2
- [ ] ~50-60% of emails resolved at zero LLM cost

### Step 9: Tier 2 Semantic Classification
Bootstrap exemplar pool: for each default bucket, generate 5 synthetic exemplar embeddings from the bucket description. Store in categoryExemplars with source='synthetic' and weight=0.5. For each unclassified email, compute cosine similarity (via pgvector <=> operator) against all exemplars. Use nearest-neighbor: find the single closest exemplar, that exemplar's bucket is the candidate. Confidence = similarity score of best match. Margin = best score minus second-best bucket's best score. If confidence > 0.70 AND margin > 0.15, classify. Otherwise pass to Tier 3.

Acceptance:
- [ ] 5 synthetic exemplars per default bucket (25 total)
- [ ] Cosine similarity computed via pgvector
- [ ] Nearest-neighbor matching (not centroid)
- [ ] Confidence and margin thresholds applied
- [ ] Classified emails have tier=2, confidence, and bucketId set
- [ ] Ambiguous emails flagged for Tier 3
- [ ] ~30-40% of remaining emails resolved

### Step 10: Tier 3 Batch LLM Classification
Collect all Tier-3 candidate emails. Batch into groups of 10-15. For each batch, call Claude Sonnet 4 with tool use. Tool schema: array of {threadId, bucketId, confidence, reasoning}. Prompt includes bucket descriptions and the email subjects/senders/snippets. If Claude fails (rate limit, timeout, error), retry once, then fallback to Gemini 2.0 Flash with same schema. If both fail, use best semantic match from Tier 2 regardless of confidence (heuristic fallback). Feed security flags into the prompt context. Log all LLM calls to aiUsage table (model, tokens, cost).

Acceptance:
- [ ] Batches of 10-15 emails per LLM call
- [ ] Tool use enforces structured output (not prompt-based JSON)
- [ ] Claude -> Gemini -> heuristic fallback chain works
- [ ] Security flags included in LLM context
- [ ] All LLM calls logged with model, token count, estimated cost
- [ ] Every email has a bucket assignment after Tier 3
- [ ] High-confidence results (>0.7) added as new exemplars with source='confirmed'

### Step 11: SSE Streaming
Pipeline orchestrator emits SSE events as it processes. Event types: sync_progress (x/200), embed_progress (x/200), tier0_complete (count), tier1_complete (count), tier2_progress (x/remaining), tier3_progress (x/remaining), classification_result (individual email classified), pipeline_complete. Frontend listens via EventSource, updates bucket counts and email list in real time.

Acceptance:
- [ ] SSE endpoint at /api/classify returns text/event-stream
- [ ] Events fire at per-email granularity (not just per-stage)
- [ ] Frontend shows: "Syncing 142/200..." "Classifying 67/143..."
- [ ] Emails appear in bucket tabs as they're classified (not all at once)
- [ ] Pipeline progress bar shows overall completion
- [ ] Connection cleanup on page navigation

### Step 12: Custom Buckets + Reclassification
User creates a bucket by typing a name and description. Backend: generate rich description via LLM, embed the description to create synthetic exemplars, check cosine similarity against existing bucket exemplars for overlap warnings. Reclassification: re-run Tier 2 for all emails against the new bucket set. Emails that now match the new bucket better than their current bucket get reclassified. Only ambiguous reclassifications go to Tier 3. Stream reclassification progress via SSE.

Acceptance:
- [ ] Create bucket form: name + plain English description
- [ ] LLM generates enriched description + boundary notes
- [ ] Synthetic exemplars created from description
- [ ] Overlap warning if new bucket is >0.8 similar to existing bucket
- [ ] Reclassification runs and streams progress
- [ ] Emails visibly move between buckets
- [ ] New bucket appears in tab bar and D3 visualization

---

## Day 3 -- Differentiation + Polish

### Step 13: D3 Cluster Visualization
Build the Obsidian-inspired graph view. Disjointed force-directed layout using UMAP coordinates as initial positions. Visual encoding: fill color = bucket color, fill opacity = recency (today=1.0, week ago=0.3), stroke color = tier (none=Tier0/1, yellow=Tier2, red=Tier3), node radius = urgency score (6px min, 20px max), distance from cluster center = inverse confidence. Cluster labels always visible: "Important (23)". Zoom behavior with progressive label disclosure.

Acceptance:
- [ ] 200 nodes render without performance issues
- [ ] Distinct clusters per bucket with clear separation
- [ ] All visual encodings working (color, opacity, stroke, size)
- [ ] Zoom: labels fade in at 2x, more detail at 4x
- [ ] Cluster labels with counts always visible
- [ ] Smooth force simulation animation
- [ ] Toggle between list view and graph view

### Step 14: D3 Filter Panel
Obsidian-style collapsible panel. Sections: Filters (keyword search, bucket toggles, tier checkboxes, confidence range slider, urgency threshold slider), Display (node size slider, text fade threshold slider). Filters update the visualization in real time -- hidden nodes fade out or disappear, remaining nodes rebalance.

Acceptance:
- [ ] Keyword search filters nodes by subject/sender/snippet
- [ ] Bucket toggles show/hide entire clusters
- [ ] Tier checkboxes filter by classification tier
- [ ] Confidence slider filters to confidence range
- [ ] Urgency slider filters to urgency threshold
- [ ] Node size and text fade sliders adjust display
- [ ] All filters apply in real time with smooth transitions
- [ ] Reset button clears all filters

### Step 15: Drag-to-Reclassify
D3 drag behavior. On drag start: pause simulation, highlight cluster centers as drop targets. On drag: nearest cluster center highlights. On drop in different cluster: optimistic UI update, API call to /api/reclassify (updates bucket, adds email as new exemplar), refresh nearby ambiguous nodes (re-run similarity, animate position changes), show toast "Moved to {bucket} -- system learned from your correction". On drop in same cluster: snap back.

Acceptance:
- [ ] Drag works smoothly on email nodes
- [ ] Cluster centers highlight as valid drop targets
- [ ] Dropping in new cluster triggers reclassification
- [ ] New exemplar created from the reclassified email
- [ ] Nearby ambiguous nodes re-evaluate and may shift
- [ ] Toast notification confirms the action
- [ ] Undo option (within 5 seconds)

### Step 16: Classification Explainability Panel
Click any email node (D3) or email row (list view) to open side panel. Shows: subject, sender, full snippet, timestamp. Classification details: which tier classified it, confidence score, cosine similarity distances to ALL buckets (bar chart or ranked list), LLM reasoning if Tier 3, security flags if any. Panel slides in from right, click outside to close.

Acceptance:
- [ ] Click email in D3 or list view opens panel
- [ ] All classification metadata displayed
- [ ] Cosine distances to all buckets shown (sorted)
- [ ] LLM reasoning shown for Tier 3 emails
- [ ] Security flags shown with risk badges
- [ ] Panel is responsive and closeable

### Step 17: Security Scanning
Regex-based scanning on subject + snippet. Patterns: phishing ("verify your account", "suspended", "click here immediately"), financial fraud ("wire transfer", "prize claim", "inheritance"), suspicious URLs (bit.ly, t.co, tinyurl), PII (SSN patterns, credit card patterns), dangerous attachments (.exe, .bat, .ps1, .zip in attachment filenames). Store flags in classifications.securityFlags (JSON array). Feed flags into Tier 3 LLM prompt. Display security badges on flagged emails in both list and D3 views.

Acceptance:
- [ ] Scanning runs during embed stage (parallel)
- [ ] At least 15 regex patterns across 5 categories
- [ ] Flags stored in DB and displayed in UI
- [ ] Flags included in Tier 3 LLM context
- [ ] Security badge visible on flagged emails (both views)

### Step 18: Pipeline Metrics
Simple metrics panel (collapsible). Shows: total emails processed, count per tier (how many resolved at each tier), estimated LLM cost for this run, exemplar pool size per bucket, classification accuracy proxy (% classified with confidence > 0.7). Updates in real time during pipeline run via SSE.

Acceptance:
- [ ] Metrics panel visible during and after pipeline run
- [ ] Tier distribution shown (pie chart or bar)
- [ ] LLM cost estimate shown
- [ ] Exemplar counts per bucket shown
- [ ] Updates in real time via SSE

### Step 19: Error Handling + Edge Cases
Audit all API routes for: missing/invalid auth, expired tokens (trigger refresh), Gmail API errors (rate limit, network), LLM API errors (rate limit, timeout, malformed response), empty inbox (0 threads), malformed email data (missing subject, missing sender). Add rate limiting middleware on /api/classify (1 run per minute per user). Add loading states and error boundaries to all pages. Create a custom not-found.tsx in the root app/ directory using existing styles/ logic and "Return to Dashboard" action.

Acceptance:
[ ] No unhandled promise rejections
[ ] All API routes return meaningful error messages
[ ] Rate limiting on classify endpoint
[ ] Loading states on all async operations
[ ] Error boundaries catch component crashes
[ ] Empty states for zero emails, zero results after filter
[ ] not-found.tsx renders correctly for invalid URLs (e.g., /inbox/non-existent-page).
[ ] "Return to Dashboard" button in 404 UI correctly redirects to /inbox


### Step 20: Final Polish + Ship
Run ESLint + Prettier on entire codebase. Run TypeScript strict check. Write README: what it is, how to run locally, architecture overview, screenshots. Record video: <10 min, demo the app, walk through architecture, show code, explain tradeoffs. Deploy final version to Vercel.

Acceptance:
- [ ] `pnpm lint` zero errors
- [ ] `pnpm tsc --noEmit` zero errors
- [ ] README with setup instructions, architecture summary, screenshots
- [ ] Video recorded, <10 min, uploaded to YouTube (unlisted)
- [ ] Deployed to Vercel, live link works
- [ ] Submitted via Ashby + email to alex@tenex.co, arman@tenex.co, dean@tenex.co, dan@tenex.co, brett@tenex.co
