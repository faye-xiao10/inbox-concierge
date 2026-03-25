import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifications, buckets, categoryExemplars } from '@/lib/db/schema';
import { classifyBatchWithFallback, type EmailBatchItem, type BucketContext } from './llm-classify';
import type { PipelineEvent } from './orchestrator';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type CandidateRow = {
  id: number;
  threadId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet: string;
  securityFlags: string[];
  bucketId: number | null;
  newDist: number;
};

type EvictionRow = {
  id: number;
  threadId: string;
  bestBucketId: number | null;
  bestDist: number | null;
};

export async function runReclassification(
  userId: number,
  newBucketId: number,
  onEvent: (event: PipelineEvent) => void,
): Promise<void> {
  const [bucketRow] = await db
    .select({ embedding: buckets.embedding })
    .from(buckets)
    .where(eq(buckets.id, newBucketId));

  if (!bucketRow?.embedding) throw new Error('Bucket has no embedding — cannot reclassify');

  const vectorStr = `[${bucketRow.embedding.join(',')}]`;

  // ── INGEST PASS ───────────────────────────────────────────────────────────────
  // Absolute distance threshold — works even when the current bucket has no embedding.
  const result = await db.execute(sql`
    SELECT
      c.id,
      c.thread_id       AS "threadId",
      c.subject,
      c.sender_name     AS "senderName",
      c.sender_email    AS "senderEmail",
      c.snippet,
      c.security_flags  AS "securityFlags",
      c.bucket_id       AS "bucketId",
      (c.embedding <=> ${vectorStr}::vector) AS "newDist"
    FROM ${classifications} c
    WHERE c.user_id = ${userId}
      AND c.bucket_id != ${newBucketId}
      AND c.embedding IS NOT NULL
      AND (c.embedding <=> ${vectorStr}::vector) < 0.35
    ORDER BY (c.embedding <=> ${vectorStr}::vector) ASC
  `);

  const rows = (result.rows as CandidateRow[]).map((r) => ({
    ...r,
    id: Number(r.id),
    newDist: Number(r.newDist),
    securityFlags: Array.isArray(r.securityFlags) ? r.securityFlags : [],
  }));

  // dist < 0.22 → tier 2 direct write; 0.22–0.35 → tier 3 LLM; >= 0.35 skip
  const tier2Rows = rows.filter((r) => r.newDist < 0.22);
  const tier3Rows = rows.filter((r) => r.newDist >= 0.22 && r.newDist < 0.35);

  console.log(`[reclassify] ingest candidates: tier2=${tier2Rows.length} tier3=${tier3Rows.length}`);

  let movedCount = 0;

  // Tier 2: write directly and emit immediately so results appear in the tab right away.
  const tier2Ops = tier2Rows.map((r) => {
    const confidence = 1 - r.newDist;
    onEvent({ type: 'classification_result', threadId: r.threadId, bucketId: newBucketId, tier: 2, confidence });
    movedCount++;
    return db.update(classifications)
      .set({ bucketId: newBucketId, classificationTier: 2, confidence })
      .where(eq(classifications.id, r.id));
  });
  await Promise.allSettled(tier2Ops);

  // Signal tier2 complete so the UI can transition banner state.
  onEvent({ type: 'reclassify_progress', checked: tier2Rows.length + tier3Rows.length, moved: movedCount });

  // Tier 3: LLM batches run in parallel; emit classification_result per confirmed email as
  // each batch resolves so they trickle into the tab incrementally.
  let tier3Count = 0;
  if (tier3Rows.length > 0) {
    const bucketRows = await db
      .select({ id: buckets.id, name: buckets.name, description: buckets.description, enrichedDescription: buckets.enrichedDescription })
      .from(buckets)
      .where(eq(buckets.userId, userId));

    const bucketContexts: BucketContext[] = bucketRows;
    const newBucketMeta = bucketRows.find((b) => b.id === newBucketId);
    const reclassifyContext = newBucketMeta
      ? `The user has just created a new bucket called "${newBucketMeta.name}" with this description:\n"${newBucketMeta.enrichedDescription ?? newBucketMeta.description ?? ''}"\n\nYou are evaluating whether emails currently in other buckets should move to this new bucket. Be willing to move emails that clearly match the new bucket's purpose.`
      : undefined;

    const batches = chunk(tier3Rows, 12);

    // Fire all LLM batches in parallel — each resolves independently and emits results immediately.
    await Promise.all(
      batches.map(async (batch) => {
        const batchItems: EmailBatchItem[] = batch.map((c) => ({
          threadId: c.threadId, subject: c.subject, senderName: c.senderName,
          senderEmail: c.senderEmail, snippet: c.snippet, securityFlags: c.securityFlags,
        }));
        const results = await classifyBatchWithFallback(batchItems, bucketContexts, userId, reclassifyContext);

        // Emit and write confirmed results immediately as this batch resolves.
        await Promise.allSettled(
          results
            .filter((r) => r.bucketId === newBucketId)
            .map((r) => {
              const candidate = batch.find((c) => c.threadId === r.threadId);
              if (!candidate) return Promise.resolve();
              movedCount++;
              tier3Count++;
              onEvent({ type: 'classification_result', threadId: r.threadId, bucketId: newBucketId, tier: 3, confidence: r.confidence });
              return db.update(classifications)
                .set({ bucketId: newBucketId, classificationTier: 3, confidence: r.confidence, llmReasoning: r.reasoning })
                .where(eq(classifications.id, candidate.id));
            }),
        );
      }),
    );
  }

  // ── EVICTION PASS ─────────────────────────────────────────────────────────────
  // Find emails already in this bucket whose exemplar distance exceeds 0.40, then
  // reassign to their best alternative or set to uncategorized.
  const evictionResult = await db.execute(sql`
    WITH evicted AS (
      SELECT c.id, c.thread_id
      FROM ${classifications} c
      JOIN ${categoryExemplars} ce ON ce.bucket_id = ${newBucketId}
      WHERE c.user_id = ${userId}
        AND c.bucket_id = ${newBucketId}
        AND c.embedding IS NOT NULL
        AND ce.embedding IS NOT NULL
      GROUP BY c.id, c.thread_id
      HAVING MIN(ce.embedding <=> c.embedding) > 0.40
    ),
    best_alt AS (
      SELECT DISTINCT ON (e.thread_id)
        e.id,
        b.id                          AS best_bucket_id,
        (cl.embedding <=> b.embedding) AS best_dist
      FROM evicted e
      JOIN ${classifications} cl ON cl.id = e.id
      CROSS JOIN ${buckets} b
      WHERE b.user_id = ${userId}
        AND b.id != ${newBucketId}
        AND b.embedding IS NOT NULL
        AND cl.embedding IS NOT NULL
      ORDER BY e.thread_id, (cl.embedding <=> b.embedding) ASC
    )
    SELECT
      e.id,
      e.thread_id           AS "threadId",
      ba.best_bucket_id     AS "bestBucketId",
      ba.best_dist          AS "bestDist"
    FROM evicted e
    LEFT JOIN best_alt ba ON ba.id = e.id
  `);

  const evictionRows = (evictionResult.rows as EvictionRow[]).map((r) => ({
    ...r,
    id: Number(r.id),
    bestBucketId: r.bestBucketId != null ? Number(r.bestBucketId) : null,
    bestDist: r.bestDist != null ? Number(r.bestDist) : null,
  }));

  let evictedCount = 0;
  let reassignedCount = 0;

  const evictOps = evictionRows.map((r) => {
    evictedCount++;
    if (r.bestBucketId != null && r.bestDist != null && r.bestDist < 0.30) {
      reassignedCount++;
      return db.update(classifications)
        .set({ bucketId: r.bestBucketId, classificationTier: 2, confidence: 1 - r.bestDist })
        .where(eq(classifications.id, r.id));
    }
    return db.update(classifications)
      .set({ bucketId: null, classificationTier: null, confidence: null, urgencyScore: null })
      .where(eq(classifications.id, r.id));
  });
  await Promise.allSettled(evictOps);

  console.log(`[reclassify] complete: moved=${movedCount} tier3=${tier3Count} evicted=${evictedCount} reassigned=${reassignedCount}`);
  onEvent({ type: 'eviction_complete', evictedCount, reassignedCount });
  onEvent({ type: 'reclassify_complete', movedCount, tier3Count });
}

export async function runReclassifyDisplaced(
  userId: number,
  threadIds: string[],
  onEvent: (event: PipelineEvent) => void,
): Promise<void> {
  if (threadIds.length === 0) { onEvent({ type: 'reclassify_complete', movedCount: 0, tier3Count: 0 }); return; }

  // DISTINCT ON: best bucket (shortest distance) per displaced thread
  const result = await db.execute(sql`
    SELECT DISTINCT ON (c.thread_id)
      c.id,
      c.thread_id      AS "threadId",
      c.subject,
      c.sender_name    AS "senderName",
      c.sender_email   AS "senderEmail",
      c.snippet,
      c.security_flags AS "securityFlags",
      b.id             AS "bestBucketId",
      (c.embedding <=> b.embedding) AS distance
    FROM ${classifications} c
    CROSS JOIN ${buckets} b
    WHERE c.user_id = ${userId}
      AND c.bucket_id IS NULL
      AND c.embedding IS NOT NULL
      AND b.embedding IS NOT NULL
      AND b.user_id = ${userId}
    ORDER BY c.thread_id, distance ASC
  `);

  type DisplacedRow = {
    id: number;
    threadId: string;
    subject: string;
    senderName: string;
    senderEmail: string;
    snippet: string;
    securityFlags: string[];
    bestBucketId: number;
    distance: number;
  };

  const threadIdSet = new Set(threadIds);
  const rows = (result.rows as DisplacedRow[])
    .filter((r) => threadIdSet.has(r.threadId))
    .map((r) => ({
      ...r,
      id: Number(r.id),
      bestBucketId: Number(r.bestBucketId),
      distance: Number(r.distance),
      securityFlags: Array.isArray(r.securityFlags) ? r.securityFlags : [],
    }));

  const toReassign = rows.filter((r) => r.distance < 0.25);

  console.log(`[reclassify-displaced] confident=${toReassign.length} leaving-uncategorized=${rows.length - toReassign.length}`);

  let movedCount = 0;
  const writeOps = toReassign.map((r) => {
    const confidence = 1 - r.distance;
    onEvent({ type: 'classification_result', threadId: r.threadId, bucketId: r.bestBucketId, tier: 2, confidence });
    movedCount++;
    return db.update(classifications)
      .set({ bucketId: r.bestBucketId, classificationTier: 2, confidence })
      .where(eq(classifications.id, r.id));
  });
  await Promise.allSettled(writeOps);

  console.log(`[reclassify-displaced] complete: moved=${movedCount}`);
  onEvent({ type: 'reclassify_complete', movedCount, tier3Count: 0 });
}
