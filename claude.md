# CLAUDE.md

## Project
AI-powered Gmail triage. 4-tier classification pipeline (Gmail categories → domain matching → semantic similarity → batch LLM). D3 force-directed cluster visualization. Take-home for Tenex FDE role.

## Stack
Next.js App Router · React 19 · TypeScript · Drizzle ORM · Neon Postgres + pgvector · Claude Sonnet 4 + Gemini 2.0 Flash · Gemini embedding-001 · umap-js · D3.js · JOSE/JWT · Tailwind CSS · Framer Motion · Vercel

## Commands
```bash
pnpm dev / build / lint / format
pnpm tsc --noEmit
pnpm db:generate / db:migrate / db:studio
```

## Conventions
- `@/` → `src/`
- Server components by default; `'use client'` only for interactivity
- All LLM calls use tool use, never prompt-based JSON
- API keys server-side only, never exposed to client
- Drizzle schema: `src/db/schema/`, one file per table
- Pipeline tiers: `src/lib/pipeline/`, one file per tier, max 200 lines per file
- Every external API call in try/catch with meaningful error messages
- Descriptive variable names, no abbreviations except: db, req, res, tx
- All UI follows `STYLE.md` — no ad-hoc colors or spacing

## Branching
- Features on `feature/[name]` → merge to `dev` → never direct to `main`
- Always run `git branch` before starting. If on main/dev, create feature branch first.

## Session Protocol

**Start of session:**
1. Read `BUILT.md` to understand current state
2. Only read additional docs if needed for this specific step:
   - Writing queries or schema changes → read `DATA_MODEL.md`
   - Unclear on pipeline/API connections → read `ARCHITECTURE.md`
   - Building UI → read `STYLE.md`
   - Don't read docs you don't need

**During session:**
- Run `/cost` periodically to monitor context usage

**End of session** (triggers: "wrap up", "done", "update docs", "end of feature"):
1. `pnpm lint && pnpm tsc --noEmit` — fix all errors
2. `find src -type f | sort` — get current file tree
3. Update `BUILT.md`: what was built, files changed, current file tree
4. Update `DATA_MODEL.md` only if schema changed
5. 5. `git add -A` then ONE commit with everything — feature files + docs together. Format: "feat/fix/docs/refactor: Step N — description" + bullet points per file.

## Docs (load only what's needed)
| File | Load when |
|------|-----------|
| `PLAN.md` | Starting a new step, checking acceptance criteria |
| `ARCHITECTURE.md` | Unclear how a feature connects to pipeline or D3 |
| `DATA_MODEL.md` | Writing queries, migrations, or schema changes |
| `BUILT.md` | Start of every session (always) |
| `STYLE.md` | Building any UI component |

## Environment Variables
Never log, echo, or commit values. See `.env.local.example` for full list.
Core: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `NEXT_PUBLIC_URL`