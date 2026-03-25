import { eq, isNull, isNotNull, and, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifications, categoryExemplars, buckets, users } from '@/lib/db/schema';
import { classifyBatchWithFallback, type EmailBatchItem, type BucketContext } from './llm-classify';

interface Tier3Result {
  classified: number;
  heuristicFallback: number;
  skipped: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function bestExemplarBucket(embedding: number[], userId: number): Promise<number | null> {
  const vectorStr = `[${embedding.join(',')}]`;
  const result = await db.execute(
    sql`SELECT ce.bucket_id AS "bucketId"
        FROM ${categoryExemplars} ce
        INNER JOIN ${buckets} b ON ce.bucket_id = b.id
        WHERE b.user_id = ${userId}
        ORDER BY ce.embedding <=> ${vectorStr}::vector ASC
        LIMIT 1`,
  );
  const rows = result.rows as { bucketId: number }[];
  return rows[0] ? Number(rows[0].bucketId) : null;
}

type EmailClassifiedEvent = { threadId: string; bucketId: number; tier: number; confidence: number };

export async function runTier3(
  userId: number,
  onProgress?: (current: number, total: number, batchNumber: number) => void,
  onEmailClassified?: (result: EmailClassifiedEvent) => void,
): Promise<Tier3Result> {
  const userRows = await db.select({ isDemo: users.isDemo }).from(users).where(eq(users.id, userId));
  if (!userRows[0]) throw new Error(`User ${userId} not found`);
  if (userRows[0].isDemo) return { classified: 0, heuristicFallback: 0, skipped: 0 };

  const candidates = await db
    .select({
      id: classifications.id,
      threadId: classifications.threadId,
      subject: classifications.subject,
      senderName: classifications.senderName,
      senderEmail: classifications.senderEmail,
      snippet: classifications.snippet,
      securityFlags: classifications.securityFlags,
      confidence: classifications.confidence,
      embedding: classifications.embedding,
    })
    .from(classifications)
    .where(
      and(
        eq(classifications.userId, userId),
        isNull(classifications.bucketId),
        isNotNull(classifications.embedding),
      ),
    );

  if (candidates.length === 0) return { classified: 0, heuristicFallback: 0, skipped: 0 };

  const bucketRows = await db
    .select({ id: buckets.id, name: buckets.name, description: buckets.description, enrichedDescription: buckets.enrichedDescription })
    .from(buckets)
    .where(eq(buckets.userId, userId));

  const bucketContexts: BucketContext[] = bucketRows;

  let classified = 0;
  let heuristicFallback = 0;
  let processed = 0;
  const batches = chunk(candidates, 12);

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const batchItems: EmailBatchItem[] = batch.map((c) => ({
      threadId: c.threadId,
      subject: c.subject,
      senderName: c.senderName,
      senderEmail: c.senderEmail,
      snippet: c.snippet,
      securityFlags: c.securityFlags,
    }));

    const llmResults = await classifyBatchWithFallback(batchItems, bucketContexts, userId);
    const classifiedIds = new Set(llmResults.map((r) => r.threadId));

    // Write LLM results
    await Promise.allSettled(
      llmResults.map((r) => {
        const candidate = batch.find((c) => c.threadId === r.threadId);
        if (!candidate) return Promise.resolve();
        classified++;
        onEmailClassified?.({ threadId: r.threadId, bucketId: r.bucketId, tier: 3, confidence: r.confidence });
        return db
          .update(classifications)
          .set({ bucketId: r.bucketId, classificationTier: 3, confidence: r.confidence, llmReasoning: r.reasoning })
          .where(eq(classifications.id, candidate.id));
      }),
    );

    // Heuristic fallback for items LLM missed
    const missed = batch.filter((c) => !classifiedIds.has(c.threadId));
    await Promise.allSettled(
      missed.map(async (c) => {
        if (!Array.isArray(c.embedding)) return;
        const bucketId = await bestExemplarBucket(c.embedding, userId).catch(() => null);
        if (!bucketId) return;
        heuristicFallback++;
        onEmailClassified?.({ threadId: c.threadId, bucketId, tier: 3, confidence: c.confidence ?? 0.3 });
        return db
          .update(classifications)
          .set({ bucketId, classificationTier: 3, confidence: c.confidence ?? 0.3, llmReasoning: 'heuristic fallback' })
          .where(eq(classifications.id, c.id));
      }),
    );

    processed += batch.length;
    onProgress?.(processed, candidates.length, batchIdx + 1);
  }

  // Exemplar promotion: high-confidence Tier 3 results → categoryExemplars
  const promotable = await db
    .select({ embedding: classifications.embedding, bucketId: classifications.bucketId, threadId: classifications.threadId })
    .from(classifications)
    .where(
      and(
        eq(classifications.userId, userId),
        eq(classifications.classificationTier, 3),
        gt(classifications.confidence, 0.7),
        isNotNull(classifications.embedding),
        isNotNull(classifications.bucketId),
      ),
    );

  await Promise.allSettled(
    promotable
      .filter((r): r is { embedding: number[]; bucketId: number; threadId: string } =>
        Array.isArray(r.embedding) && r.bucketId !== null)
      .map((r) =>
        db.insert(categoryExemplars).values({
          bucketId: r.bucketId,
          embedding: r.embedding,
          source: 'confirmed',
          weight: 0.8,
          sourceThreadId: r.threadId,
        }).onConflictDoNothing(),
      ),
  );

  return { classified, heuristicFallback, skipped: 0 };
}
