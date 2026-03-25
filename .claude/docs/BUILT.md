# Built

## Current Status
Steps 1–11 + style system complete + bucket rename migration done. Ready to build Step 12.

## Completed Steps

### Step 1: Scaffold + Tooling (commit: f154fbb)
- Next.js 16, TypeScript, Tailwind 4, ESLint, src/ dir, `@/*` alias
- All deps installed; db:generate/migrate/studio, format, typecheck scripts
- drizzle.config.ts, src/lib/db/index.ts, .env.local.example, .prettierrc, eslint.config.mjs

**Adaptations:** Next.js 16 removed `next lint`; ESLint pinned to 9.x; Tailwind 4 is CSS-only.

### Style System (commit: 91542cd)
- Fraunces/Source Sans 3/JetBrains Mono via next/font/google
- globals.css: CSS vars in `:root`; `@theme` + `@utility` for Tailwind tokens
- src/components/ui/button.tsx: Primary/Secondary/Ghost × sm/md/lg, forwardRef

### Step 2: DB Schema (commit: 3b20421)
- src/lib/db/schema/ — one file per table (users, buckets, category-exemplars, classifications, reclassification-log, ai-usage, relations)
- src/lib/db/vector.ts — custom `vector(n)` type for pgvector
- src/lib/db/setup.ts — `setupExtensions()` for `CREATE EXTENSION IF NOT EXISTS vector`
- drizzle/setup.sql — vector ext + HNSW index SQL
- Migration: drizzle/0000_clean_typhoid_mary.sql

**HNSW note:** generated migration uses btree on embedding; replace with HNSW before prod (see drizzle/setup.sql).

### Step 3: Demo Mode (commit: 4f4f5d8, branch: feature/step-3-demo-mode)
- src/lib/session.ts — JWT via jose: signSession, verifySession, getSession; SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS
- src/lib/db/seed-buckets.ts — DEFAULT_BUCKETS const + seedDefaultBuckets(userId); idempotent
- src/fixtures/demo-threads.json — 20 threads (4 per bucket), UMAP coords clustered by bucket, securityFlags on one promo thread
- src/lib/db/seed-demo.ts — strips non-DB `bucketName`, maps to bucketId, onConflictDoNothing upsert
- src/app/api/auth/demo/route.ts — POST: find-or-create demo user → seed → session cookie → redirect /inbox
- src/app/api/auth/signout/route.ts — POST: clears cookie → redirect /
- src/app/page.tsx — landing page: Try Demo form + Sign in with Google link

**Vercel env vars needed:** `SESSION_SECRET` (≥32 chars), `NEXT_PUBLIC_URL`

### Step 4: Google OAuth (branch: feature/step-4-google-oauth)
- src/lib/db/schema/users.ts — added `tokenExpiresAt timestamp` column
- drizzle/0001_unique_felicia_hardy.sql — migration adding token_expires_at
- src/lib/google/auth.ts — AES-GCM encrypt/decrypt (PBKDF2 key from SESSION_SECRET), buildAuthUrl, exchangeCode, refreshAccessToken, getValidAccessToken; exported encrypt for callback route
- src/app/api/auth/google/route.ts — GET: generate HMAC-signed nonce state, store in oauth_state cookie, redirect to Google
- src/app/api/auth/callback/route.ts — GET: validate state HMAC + cookie, exchangeCode, encrypt tokens, upsert user, seedDefaultBuckets for new users, set session cookie, redirect /inbox

**Crypto notes:** AES-GCM IV prepended as `{iv}.{ciphertext}` (base64url). PBKDF2 salt is fixed string `inbox-concierge-oauth`. `getValidAccessToken` is the only function returning plaintext — all other code stores/passes encrypted values.

**Vercel env vars needed:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (in addition to prior vars)

### Step 5: Gmail Sync (branch: feature/step-5-gmail-sync)
- src/lib/gmail/client.ts — raw Gmail API wrappers: `getThreadList`, `getThread`; types `GmailMessage`, `GmailPart`, `GmailThread`
- src/lib/gmail/sync.ts — `syncGmailThreads(userId, userEmail, onProgress?)`: fetches 200 threads (2 paginated pages), extracts fields per spec, upserts into classifications via `onConflictDoNothing`; pure helpers `extractThreadData`, `extractAttachments`, `parseFrom`
- src/app/api/sync/route.ts — POST: session-gated dev endpoint calling syncGmailThreads, returns `{ synced, skipped }`

**Extraction notes:** subject from first message, senderName/senderEmail from last message From header (handles "Name <email>" and bare email), gmailCategory from first message labelIds, isParticipant checks all messages, attachmentFilenames recursively collected from all message parts.

### Step 6: Basic Inbox UI (branch: feature/step-6-inbox-ui)
- src/lib/inbox/get-inbox-threads.ts — `getInboxThreads(userId)`: Drizzle leftJoin classifications+buckets, DESC timestamp, full null-fallback mapping; exports `InboxThread` interface
- src/lib/inbox/format-timestamp.ts — `formatTimestamp(date)`: today→"2:34 PM", this week→"Mon", older→"Jan 12"
- src/lib/session.ts — added `getSessionFromCookies()` using `next/headers` cookies() for server component auth
- src/app/inbox/page.tsx — server component: session guard via getSessionFromCookies, parallel fetch threads+buckets, renders BucketTabs
- src/app/inbox/loading.tsx — Tailwind animate-pulse skeleton: 5 tab pills + 8 email row placeholders
- src/components/inbox/bucket-tabs.tsx — 'use client'; useState tab selection defaulting to first bucket with emails; tab count badges with bucket color; Uncategorized tab shown only when count > 0; renders EmailList
- src/components/inbox/email-list.tsx — maps threads to EmailRow in a \<ul\> with divide-y; renders EmptyState when empty
- src/components/inbox/email-row.tsx — 3-line layout: sender+timestamp / subject+badges / snippet; isUnread → font-semibold + gold left border accent; security/confidence/tier badges
- src/components/inbox/empty-state.tsx — centered inbox SVG icon + "No emails in {bucketName}"


**Notes:** `getSessionFromCookies` added to session.ts (server-component-safe); no schema changes.

### Step 6 Patch: Conditional Gmail Link (commit: 8097e2c)
- src/app/inbox/page.tsx — passes `isDemo` from session to BucketTabs
- src/components/inbox/bucket-tabs.tsx — accepts + forwards `isDemo` to EmailList
- src/components/inbox/email-list.tsx — accepts + forwards `isDemo` to EmailRow
- src/components/inbox/email-row.tsx — `isDemo=true` → plain div (no link); `isDemo=false` → `<a>` linking to Gmail thread (`https://mail.google.com/mail/u/0/#inbox/{threadId}`) with hover styles

### Step 7: Embedding Pipeline (branch: feature/step-7-embedding)
- src/lib/utils/retry.ts — `withRetry<T>`: exponential backoff + jitter, retries on 429/5xx, max 3 attempts
- src/lib/embed/gemini-embed.ts — `buildEmbeddingInput`: formats thread as structured string; `batchEmbed(texts, userId)`: calls `gemini-embedding-001` batchEmbedContents (up to 100 texts), validates 384 dims + no NaN, logs to aiUsage
- src/lib/embed/umap-runner.ts — `runUmap`: umap-js wrapper, nComponents=2, nNeighbors=min(15,n-1), validates embeddings for NaN/non-finite, returns zeros on failure or <4 inputs
- src/lib/pipeline/embed-threads.ts — `embedThreads(userId, onProgress?)`: demo no-op guard, fetches unembedded threads, chunks to 100, embeds + writes via Promise.allSettled, runs UMAP on all user embeddings if any missing coords, returns `{ embedded, skipped, umapComplete }`
- src/app/api/embed/route.ts — POST `/api/embed`: dev endpoint, session-gated, calls embedThreads

**Notes:** `text-embedding-004` is not accessible with this API key; switched to `gemini-embedding-001` which supports batchEmbedContents and returns 384 dims. neon-http driver does not support transactions; embedding and UMAP writes use `Promise.allSettled` with per-failure logging instead.

### Step 8: Tier 0 + Tier 1 Classification (branch: feature/step-8-tier0-tier1)
- src/lib/pipeline/tier0-tier1.ts — `classifyTier0`: maps Gmail categories (Promotions/Social/Updates/Forums) to buckets, null for Primary; `classifyTier1`: 18 sender-pattern regexes (checked first) + 65-entry domain map; `runTier0AndTier1`: fetches bucketId IS NULL threads, runs both classifiers, batch-writes in chunks of 50 via Promise.allSettled
- src/app/api/tier0-tier1/route.ts — POST dev endpoint, session-gated, returns `{ tier0Count, tier1Count, totalClassified }`

**Hotfix:** Gmail sync stores categories without `CATEGORY_` prefix (e.g. `"Promotions"` not `"CATEGORY_PROMOTIONS"`); classifyTier0 updated to match actual stored values.

### Step 9: Tier 2 Semantic Classification (branch: feature/step-9-tier2)
- src/lib/pipeline/bootstrap-exemplars.ts — `bootstrapExemplars(userId)`: seeds 25 synthetic exemplars (5 per default bucket), idempotent via per-bucket count check, single batchEmbed call wrapped in withRetry, inserts via Promise.allSettled
- src/lib/pipeline/tier2.ts — `runTier2(userId, onProgress?)`: fetches bucketId IS NULL + embedded threads, chunks of 20, cosine distance query via Drizzle sql tag (`<=>`), classifies at confidence > 0.70 AND margin > 0.15, writes bucketId+tier+confidence for classified; writes confidence-only for below-threshold (Tier 3 context); returns `{ classified, flaggedForTier3 }`
- src/app/api/tier2/route.ts — POST dev endpoint: bootstraps exemplars then runs Tier 2, returns `{ exemplarsCreated, exemplarsSkipped, classified, flaggedForTier3 }`

**Patch:** Below-threshold emails now persist their computed confidence score (bucketId/tier left null) so Tier 3 has it as context.

### Step 10: Tier 3 Batch LLM Classification (branch: feature/step-10-tier3)
- src/lib/pipeline/llm-classify.ts — `classifyBatchWithFallback`: Claude (`claude-sonnet-4-5`, tool use) → Gemini (`gemini-2.0-flash`, FunctionCallingMode.ANY) → empty array; validates threadIds/bucketIds, clamps confidence; logs aiUsage with cost estimates ($3/$15 Claude, $0.10/$0.40 Gemini)
- src/lib/pipeline/tier3.ts — `runTier3`: demo guard, batches of 12, LLM classify → heuristic fallback (best exemplar without threshold) for missed items, exemplar promotion (confidence > 0.7 → categoryExemplars source='confirmed' weight=0.8); returns `{ classified, heuristicFallback, skipped }`
- src/app/api/tier3/route.ts — POST dev endpoint, session-gated

### Step 11: SSE Streaming + Classify Orchestrator (branch: feature/step-11-sse-streaming)
- src/app/api/classify/route.ts — SSE endpoint: session-gated, sync-only rate limit (60s cooldown via module-level Map), hardcoded full mode, streams PipelineEvent via ReadableStream with `data: ` prefix; passes request.signal as AbortSignal
- src/lib/pipeline/orchestrator.ts — `runPipeline`: 8-stage pipeline (sync→embed→security→tier0/1→tier2→tier3→triage→metrics); `resetForFullMode` clears classification fields + `securityFlags: []` + deletes exemplars, does NOT clear embedding/umapX/umapY; exports PipelineEvent (16-type union), PipelineMetrics, PipelineMode
- src/lib/pipeline/security-scan.ts — `runSecurityScan`: 15 regex patterns across 5 flag types (phishing, financial_fraud, suspicious_url, pii, dangerous_attachment); always writes `string[]` to securityFlags
- src/lib/pipeline/triage.ts — `runTriage`: urgency scoring with bucket base scores + additive modifiers (deadline language, isUnread, isToday, messageCount, isParticipant); only processes urgencyScore IS NULL rows
- src/lib/pipeline/tier0-tier1.ts — userId filter added to unclassified query; Tier 0 reduced to Promotions+Social only (Updates/Forums pass through to Tier 1 for better newsletter detection)
- src/lib/utils/retry.ts — `isRetryable` hardened: catches quota/overloaded/message-string errors
- src/lib/embed/gemini-embed.ts — retry base delay raised to 5000ms
- src/lib/pipeline/embed-threads.ts — inter-batch delay raised to 5000ms
- src/components/inbox/classify-button.tsx — single "Classify Inbox" button, always full mode; SSE state machine (idle→running→complete/error); complete state shows "✓ N emails classified"; only prop is `isDemo: boolean`
- src/app/inbox/page.tsx — ClassifyButton receives only `isDemo`; no hasClassifiedEmails logic
- src/app/api/sync/route.ts — updated to call `getValidAccessToken` before passing to syncGmailThreads

**Key fixes during Step 11:**
- Tier 0/1 unclassified query was missing `userId` filter — returned all users' emails
- Gemini 429 hardening: `isRetryable` catches message-string errors; 5s delays throughout
- Full mode no longer clears embeddings — re-classify reuses vectors, only re-runs classification tiers
- `securityFlags NOT NULL`: `resetForFullMode` sets `[]`, `sync.ts` always inserts `[]`
- Tier 0 Updates/Forums passthrough: newsletter senders in Updates now hit Tier 1 domain matching correctly

### Pre-Step 12: Bucket Rename Migration (branch: feature/bucket-rename)
- src/lib/db/seed-buckets.ts — "Important" → "Direct" with new description; "Can Wait" → "Updates" with new description
- src/lib/pipeline/tier0-tier1.ts — all `'Can Wait'` bucket name strings → `'Updates'`
- src/lib/pipeline/triage.ts — BUCKET_BASE scores: `Important` → `Direct`, `'Can Wait'` → `Updates`
- src/fixtures/demo-threads.json — all `bucketName: "Important"` → `"Direct"`, `"Can Wait"` → `"Updates"`
- src/scripts/rename-buckets.ts — one-time migration script: updates existing DB rows for all users, deletes stale exemplars for renamed buckets
- package.json — `rename-buckets` script added; `tsx` installed as dev dep

**Migration output:** 4 buckets renamed (2 users), 15 stale exemplars deleted.


### Step 12: Custom Buckets + Reclassification (branch: feature/step-12-custom-buckets)

**Core feature:** Users can create, edit, and delete custom buckets. On creation, the bucket is enriched via LLM (Claude generates an enriched description, boundary notes, and 3-5 full `[SUBJECT]/[FROM]/[PREVIEW]` exemplar emails). Reclassification runs as a background SSE stream — displaced emails are re-homed when a bucket is deleted.

**New files:**
- `src/lib/buckets/enrich-bucket.ts` — Claude enrichment + centroid-cosine overlap detection (>0.8 similarity → overlap_warning); generates exemplar texts in `[SUBJECT] [FROM] [PREVIEW]` format for accurate semantic matching; uses `claude-sonnet-4-6`
- `src/lib/pipeline/reclassify.ts` — two exported functions: `runReclassification` (post-create: Tier 2 semantic + Tier 3 LLM vs a specific new bucket) and `runReclassifyDisplaced` (post-delete: best-bucket-across-all for null-bucket emails); both use bulk exemplar fetch (one DB query, in-memory cosine) — zero per-email DB calls
- `src/app/api/buckets/route.ts` — GET list + fast POST create (validate + insert only, no enrichment; returns immediately in <100ms)
- `src/app/api/buckets/[id]/route.ts` — PATCH name/desc (no re-enrichment); DELETE (null displaced emails, cleanup reclassificationLog, cascade-delete exemplars, return displacedThreadIds)
- `src/app/api/buckets/[id]/reclassify/route.ts` — SSE stream: enriches bucket (Claude + embedding), handles overlap_warning, updates bucket row + inserts exemplars, runs runReclassification
- `src/app/api/buckets/[id]/exemplars/route.ts` — GET exemplars with non-null text for inline edit display
- `src/app/api/buckets/reclassify-displaced/route.ts` — SSE stream: calls runReclassifyDisplaced for post-delete reclassification
- `src/components/inbox/manage-buckets-panel.tsx` — slide-out panel: new bucket form, inline edit (name/desc + exemplar chips), two-step delete confirmation, toast; SSE-free (all async work owned by BucketTabs)
- `src/components/inbox/manage-buckets-button.tsx` — trigger button for panel
- `src/scripts/reseed-exemplars.ts` — re-seeds all missing bucket exemplars for real user
- `src/scripts/reseed-direct.ts` — deletes + re-seeds Direct/Updates exemplars with improved texts

**Modified files:**
- `src/lib/db/schema/category-exemplars.ts` — added nullable `text` column (exemplar source text)
- `src/lib/pipeline/bootstrap-exemplars.ts` — Direct exemplar texts hardcoded (8 hand-crafted `[SUBJECT]/[FROM]/[PREVIEW]` texts, weight 0.8); Updates uses platform notification patterns; `ensureExemplarsForAllBuckets` exported; SYNTHETIC_EXEMPLARS keys updated to "Direct"/"Updates"
- `src/lib/pipeline/llm-classify.ts` — `claude-sonnet-4-6`, `max_tokens: 4096`, defensive tool input parsing (bad shape → `console.error` + `return []` instead of throw), optional `systemPromptPrefix` param threaded through Claude + Gemini calls, Direct-is-sticky rule in base system prompt, Gemini model → `gemini-2.5-flash`
- `src/lib/pipeline/orchestrator.ts` — `resetForFullMode` no longer deletes exemplars; `ensureExemplarsForAllBuckets` called before Tier 2; added `overlap_warning` and `bucket_enriching` to PipelineEvent union
- `src/components/inbox/bucket-tabs.tsx` — owns all SSE reading (creation + displaced); overlap warning banner; creation progress + done banners; `handleBucketDeleted` removes tab immediately + starts displaced SSE; `startDisplacedSSE` uses `/api/buckets/reclassify-displaced`
- `src/components/inbox/classify-button.tsx` — tier3 progress counter with isWaitingForLLM state
- `src/app/inbox/page.tsx` — passes buckets to BucketTabs
- `drizzle/0002_swift_mulholland_black.sql` — migration for text column on category_exemplars

**Key architectural decisions:**
- POST create returns immediately (<100ms); all LLM work happens in SSE stream so user sees feedback within 300ms
- Overlap warning surfaces as inline banner in BucketTabs (visible even when panel is closed); "Create anyway" restarts SSE with `force=true`
- Reclassification uses bulk exemplar fetch (one query → in-memory Map) instead of per-email DB queries — evaluated 241 emails in ~50ms vs minutes
- Tier 3 candidate gates: create path `margin > 0.05 && newSim > 0.50`; delete path `sim > 0.50`; anything below skipped (not forced into LLM)
- Direct bucket is sticky: higher thresholds (0.80/0.30) to move emails out of Direct
- Reclassify context injected into Tier 3 LLM prompt for create path: tells Claude about the new bucket so it moves emails that clearly match

**DB migration:** `drizzle/0002_swift_mulholland_black.sql` — run `pnpm db:migrate` to add `text` column to `category_exemplars`.


### Post-Step 12 Patch Set A: Performance + Custom Bucket Polish (branch: feature/bucket-embedding-fast-reclassify → feature/custom-bucket-preserve)

**Motivation:** Reclassification after bucket create/edit was slow (~minutes) because it used in-memory cosine over per-email exemplar lookups. Accuracy was also off — false positives (wrong emails moving) and false negatives (custom bucket emails being zeroed on full pipeline run).

#### pgvector Reclassification Rewrite
- `src/lib/db/schema/buckets.ts` — added `embedding: vector('embedding', { dimensions: 384 })` nullable column
- `drizzle/0003_broad_spot.sql` — migration; applied
- `src/app/api/buckets/route.ts` (POST) — embeds `"name: description"` immediately after bucket insert; wrapped in try/catch (non-blocking)
- `src/app/api/buckets/[id]/reclassify/route.ts` — decoupled Claude enrichment from reclassification critical path: SSE now emits `bucket_enriching` → `runReclassification` (fast, ~200ms) → `reclassify_complete` → enrichment runs after (non-blocking to client)
- `src/lib/pipeline/reclassify.ts` — full rewrite:
  - `runReclassification`: single pgvector SQL (`<=>`) finds all emails closer to new bucket than current; tier2 `< 0.25` (direct write), tier3 `0.25–0.35` (LLM), `>= 0.35` skipped
  - `runReclassifyDisplaced`: `DISTINCT ON (c.thread_id)` SQL for best-bucket-per-displaced-email; only writes `distance < 0.25`; rows `>= 0.25` stay `bucketId=null` for full pipeline; tier3 LLM path removed entirely
- `src/scripts/embed-existing-buckets.ts` — one-time script to backfill embeddings for existing buckets; ran successfully (10 buckets)

#### Custom Bucket Preservation in Full Pipeline
- `src/lib/pipeline/orchestrator.ts` — `resetForFullMode` now scoped to default bucket IDs only (Direct/Updates/Newsletters/Promotions/Auto-Archive); custom bucket assignments survive full pipeline runs

#### UI Polish
- `src/app/globals.css` — `@utility btn-primary`, `btn-ghost`, `btn-sm`, `btn-md` with hover states + `cursor-pointer`; `@utility scrollbar-none`
- `src/components/inbox/bucket-tabs.tsx` — ClassifyButton + ManageBucketsButton in shared header row; scrollbar-none on tab row
- `src/components/inbox/manage-buckets-panel.tsx` — softer panel border/shadow; `DEFAULT_BUCKET_NAMES` set for read-only default buckets; exemplar expand/collapse toggle

#### Edit + Delete UX
- `src/app/api/buckets/[id]/route.ts` (PATCH) — detects `descriptionChanged`; if changed: clears `enrichedDescription`/`boundaryNotes`, re-embeds bucket, returns `{ ...updated, needsReclassify: true }`; (DELETE) — simplified: nulls displaced emails' classification fields, returns `{ deleted: true }` (no `displacedThreadIds`)
- `src/components/inbox/manage-buckets-panel.tsx` — `Confirm & Reclassify` gate when description changes (replaces Save/Cancel); "Yes, delete" / "Cancel" styled buttons replacing text link; `onBucketDeleted` simplified to `(bucketId, bucketName)` (no `displacedThreadIds`)
- `src/components/inbox/bucket-tabs.tsx` — `handleBucketUpdated` triggers `startCreationSSE` for description-change reclassification; `handleBucketDeleted` immediately switches to Direct tab; `handleBucketCreated` immediately switches to new bucket tab; `startDisplacedSSE` removed entirely; after delete, triggers full classify pipeline via `classifyButtonRef`
- `src/components/inbox/classify-button.tsx` — `forwardRef` + `useImperativeHandle` exposing `ClassifyButtonHandle { startClassify }` so BucketTabs can trigger full classify after bucket deletion; always-visible button with 3s auto-reset to idle after complete
- `src/app/api/buckets/reclassify-displaced/route.ts` — gutted (returns 410 Gone; no longer called)

**DB migration:** `drizzle/0003_broad_spot.sql` — adds `embedding vector(384)` to `buckets` table. Run `pnpm db:migrate`.

### Post-Step 12 Patch Set B: UI Polish + Speed Fix (branch: feature/ui-polish-and-speed-fix)

**Verified:** SSE reclassify route order is correct — `runReclassification` fires immediately, Claude enrichment runs after `reclassify_complete`. No code change needed; decoupling was already in place.

**Modified files:**
- `src/app/globals.css` — added `.scrollbar-hide` as plain CSS (not `@utility`) for reliable cross-browser scrollbar suppression
- `src/components/inbox/bucket-tabs.tsx` — `scrollbar-none` → `scrollbar-hide` on tab row; `hover:bg-secondary` on inactive tabs only (active tab has no hover bg)
- `src/components/inbox/manage-buckets-panel.tsx`:
  - Panel: deeper shadow (`0 8px 40px` + `0 2px 8px` two-layer), border opacity 0.4 → 0.25 for floating appearance
  - Fixed `heading-sm` → `heading-md` (heading-sm was undefined)
  - Idle bucket rows: full row is now click target for custom buckets (`cursor-pointer hover:bg-secondary` + `onClick → openEdit`); `✎` demoted to `<span>` since row handles click
  - Exemplar section: "Examples" uppercase label added above chips; collapsed = single-line `truncate`; expanded = `pre-wrap break-word`; `(no text)` fallback added

### Post-Step 12 Patch Set C: Exemplar Backfill + Vercel Enrichment Fix (branch: feature/reclassify-eviction-parallel)

**Motivation:** Enrichment was being killed on Vercel because it ran after `controller.close()` — the serverless function terminates immediately when the stream closes. Custom bucket exemplars were never being created in production, leaving eviction blind and Tier 2 matching unable to find exemplar rows.

**Modified files:**
- `src/app/api/buckets/[id]/reclassify/route.ts` — major rework:
  - Query exemplar count before stream starts
  - Gate condition changed from `!bucket.enrichedDescription` to `needsEnrichment = !bucket.enrichedDescription || exemplarCount === 0` — re-enriches whenever exemplars are missing, even if `enrichedDescription` was previously saved (handles partial-success from prior Vercel kills)
  - Enrichment moved inside stream using `Promise.all([runReclassification, enrichBucket])` — both finish before `controller.close()`, guaranteeing Vercel doesn't kill enrichment
  - Added `DELETE FROM category_exemplars WHERE bucket_id = $id` before fresh exemplar inserts to prevent duplicate rows on re-enrich
  - Overlap warning now emitted via SSE if enrichment detects conflict
  - Added `count` import from drizzle-orm
- `src/lib/pipeline/orchestrator.ts` — added `reclassify_progress` and `eviction_complete` to `PipelineEvent` union
- `src/lib/pipeline/reclassify.ts` — rewrite:
  - Ingest pass via single pgvector SQL (tier2 `< 0.25` direct, tier3 `0.25–0.35` LLM, `>= 0.35` skip)
  - Tier 3 LLM batches run in `Promise.all` (parallel, not sequential)
  - Eviction pass: CTE on `categoryExemplars` (not bucket centroid embedding) — emails are evicted when `MIN(ce.embedding <=> c.embedding) > 0.40`; best alt bucket found via CROSS JOIN; reassigned if `bestDist < 0.30`, otherwise nulled
  - Emits `reclassify_progress`, `eviction_complete`, `reclassify_complete`
- `src/components/inbox/bucket-tabs.tsx`:
  - `CreationStatus` and `OverlapWarning` interfaces now include `isEdit: boolean`
  - Banner verb: "Creating" vs "Updating" based on `isEdit`
  - `handleBucketSaved(bucketId, name)` updates local bucket state immediately on rename (fixes stale tab names)
  - `reclassify_progress` SSE event handled — transitions banner from "Setting up" to live counters
  - `panelBuckets` now passes real `description` (was hardcoded null)
- `src/components/inbox/manage-buckets-panel.tsx` — added `onBucketSaved?(bucketId, name)` callback; fires immediately after successful save before reclassification starts
- `src/app/inbox/page.tsx` — added `description: buckets.description` to server-side bucket query
- `src/scripts/check-exemplars.ts` — new diagnostic script: reports all buckets' exemplar counts and text coverage; flags custom buckets with 0 exemplars for backfill

**Diagnostic findings:**
- All exemplar rows have `text = null` — `enrichedDescription` is `NULL` for all buckets including Good Reads
- Good Reads has 14 exemplar rows (vectors present, no text) from a partial enrichment that completed locally but wrote no `enrichedDescription`
- `needsEnrichment` will fire for Good Reads on next reclassify trigger; stale rows will be deleted and replaced with fresh exemplars including text

**To backfill Good Reads:** open Manage Buckets, edit description, save — PATCH clears `enrichedDescription`, reclassify SSE fires, enrichment now runs inside stream before close.

### Step 13: D3 Cluster Visualization (branch: feature/step-13-d3-graph)

**New files:**
- `src/app/api/graph-data/route.ts` — GET, session-gated; returns `EmailNode[]` JSON
- `src/lib/inbox/get-graph-data.ts` — `getGraphData(userId)`: inner-joins classifications + buckets, filters to rows where `umapX/umapY/bucketId` are non-null, null-safe fallbacks on all fields
- `src/components/graph/graph-utils.ts` — pure TS helpers: `urgencyToRadius` (6–20px), `recencyToOpacity` (today=1.0, 7d+=0.3 linear), `tierToStroke`/`tierToStrokeWidth` (tier 2=yellow, tier 3=red), `computeClusterCentroids`, `computeFitTransform` (bbox → scale+translate for fit-to-view)
- `src/components/graph/email-graph.tsx` — D3 force graph (195 lines): UMAP normalization to [30%,70%] canvas range, custom cluster force (strength 0.15×alpha×confidence), collision + center + charge (-8) forces, alphaDecay 0.03; security badge overlays; cluster labels (paint-order stroke halo) appended after nodes; animated fit-to-view on simulation end (900ms easeCubicOut); zoom 0.5–6x; 80ms mouseout grace period for tooltip flicker prevention
- `src/components/graph/graph-tooltip.tsx` — portal tooltip (createPortal → document.body, fixed positioning); always in DOM with opacity transition (180ms); right-edge and top-edge viewport flip; three-zone layout (header/snippet/meta) using CSS variables from STYLE.md; timestamp via `formatTimestamp`
- `src/components/graph/graph-view.tsx` — fetches `/api/graph-data` on mount; ResizeObserver for responsive dimensions (`height = max(520, innerHeight - 160)`); loading spinner; empty state when no UMAP coords; border + shadow container; instructions line below

**Modified files:**
- `src/components/inbox/bucket-tabs.tsx` — list/graph toggle in header (SVG icons, `var(--bg-tertiary)` active state); `view === 'graph'` renders `<GraphView />` replacing tab+list content

**Key decisions:**
- Graph background uses `var(--bg-primary)` (cream) — consistent with inbox
- Tooltip background uses `var(--bg-elevated)` with `var(--border-default)` border — fully style-system aligned
- Tooltip text colors, tier badges, urgency dots all reference STYLE.md CSS variables
- `computeFitTransform` extracted to graph-utils to keep email-graph.tsx under 200 lines
- Portal tooltip escapes `overflow:hidden` container — no clipping at graph edges

### Step 14: D3 Filter Panel + Graph Polish (branch: dev)

**New files:**
- `src/components/graph/filter-types.ts` — `FilterState` interface (`keyword`, `activeBucketIds: Set<number>`, `minConfidence`, `maxConfidence`, `minUrgency`, `nodeSizeMultiplier`, `textFadeZoom`) + `DEFAULT_FILTER_STATE`
- `src/components/graph/filter-panel.tsx` — right-side classifications panel (260px); "Classifications" fixed title; collapsible Legend (border ring key + visual encoding icons), Filters (keyword search, bucket toggles, confidence/urgency sliders), Display (node size slider); reset button with `isNonDefault` gate; `scrollbar-hide` on inner scroll div; `Toggle`, `SliderRow`, `SectionHeader`, `Dot`, `EncodingIcon`, `LegendRow` sub-components all at module scope

**Modified files:**
- `src/components/graph/graph-view.tsx` — added `filterState` state; flex-row layout (graph `flex:1` + 260px panel); `ResizeObserver` on graph div only (not full parent); initial `dimensions = { width: 800, height: 600 }` fallback; `useMemo` derives sorted unique `buckets` array from nodes; `FilterPanel` wired to `filterState`
- `src/components/graph/email-graph.tsx` — accepts `filterState` prop; SVG resize `useEffect` syncs attrs when width/height change; UMAP normalization range tightened to `[20%, 80%]`; cluster force hardcoded at `0.35`; filter effect applies opacity (0.05 faded) + stroke-opacity + badge opacity with 200ms transitions; cluster labels always `opacity: 1` (no zoom-conditional fade); main effect deps `[nodes, width, height]` rebuild simulation on resize
- `src/lib/inbox/get-graph-data.ts` — removed `isNotNull(umapX/Y)` from WHERE clause (emails without UMAP coords now included); fallback `?? 0` for `umapX`/`umapY` in row mapping; diagnostic `console.log` reports total returned + how many were missing UMAP coords; deduplicated `and` import

**Key decisions:**
- Default bucket emails (classified by tier0/1 via domain rules, no embedding required) could have null UMAP if embedding partially failed; removing the UMAP null filter ensures they appear in the graph with D3 force spreading them from (0,0)
- `clusterSpread` removed from FilterState entirely — hardcoded at 0.35; reduces panel complexity
- No simulation restart for filter changes — filter effect is opacity/radius only (no drift)
- `EncodingIcon` defined at module scope (not inside render) to satisfy react-hooks/static-components lint rule

### Post-Step 14 Patch Set: Auto-Sync Fix + Job Alerts Debug + Quality Gate (branch: feature/bucket-create-quality-gate)

#### Auto-Sync Fix + New User Onboarding
- `src/app/api/classify/route.ts` — removed `lastSyncTime = new Map<number, number>()` and `SYNC_RATE_LIMIT_MS = 60_000`; inverted logic was skipping sync within 60s of last run; now always passes `false` (skipSync) to `runPipeline`
- `src/app/inbox/page.tsx` — computes `autoClassify = !session.isDemo && threads.length === 0`; passes `autoClassify` prop to `BucketTabs`; new users with 0 emails auto-trigger classify on page load
- `src/components/inbox/bucket-tabs.tsx` — added `autoClassify?: boolean` prop; `useEffect` with 500ms delay calls `classifyButtonRef.current?.startClassify()` when `autoClassify` is true

#### Job Alerts Root Cause Fixes (absolute distance threshold)
- `src/lib/pipeline/reclassify.ts` — full rewrite of ingest pass:
  - Old query joined on `cb.embedding IS NOT NULL` — failed silently when default buckets had no embeddings
  - New query: absolute distance threshold `< 0.35` on `classifications.embedding <=> bucket.embedding`; no join on current bucket, uses bucket-level vector directly
  - Tier 2 (dist `< 0.22`): direct write, emits `classification_result` per email immediately
  - Tier 3 (`0.22–0.35`): parallel LLM batches via `Promise.all`; emits `classification_result` per confirmed email as batches resolve (quality gate — LLM-rejected emails not written)
  - Eviction pass unchanged (exemplar-based `> 0.40` threshold)
- `src/scripts/embed-existing-buckets.ts` — ran to backfill embeddings for 5 default buckets (132–136) that had `embedding = NULL`

#### Enrichment: Claude → Gemini + Flattened Interface
- `src/lib/buckets/enrich-bucket.ts` — switched from Claude to Gemini 2.5 Flash with `FunctionCallingMode.ANY` for structured output; flattened `EnrichResult` from discriminated union to plain interface:
  ```typescript
  export interface EnrichResult {
    enrichedDescription: string; boundaryNotes: string;
    exemplarVectors: number[][]; exemplarTexts: string[];
    overlapping: boolean; conflictingBucketName?: string; similarity?: number;
  }
  ```
  Overlap is now a warning flag (`overlapping: boolean`) — exemplars always saved regardless; overlap threshold raised to `> 0.88`; step-level console.logs throughout
- `src/app/api/buckets/[id]/reclassify/route.ts` — `enrichAndSave` extracted as standalone async function; stream runs `Promise.all([runReclassification(emit), needsEnrichment ? enrichAndSave(...) : Promise.resolve()])`; enrichment silent (no emit), everything completes before `controller.close()`

#### Two-Pass Bucket Creation Quality Gate
- `src/components/inbox/bucket-tabs.tsx`:
  - Added `isClassifyRunning` state, wired via `onRunningChange` callback from ClassifyButton
  - Added `localBucketOverrides: Map<string, number>` for live classification results (avoids premature `router.refresh()` during active SSE)
  - `effectiveBucketId` helper used in both `countFor` and `filteredThreads`
  - `CreationStatus` interface: added `bucketId: number` and `hasFirstResult: boolean` fields
  - `classification_result` SSE handler: adds to `localBucketOverrides`, increments moved, sets `hasFirstResult = true`
  - `reclassify_complete` handler: clears `localBucketOverrides`, simple done label
  - Inline reviewing notice above `<EmailList>`: pulsing dot + "Showing best matches · AI is reviewing more…" — only visible while stream active and at least one result arrived
- `src/lib/pipeline/orchestrator.ts` — `reclassify_complete` event updated: `{ type: 'reclassify_complete'; movedCount: number; tier3Count: number; hasMore?: boolean }`

#### Manage Buckets Disable During Classify
- `src/components/inbox/manage-buckets-button.tsx` — added `isDisabled?: boolean` prop; when disabled: `onClick={undefined}`, `title="Classification in progress…"`, `cursor: not-allowed`, `opacity: 0.5`
- `src/components/inbox/classify-button.tsx` — added `onRunningChange?: (isRunning: boolean) => void` prop; calls `onRunningChange?.(true)` at start of `startClassify`; calls `onRunningChange?.(false)` on `pipeline_complete` and `error` events
- `package.json` / `pnpm-lock.yaml` — added `@vercel/functions` (installed for `waitUntil` exploration, kept as dependency)

### Step 15: Drag-to-Reclassify (branch: feature/step-15-drag-reclassify)

**New files:**
- `src/app/api/reclassify/route.ts` — POST, session-gated; validates threadId + newBucketId belong to user; updates classification (tier=1, confidence=1.0); inserts `categoryExemplars` row (source='manual', weight=1.0); logs to `reclassificationLog` (source='manual_drag') when fromBucketId is non-null; re-evaluates top 10 nearby ambiguous neighbors (confidence < 0.70) via pgvector distance ordering + Tier 2 resolveClassification logic; returns `{ success, reEvaluated: { threadId, newBucketId }[] }`
- `src/components/graph/drag-behavior.ts` — pure D3/TS (no React); `DragNode` interface; `setupDragBehavior<N>` function: attaches `d3.drag()` to circles, manages centroid ring circles (r=28, pulse 28→34→28 on hover target), tracks `originalBucket`/`highlightedBucket` in closure refs, optimistically updates node fill color on drop, calls `onDrop` callback; rings positioned at centroid locations computed at dragstart

**Modified files:**
- `src/components/graph/email-graph.tsx` — full rewrite to stay under 200 lines (199 lines); added `onReclassify?` prop; creates `ringsG` group before `nodesG`; calls `setupDragBehavior` when `onReclassify` provided; cursor `grab` when drag enabled
- `src/components/graph/graph-view.tsx` — added `isDemo?: boolean` prop; toast state (`{ message, visible }`); `handleReclassify` callback: shows toast, skips API in demo mode, calls `POST /api/reclassify`, applies `reEvaluated` node updates to local state; toast UI fixed bottom-center with CSS slide-up transition, 3s auto-dismiss; instructions line updated to mention drag
- `src/components/inbox/bucket-tabs.tsx` — threads `isDemo` to `<GraphView isDemo={isDemo} />`

### Step 18: Pipeline Metrics Panel + Patches (branch: feature/step-18-metrics-panel)

**New files:**
- `src/components/graph/metrics-panel.tsx` — "Pipeline Performance" heading; 6-card 3-col grid; pulse placeholders while running; cards: AI Efficiency (%), Classification Method (tier breakdown with counts), Total AI Operations, Avg Confidence (per-tier breakdown), Exemplars (with per-bucket subtext), Processing Time; System Methodology legend below; CSS variables throughout

**Modified files:**
- `src/lib/pipeline/orchestrator.ts` — `PipelineMetrics` type: added `exemplarsByBucket?: { bucketName; count }[]`, `avgConfidenceByTier: { tier; avg }[]`; removed `estimatedCost`; `computeMetrics` filters `aiUsage` by `createdAt >= runStart` so llmCalls reflects this run only; added per-bucket exemplar query (join + groupBy); added `AVG(confidence) GROUP BY tier` query; imports: `gte`, `sql`, `isNotNull` added; `sum` removed
- `src/lib/pipeline/llm-classify.ts` — fixed Gemini 2.5 Flash pricing: `0.10/0.40` → `0.15/0.60` per million tokens
- `src/components/graph/graph-view.tsx` — added `metrics?: PipelineMetrics | null` and `isRunning?: boolean` props; renders `<MetricsPanel>` below graph container
- `src/components/inbox/bucket-tabs.tsx` — added `pipelineMetrics` state; `onRunningChange` clears metrics on run start; added `onMetrics={setPipelineMetrics}` to ClassifyButton; passes `metrics` + `isRunning` to GraphView
- `src/components/inbox/classify-button.tsx` — added `onMetrics?: (m: PipelineMetrics) => void`; fires on `pipeline_complete`

### Step 19A: Error Handling + Edge Cases (branch: feature/step-19a-error-handling)

**New files:**
- `src/app/not-found.tsx` — 404 page: centered full-viewport layout; "404" in Fraunces (`var(--font-heading)`) at 6rem; "This page doesn't exist."; "Return to Dashboard" link → `/inbox`; CSS variables throughout; server component
- `src/components/ui/error-boundary.tsx` — React class component with `getDerivedStateFromError`; fallback UI: "Something went wrong" heading, error message in `<code>`, "Reload page" button (`window.location.reload()`); CSS variables, no Tailwind; `'use client'` directive

**Modified files:**
- `src/app/inbox/page.tsx` — imports `ErrorBoundary`; wraps `<BucketTabs>` in `<ErrorBoundary>`
- `src/app/api/classify/route.ts` — clean, no rate limiting (trusts authenticated user)
- `src/app/api/graph-data/route.ts` — `getGraphData` wrapped in try/catch; returns 500 `{ error: 'Failed to load graph data' }` on DB failure
- `src/app/api/buckets/route.ts` — POST JSON parse catch returns 400 `{ error: 'Invalid request body' }` instead of silently using defaults
- `src/app/api/buckets/[id]/route.ts` — PATCH JSON parse catch returns 400 `{ error: 'Invalid request body' }`
- `src/components/graph/email-graph.tsx` — added `allFiltered` React state; filter effect calls `setAllFiltered(simNodes.filter(passes).length === 0)`; SVG renders centered `<text>` "No emails match the current filters" in `var(--text-tertiary)` when `allFiltered && nodes.length > 0`

## Current File Tree
```
src/
  app/
    api/
      auth/callback/route.ts
      auth/demo/route.ts
      auth/google/route.ts
      auth/signout/route.ts
      buckets/[id]/exemplars/route.ts
      buckets/[id]/reclassify/route.ts
      buckets/[id]/route.ts
      buckets/reclassify-displaced/route.ts  ← gutted (410)
      buckets/route.ts
      classify/route.ts
      embed/route.ts
      graph-data/route.ts
      reclassify/route.ts
      sync/route.ts
      tier0-tier1/route.ts
      tier2/route.ts
      tier3/route.ts
    globals.css
    inbox/loading.tsx
    inbox/page.tsx
    layout.tsx
    not-found.tsx
    page.tsx
  components/
    graph/
      drag-behavior.ts
      email-graph.tsx
      filter-panel.tsx
      filter-types.ts
      graph-tooltip.tsx
      graph-utils.ts
      graph-view.tsx
      metrics-panel.tsx
    inbox/
      bucket-tabs.tsx
      classify-button.tsx
      email-list.tsx
      email-row.tsx
      empty-state.tsx
      manage-buckets-button.tsx
      manage-buckets-panel.tsx
    ui/
      button.tsx
      error-boundary.tsx
  fixtures/demo-threads.json
  lib/
    buckets/enrich-bucket.ts
    db/index.ts
    db/schema/ai-usage.ts
    db/schema/buckets.ts
    db/schema/category-exemplars.ts
    db/schema/classifications.ts
    db/schema/index.ts
    db/schema/reclassification-log.ts
    db/schema/relations.ts
    db/schema/users.ts
    db/seed-buckets.ts
    db/seed-demo.ts
    db/setup.ts
    db/vector.ts
    embed/gemini-embed.ts
    embed/umap-runner.ts
    gmail/client.ts
    gmail/sync.ts
    google/auth.ts
    inbox/format-timestamp.ts
    inbox/get-graph-data.ts
    inbox/get-inbox-threads.ts
    pipeline/bootstrap-exemplars.ts
    pipeline/embed-threads.ts
    pipeline/llm-classify.ts
    pipeline/orchestrator.ts
    pipeline/reclassify.ts
    pipeline/security-scan.ts
    pipeline/tier0-tier1.ts
    pipeline/tier2.ts
    pipeline/tier3.ts
    pipeline/triage.ts
    session.ts
    utils/retry.ts
  scripts/
    check-exemplars.ts
    embed-existing-buckets.ts
    rename-buckets.ts
    reseed-direct.ts
    reseed-exemplars.ts
```

## Known Issues
(none)

## Notes
- Update this file after completing each step in PLAN.md
