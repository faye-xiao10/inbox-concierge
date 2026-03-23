# Built

## Current Status
Steps 1–2 + style system complete. Ready to build Step 3 (Google OAuth).

## Completed Steps

### Step 1: Scaffold + Tooling (commit: f154fbb)
- Initialized Next.js 16 with App Router, TypeScript, Tailwind CSS 4, ESLint, src/ dir, `@/*` alias
- Installed all deps: drizzle-orm, drizzle-kit, @neondatabase/serverless, pg, jose, framer-motion, d3, @types/d3, umap-js, @anthropic-ai/sdk, @google/generative-ai, prettier, eslint-config-prettier
- Added scripts: db:generate, db:migrate, db:studio, format, typecheck
- Created drizzle.config.ts, src/lib/db/index.ts, .env.local.example, .prettierrc, eslint.config.mjs
- Placeholder home page

**Notable adaptations:**
- Next.js 16 removed `next lint` — lint script uses `eslint src` directly
- ESLint pinned to 9.x (eslint-plugin-react incompatible with ESLint 10)
- Tailwind 4 uses `@import 'tailwindcss'` in globals.css (no tailwind.config.js needed)

### Style System (commit: 91542cd)
- Loaded Fraunces/Source Sans 3/JetBrains Mono via next/font/google
- globals.css: all STYLE.md CSS vars in `:root`; `@theme` for accent/semantic/font/shadow/radius; `@utility` for bg-primary/secondary/tertiary/elevated, text-primary/secondary/tertiary, border-default/subtle, typography classes
- src/components/ui/button.tsx: Primary, Secondary, Ghost variants; sm/md/lg sizes; forwardRef; 150ms transitions

**Tailwind v4 note:** No tailwind.config.ts — theme extension via `@theme` and `@utility` in CSS.

### Step 2: DB Schema (commit: 3b20421, branch: feature/step-2-schema)
- Schema split into src/lib/db/schema/ (one file per table)
- `src/lib/db/vector.ts`: custom `vector(n)` type via drizzle `customType` for pgvector
- `src/lib/db/setup.ts`: `setupExtensions()` — runs `CREATE EXTENSION IF NOT EXISTS vector`
- `drizzle/setup.sql`: documents vector ext + HNSW index upgrade SQL (must run before migrations)
- `drizzle.config.ts`: updated to point at schema/index.ts
- `src/lib/db/index.ts`: passes schema to drizzle() for relations support
- Migration generated: `drizzle/0000_clean_typhoid_mary.sql`

**HNSW index note:** The generated migration creates a btree index on `classifications.embedding`. Before production use, replace it with:
```sql
DROP INDEX IF EXISTS classifications_embedding_idx;
CREATE INDEX classifications_embedding_hnsw_idx
  ON classifications USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```
See `drizzle/setup.sql` for the full SQL.

## Current File Tree
```
src/
  app/
    globals.css
    layout.tsx
    page.tsx
  components/
    ui/
      button.tsx
  lib/
    db/
      index.ts
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
```

## Known Issues
(none)

## Notes
- Update this file after completing each step in PLAN.md
