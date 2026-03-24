import { eq, isNull, isNotNull, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifications, categoryExemplars, buckets } from '@/lib/db/schema';

interface Tier2Result {
  classified: number;
  flaggedForTier3: number;
}

interface EmailToClassify {
  id: number;
  threadId: string;
  embedding: unknown; // raw pgvector value returned by Drizzle
}

interface ExemplarMatch {
  bucketId: number;
  distance: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function findNearestExemplars(
  embedding: number[],
  userId: number,
): Promise<ExemplarMatch[]> {
  const vectorStr = `[${embedding.join(',')}]`;

  const result = await db.execute(
    sql`SELECT ce.bucket_id AS "bucketId",
               (ce.embedding <=> ${vectorStr}::vector) AS distance
        FROM ${categoryExemplars} ce
        INNER JOIN ${buckets} b ON ce.bucket_id = b.id
        WHERE b.user_id = ${userId}
        ORDER BY distance ASC
        LIMIT 10`,
  );

  return (result.rows as { bucketId: number; distance: number }[]).map((r) => ({
    bucketId: Number(r.bucketId),
    distance: Number(r.distance),
  }));
}

function resolveClassification(
  matches: ExemplarMatch[],
): { bucketId: number | null; confidence: number } | null {
  if (matches.length === 0) return null;

  const best = matches[0];
  const secondBest = matches.find((m) => m.bucketId !== best.bucketId);

  const confidence = Math.max(0, 1 - best.distance);
  const secondConfidence = secondBest ? Math.max(0, 1 - secondBest.distance) : 0;
  const margin = confidence - secondConfidence;

  if (confidence > 0.7 && margin > 0.15) {
    return { bucketId: best.bucketId, confidence };
  }
  // Below threshold — return confidence only so Tier 3 has it as context
  return { bucketId: null, confidence };
}

export async function runTier2(
  userId: number,
  onProgress?: (current: number, total: number) => void,
): Promise<Tier2Result> {
  const unclassified = await db
    .select({
      id: classifications.id,
      threadId: classifications.threadId,
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

  const emails = unclassified.filter(
    (e): e is EmailToClassify & { embedding: number[] } =>
      Array.isArray(e.embedding),
  );

  const total = emails.length;
  let classified = 0;
  let flaggedForTier3 = 0;
  let processed = 0;

  for (const batch of chunk(emails, 20)) {
    const queryResults = await Promise.allSettled(
      batch.map((email) => findNearestExemplars(email.embedding, userId)),
    );

    const writeOps: Promise<unknown>[] = [];

    for (let i = 0; i < batch.length; i++) {
      const queryResult = queryResults[i];
      if (queryResult.status === 'rejected') {
        console.error('Similarity query failed:', queryResult.reason);
        flaggedForTier3++;
        continue;
      }

      const decision = resolveClassification(queryResult.value);
      if (decision?.bucketId !== undefined && decision.bucketId !== null) {
        writeOps.push(
          db
            .update(classifications)
            .set({
              bucketId: decision.bucketId,
              classificationTier: 2,
              confidence: decision.confidence,
            })
            .where(eq(classifications.id, batch[i].id)),
        );
        classified++;
      } else {
        // Below threshold: persist confidence only, leave bucketId/tier null for Tier 3
        if (decision) {
          writeOps.push(
            db
              .update(classifications)
              .set({ confidence: decision.confidence })
              .where(eq(classifications.id, batch[i].id)),
          );
        }
        flaggedForTier3++;
      }
    }

    const writeResults = await Promise.allSettled(writeOps);
    for (const r of writeResults) {
      if (r.status === 'rejected') console.error('Tier 2 write failed:', r.reason);
    }

    processed += batch.length;
    onProgress?.(processed, total);
  }

  return { classified, flaggedForTier3 };
}
