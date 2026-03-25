import { and, eq, inArray, or, isNull, count, sum } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifications, buckets, categoryExemplars, aiUsage } from '@/lib/db/schema';
import { syncGmailThreads } from '@/lib/gmail/sync';
import { embedThreads } from './embed-threads';
import { runSecurityScan } from './security-scan';
import { runTier0AndTier1 } from './tier0-tier1';
import { runTier2 } from './tier2';
import { runTier3 } from './tier3';
import { runTriage } from './triage';
import { ensureExemplarsForAllBuckets } from './bootstrap-exemplars';

export type PipelineMode = 'incremental' | 'full';

export type PipelineMetrics = {
  totalThreads: number;
  tier0Count: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  llmCalls: number;
  estimatedCost: number;
  exemplarsAdded: number;
  durationMs: number;
};

export type PipelineEvent =
  | { type: 'sync_progress'; current: number; total: number }
  | { type: 'sync_complete'; threadCount: number }
  | { type: 'embed_progress'; current: number; total: number }
  | { type: 'embed_complete' }
  | { type: 'security_complete'; flaggedCount: number }
  | { type: 'tier0_complete'; classifiedCount: number }
  | { type: 'tier1_complete'; classifiedCount: number }
  | { type: 'tier2_progress'; current: number; total: number }
  | { type: 'tier2_complete'; classifiedCount: number }
  | { type: 'tier3_progress'; current: number; total: number; batchNumber: number }
  | { type: 'tier3_complete'; classifiedCount: number }
  | { type: 'classification_result'; threadId: string; bucketId: number; tier: number; confidence: number }
  | { type: 'triage_complete' }
  | { type: 'pipeline_complete'; metrics: PipelineMetrics }
  | { type: 'reclassify_complete'; movedCount: number; tier3Count: number; hasMore?: boolean }
  | { type: 'eviction_complete'; evictedCount: number; reassignedCount: number }
  | { type: 'reclassify_progress'; checked: number; moved: number }
  | { type: 'bucket_enriching'; message: string }
  | { type: 'overlap_warning'; conflictingBucketName: string; similarity: number }
  | { type: 'error'; message: string; stage: string };

async function computeMetrics(userId: number, startTime: number): Promise<PipelineMetrics> {
  const bucketRows = await db.select({ id: buckets.id }).from(buckets).where(eq(buckets.userId, userId));
  const bucketIds = bucketRows.map((b) => b.id);

  const [tierRows, costRows, llmRows, exemplarRows] = await Promise.all([
    db.select({ tier: classifications.classificationTier, cnt: count() }).from(classifications).where(eq(classifications.userId, userId)).groupBy(classifications.classificationTier),
    db.select({ total: sum(aiUsage.estimatedCost) }).from(aiUsage).where(eq(aiUsage.userId, userId)),
    db.select({ cnt: count() }).from(aiUsage).where(eq(aiUsage.userId, userId)),
    bucketIds.length > 0
      ? db.select({ cnt: count() }).from(categoryExemplars).where(inArray(categoryExemplars.bucketId, bucketIds))
      : Promise.resolve([{ cnt: 0 }]),
  ]);

  const getTier = (t: number) => Number(tierRows.find((r) => r.tier === t)?.cnt ?? 0);
  const total = tierRows.reduce((s, r) => s + Number(r.cnt), 0);

  return {
    totalThreads: total,
    tier0Count: getTier(0),
    tier1Count: getTier(1),
    tier2Count: getTier(2),
    tier3Count: getTier(3),
    llmCalls: Number(llmRows[0]?.cnt ?? 0),
    estimatedCost: Number(costRows[0]?.total ?? 0),
    exemplarsAdded: Number(exemplarRows[0]?.cnt ?? 0),
    durationMs: Date.now() - startTime,
  };
}

const DEFAULT_BUCKET_NAMES = ['Direct', 'Updates', 'Newsletters', 'Promotions', 'Auto-Archive'];

async function resetForFullMode(userId: number): Promise<void> {
  // Only reset emails in default buckets (or unclassified). Custom bucket assignments survive.
  const defaultBucketRows = await db
    .select({ id: buckets.id })
    .from(buckets)
    .where(and(eq(buckets.userId, userId), inArray(buckets.name, DEFAULT_BUCKET_NAMES)));

  const defaultBucketIds = defaultBucketRows.map((b) => b.id);

  // Guard: if no default buckets found, don't wipe everything
  if (defaultBucketIds.length === 0) return;

  await db.update(classifications).set({
    bucketId: null, classificationTier: null, confidence: null,
    llmReasoning: null, urgencyScore: null, securityFlags: [],
  }).where(
    and(
      eq(classifications.userId, userId),
      or(
        isNull(classifications.bucketId),
        inArray(classifications.bucketId, defaultBucketIds),
      ),
    ),
  );
}

export async function runPipeline(
  userId: number,
  userEmail: string,
  accessToken: string,
  isDemo: boolean,
  mode: PipelineMode,
  skipSync: boolean,
  onEvent: (event: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const startTime = Date.now();

  try {
    if (mode === 'full') await resetForFullMode(userId);

    if (signal?.aborted) { onEvent({ type: 'error', message: 'Pipeline aborted', stage: 'reset' }); return; }

    // Stage 1: Sync (skip if demo or rate-limited)
    let threadCount = 0;
    if (!isDemo && !skipSync) {
      const syncResult = await syncGmailThreads(userId, userEmail, accessToken, (curr, total) => {
        onEvent({ type: 'sync_progress', current: curr, total });
      });
      threadCount = syncResult.synced + syncResult.skipped;
    }
    onEvent({ type: 'sync_complete', threadCount });

    if (signal?.aborted) { onEvent({ type: 'error', message: 'Pipeline aborted', stage: 'sync' }); return; }

    // Stage 2: Embed
    await embedThreads(userId, (curr, total) => onEvent({ type: 'embed_progress', current: curr, total }));
    onEvent({ type: 'embed_complete' });

    if (signal?.aborted) { onEvent({ type: 'error', message: 'Pipeline aborted', stage: 'embed' }); return; }

    // Stage 3: Security scan
    const { flaggedCount } = await runSecurityScan(userId);
    onEvent({ type: 'security_complete', flaggedCount });

    if (signal?.aborted) { onEvent({ type: 'error', message: 'Pipeline aborted', stage: 'security' }); return; }

    // Stage 4: Tier 0 + 1
    const tier01 = await runTier0AndTier1(userId);
    onEvent({ type: 'tier0_complete', classifiedCount: tier01.tier0Count });
    onEvent({ type: 'tier1_complete', classifiedCount: tier01.tier1Count });

    if (signal?.aborted) { onEvent({ type: 'error', message: 'Pipeline aborted', stage: 'tier1' }); return; }

    // Ensure all buckets have exemplars before tier 2 needs them
    await ensureExemplarsForAllBuckets(userId);

    // Stage 5: Tier 2
    const tier2Result = await runTier2(userId, (curr, total) => onEvent({ type: 'tier2_progress', current: curr, total }));
    onEvent({ type: 'tier2_complete', classifiedCount: tier2Result.classified });

    if (signal?.aborted) { onEvent({ type: 'error', message: 'Pipeline aborted', stage: 'tier2' }); return; }

    // Stage 6: Tier 3
    const tier3Result = await runTier3(
      userId,
      (curr, total, batchNumber) => onEvent({ type: 'tier3_progress', current: curr, total, batchNumber }),
      (result) => onEvent({ type: 'classification_result', ...result }),
    );
    onEvent({ type: 'tier3_complete', classifiedCount: tier3Result.classified + tier3Result.heuristicFallback });

    // Stage 7: Triage
    await runTriage(userId);
    onEvent({ type: 'triage_complete' });

    // Stage 8: Metrics
    const metrics = await computeMetrics(userId, startTime);
    onEvent({ type: 'pipeline_complete', metrics });
  } catch (error) {
    onEvent({ type: 'error', message: String(error), stage: 'unknown' });
  }
}
