# Built

## Current Status
Steps 1–4 + style system complete. Ready to build Step 5 (Gmail sync / pipeline tier 1).

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
    globals.css
    layout.tsx
    page.tsx
  components/
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
    google/
      auth.ts
    session.ts
```

## Known Issues
(none)

## Notes
- Update this file after completing each step in PLAN.md
