# BUILT.md

## Current State
Full-stack AI email triage app. All pipeline tiers implemented and connected. Landing page, inbox view (list + graph), demo mode, reclassification, bucket management all working. Step 20 polish pass complete — ready for submission.

## What Was Built

### Step 20 — Final Polish + Ship
- Fixed all `as any` types in `metrics-panel.tsx` (Card, TierRow, MethodologyItem now have proper interfaces)
- Removed all debug `console.log` calls from non-script source files; kept `console.error` in catch blocks and `console.warn` for operational fallback paths
- Created `src/app/error.tsx` — root App Router error boundary with "Try again" reset button
- Created `src/app/inbox/error.tsx` — inbox-specific error boundary with "Try again" reset button
- Added mobile screen detection to `graph-view.tsx` — shows "Graph view requires a larger screen" message at < 768px instead of rendering the D3 canvas
- Removed dead commented-out useEffect in `bucket-tabs.tsx`
- Zero lint errors, zero TypeScript errors

### Step 19a — Error Handling + Security Scan
- Error boundaries at component and route level
- Security scan pipeline integrated
- Retry utility for LLM calls

### Step 18 — Metrics Panel
- PipelineMetrics type + MetricsPanel component
- Pipeline efficiency, tier breakdown, confidence by tier, processing time cards
- Methodology explainer section

### Step 15 — Drag Reclassify
- D3 drag behavior on graph nodes
- Drag to reclassify: moves email to nearest bucket centroid
- Optimistic local state + server write with re-evaluated cascade

### Core Pipeline (Steps 1–14)
- 4-tier classification: Gmail labels (T0) → domain rules (T1) → pgvector similarity (T2) → Claude Sonnet batch LLM (T3)
- Gemini embedding-001 for semantic vectors + umap-js for 2D projection
- D3 force-directed cluster visualization with filter panel
- SSE streaming for real-time bucket creation progress
- Manage Buckets panel: create, edit, delete custom buckets with Gemini enrichment + overlap detection
- Demo mode with 20 fixture emails (no Gmail auth required)
- Google OAuth → JWT session → Neon Postgres (Drizzle ORM)

## Files Changed (Step 20)
- `src/app/error.tsx` — **new** root error boundary
- `src/app/inbox/error.tsx` — **new** inbox error boundary
- `src/components/graph/metrics-panel.tsx` — typed interfaces replacing `as any`
- `src/components/graph/graph-view.tsx` — mobile screen guard (< 768px fallback)
- `src/components/inbox/bucket-tabs.tsx` — removed debug console.logs + dead code
- `src/lib/buckets/enrich-bucket.ts` — removed debug console.logs
- `src/lib/pipeline/reclassify.ts` — removed debug console.logs
- `src/lib/pipeline/bootstrap-exemplars.ts` — console.log → console.warn
- `src/lib/inbox/get-graph-data.ts` — removed debug console.logs
- `src/app/api/buckets/[id]/reclassify/route.ts` — removed debug console.logs
- `src/app/api/tier0-tier1/route.ts` — console.log → console.warn

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
      buckets/reclassify-displaced/route.ts
      buckets/route.ts
      classify/route.ts
      embed/route.ts
      graph-data/route.ts
      reclassify/route.ts
      sync/route.ts
      tier0-tier1/route.ts
      tier2/route.ts
      tier3/route.ts
    error.tsx
    globals.css
    inbox/
      error.tsx
      loading.tsx
      page.tsx
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
    landing/
      pipeline-animation.tsx
    ui/
      button.tsx
      error-boundary.tsx
  fixtures/
    demo-threads.json
  lib/
    buckets/enrich-bucket.ts
    db/
      index.ts
      schema/ (ai-usage, buckets, category-exemplars, classifications, index, reclassification-log, relations, users)
      seed-buckets.ts
      seed-demo.ts
      setup.ts
      vector.ts
    embed/
      gemini-embed.ts
      umap-runner.ts
    gmail/
      client.ts
      sync.ts
    google/auth.ts
    inbox/
      format-timestamp.ts
      get-graph-data.ts
      get-inbox-threads.ts
    pipeline/
      bootstrap-exemplars.ts
      embed-threads.ts
      llm-classify.ts
      orchestrator.ts
      reclassify.ts
      security-scan.ts
      tier0-tier1.ts
      tier2.ts
      tier3.ts
      triage.ts
    session.ts
    utils/retry.ts
  scripts/
    check-exemplars.ts
    embed-existing-buckets.ts
    rename-buckets.ts
    reseed-demo.ts
    reseed-direct.ts
    reseed-exemplars.ts
```
