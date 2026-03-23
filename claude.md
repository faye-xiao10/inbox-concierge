# CLAUDE.md

## Project
AI-powered Gmail triage that classifies your inbox into smart buckets using a 4-tier pipeline (Gmail categories, domain matching, semantic similarity, batch LLM) with a D3 force-directed cluster visualization. Built as a take-home for Tenex Forward Deployed Engineer role.

## Stack
Next.js (App Router), React 19, TypeScript, Drizzle ORM, Neon Postgres + pgvector, Claude Sonnet 4 + Gemini 2.0 Flash, Gemini embedding-001, umap-js, D3.js, JOSE/JWT, Tailwind CSS + Framer Motion, ESLint + Prettier, deployed to Vercel.



## Conventions
- Path alias: `@/` -> `src/`
- Server components by default, client components only for interactivity
- All LLM calls use tool use (not prompt-based JSON)
- All API keys go through server-side routes, never expose to client
- Drizzle schema in `src/db/schema/`, one file per table
- One file per pipeline tier in `src/lib/pipeline/`. No god files. Keep files under 200 lines.
- Every external API call wrapped in try/catch with meaningful error messages
- Descriptive variable names. No abbreviations except db, req, res.

## Commands
```bash
pnpm dev
pnpm build
pnpm lint
pnpm format
pnpm tsc --noEmit
pnpm db:migrate
```

## Branching
- New features go on `feature/[name]` branches, merge into `dev`, never directly to `main`
- Descriptive commit messages summarizing what changed and why
- Always check current branch with `git branch` before making changes. If on main, create `feature/[name]` first.

## Session Protocol
Start of every session: Read `.claude/docs/built.md` to understand current project state before doing anything else.

End of every feature:
1. Run `find src -type f | sort` to get current file tree
2. Update `.claude/docs/built.md` with what was built, files changed, and refreshed file tree
3. Update `.claude/docs/data-model.md` if any tables, fields, or indexes changed
4. Run `pnpm lint` and `pnpm tsc --noEmit`, fix any errors
5. Commit doc updates along with the feature commit

Trigger phrases ("wrap up", "done", "update docs", "end of feature") = run end-of-feature protocol immediately.


## Additional Docs
Before starting any task, check if relevant docs exist in `.claude/docs/`:
- `PLAN.md` -- build order + acceptance criteria
- `ARCHITECTURE.md` -- pipeline, D3, API routes, data flow
- `DATA_MODEL.md` -- Drizzle schema and table relationships
- `BUILT.md` -- current progress and file tree

Read `DATA_MODEL.md` when writing queries or schema. Read `ARCHITECTURE.md` if unclear on how a feature connects to the pipeline or D3 layer.

## Environment Variables
Never log, echo, or commit env values. Core vars include: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `NEXT_PUBLIC_URL`. See `.env.local.example` for the full list.

## Linting

ESLint + Prettier configured at project init. Enforced on every file:
- `pnpm lint` -- ESLint
- `pnpm format` -- Prettier
- `pnpm tsc --noEmit` -- Type check