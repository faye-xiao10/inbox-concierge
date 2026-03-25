import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifications, buckets } from '@/lib/db/schema';
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

export async function runReclassification(
  userId: number,
  newBucketId: number,
  onEvent: (event: PipelineEvent) => void,
): Promise<void> {
  // Fetch the new bucket's embedding (set by POST handler before SSE starts)
  const [bucketRow] = await db
    .select({ embedding: buckets.embedding })
    .from(buckets)
    .where(eq(buckets.id, newBucketId));

  if (!bucketRow?.embedding) throw new Error('Bucket has no embedding — cannot reclassify');

  const vectorStr = `[${bucketRow.embedding.join(',')}]`;

  // Single SQL query: find all emails closer to the new bucket than their current bucket
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
    JOIN ${buckets} cb ON cb.id = c.bucket_id
    WHERE c.user_id = ${userId}
      AND c.embedding IS NOT NULL
      AND cb.embedding IS NOT NULL
      AND c.bucket_id != ${newBucketId}
      AND (c.embedding <=> ${vectorStr}::vector) < (c.embedding <=> cb.embedding)
  `);

  const rows = (result.rows as CandidateRow[]).map((r) => ({
    ...r,
    id: Number(r.id),
    newDist: Number(r.newDist),
    securityFlags: Array.isArray(r.securityFlags) ? r.securityFlags : [],
  }));

  // Split by distance: < 0.25 → tier 2 direct, 0.25–0.35 → tier 3 LLM, >= 0.35 skip
  const tier2Rows = rows.filter((r) => r.newDist < 0.25);
  const tier3Rows = rows.filter((r) => r.newDist >= 0.25 && r.newDist < 0.35);

  console.log(`[reclassify] candidates: tier2=${tier2Rows.length} tier3=${tier3Rows.length} skipped=${rows.length - tier2Rows.length - tier3Rows.length}`);

  let movedCount = 0;

  // Tier 2: batch writes
  const writeOps = tier2Rows.map((r) => {
    const confidence = 1 - r.newDist;
    onEvent({ type: 'classification_result', threadId: r.threadId, bucketId: newBucketId, tier: 2, confidence });
    movedCount++;
    return db.update(classifications)
      .set({ bucketId: newBucketId, classificationTier: 2, confidence })
      .where(eq(classifications.id, r.id));
  });
  await Promise.allSettled(writeOps);

  // Fetch bucket contexts for Tier 3
  const bucketRows = await db
    .select({ id: buckets.id, name: buckets.name, description: buckets.description, enrichedDescription: buckets.enrichedDescription })
    .from(buckets)
    .where(eq(buckets.userId, userId));

  const bucketContexts: BucketContext[] = bucketRows;
  const newBucketMeta = bucketRows.find((b) => b.id === newBucketId);
  const reclassifyContext = newBucketMeta
    ? `The user has just created a new bucket called "${newBucketMeta.name}" with this description:\n"${newBucketMeta.enrichedDescription ?? newBucketMeta.description ?? ''}"\n\nYou are evaluating whether emails currently in other buckets should move to this new bucket. Be willing to move emails that clearly match the new bucket's purpose.`
    : undefined;

  // Tier 3: LLM batches (sequential — rate limits)
  let tier3Count = 0;
  const batches = chunk(tier3Rows, 12);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    onEvent({ type: 'tier3_progress', current: (i + 1) * batch.length, total: tier3Rows.length, batchNumber: i + 1 });

    const batchItems: EmailBatchItem[] = batch.map((c) => ({
      threadId: c.threadId, subject: c.subject, senderName: c.senderName,
      senderEmail: c.senderEmail, snippet: c.snippet, securityFlags: c.securityFlags,
    }));

    const results = await classifyBatchWithFallback(batchItems, bucketContexts, userId, reclassifyContext);
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
  }

  console.log(`[reclassify] complete: moved=${movedCount} (tier2=${tier2Rows.length - (tier2Rows.length - (movedCount - tier3Count))} tier3=${tier3Count})`);
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
  const leftUncategorized = rows.filter((r) => r.distance >= 0.25);

  console.log(`[reclassify-displaced] confident=${toReassign.length} leaving-uncategorized=${leftUncategorized.length}`);

  let movedCount = 0;

  // Only write confident reassignments — low-confidence rows stay bucketId=null
  // for the full pipeline's multi-exemplar Tier 2 to handle correctly.
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
