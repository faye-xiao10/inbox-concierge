# Built

## Current Status
Steps 1–8 + style system complete. Ready to build Step 9.

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

## Current File Tree
```
src/
  app/
    api/
      auth/
        callback/route.ts
        demo/route.ts
        google/route.ts
        signout/route.ts
      embed/route.ts
      sync/route.ts
      tier0-tier1/route.ts
    globals.css
    inbox/
      loading.tsx
      page.tsx
    layout.tsx
    page.tsx
  components/
    inbox/
      bucket-tabs.tsx
      email-list.tsx
      email-row.tsx
      empty-state.tsx
    ui/
      button.tsx
  fixtures/
    demo-threads.json
  lib/
    db/
      index.ts
      seed-buckets.ts
      seed-demo.ts
      setup.ts
      vector.ts
      schema/
        index.ts
        users.ts
        buckets.ts
        category-exemplars.ts
        classifications.ts
        reclassification-log.ts
        ai-usage.ts
        relations.ts
    embed/
      gemini-embed.ts
      umap-runner.ts
    gmail/
      client.ts
      sync.ts
    google/
      auth.ts
    inbox/
      format-timestamp.ts
      get-inbox-threads.ts
    pipeline/
      embed-threads.ts
      tier0-tier1.ts
    session.ts
    utils/
      retry.ts
```

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

## Known Issues
(none)

## Notes
- Update this file after completing each step in PLAN.md
