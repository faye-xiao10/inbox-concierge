# Built

## Current Status
Step 1 complete: scaffold and tooling are in place. Ready to build Step 2 (DB schema + migrations).

## Completed Steps

### Step 1: Scaffold + Tooling (commit: f154fbb)
- Initialized Next.js 16 with App Router, TypeScript, Tailwind CSS 4, ESLint, src/ dir, `@/*` alias
- Installed all deps: drizzle-orm, drizzle-kit, @neondatabase/serverless, pg, jose, framer-motion, d3, @types/d3, umap-js, @anthropic-ai/sdk, @google/generative-ai, prettier, eslint-config-prettier
- Added scripts: db:generate, db:migrate, db:studio, format, typecheck
- Created drizzle.config.ts (schema: src/lib/db/schema.ts, dialect: postgresql, out: ./drizzle)
- Created src/lib/db/index.ts (drizzle instance via neon-http)
- Created src/lib/db/schema.ts (placeholder)
- Created .env.local.example
- Created .prettierrc (semi, singleQuote, tabWidth: 2, trailingComma: all)
- Created eslint.config.mjs (flat config: eslint-config-next + eslint-config-prettier)
- Placeholder home page: "Inbox Concierge" / "Coming soon"

**Notable adaptations:**
- Next.js 16 removed `next lint` CLI command — lint script uses `eslint src` directly
- ESLint pinned to 9.x (eslint-plugin-react incompatible with ESLint 10)
- Tailwind 4 uses `@import 'tailwindcss'` in globals.css (no tailwind.config.js needed)

## Current File Tree
```
src/
  app/
    globals.css
    layout.tsx
    page.tsx
  lib/
    db/
      index.ts
      schema.ts
```

## Known Issues
(none)

## Notes
- Update this file after completing each step in PLAN.md
