import { eq, and, lt, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifications, categoryExemplars, buckets, reclassificationLog } from '@/lib/db/schema';
import { getSession } from '@/lib/session';
import { withRetry } from '@/lib/utils/retry';

interface ReEvaluated {
  threadId: string;
  newBucketId: number;
}

async function findNearestExemplars(
  embedding: number[],
  userId: number,
): Promise<Array<{ bucketId: number; distance: number }>> {
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
  matches: Array<{ bucketId: number; distance: number }>,
): { bucketId: number; confidence: number } | null {
  if (matches.length === 0) return null;
  const best = matches[0];
  const secondBest = matches.find((m) => m.bucketId !== best.bucketId);
  const confidence = Math.max(0, 1 - best.distance);
  const secondConfidence = secondBest ? Math.max(0, 1 - secondBest.distance) : 0;
  const margin = confidence - secondConfidence;
  if (confidence > 0.7 && margin > 0.15) return { bucketId: best.bucketId, confidence };
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession(request);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let body: { threadId?: string; newBucketId?: number };
  try { body = await request.json() as typeof body; } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400 });
  }

  const { threadId, newBucketId } = body;
  if (!threadId || typeof newBucketId !== 'number') {
    return new Response(JSON.stringify({ error: 'threadId and newBucketId required' }), { status: 400 });
  }

  // Validate the target bucket belongs to this user
  const [targetBucket] = await db
    .select({ id: buckets.id })
    .from(buckets)
    .where(and(eq(buckets.id, newBucketId), eq(buckets.userId, session.userId)));
  if (!targetBucket) {
    return new Response(JSON.stringify({ error: 'Bucket not found' }), { status: 404 });
  }

  // Fetch the email and validate it belongs to this user
  const [row] = await db
    .select({
      id: classifications.id,
      embedding: classifications.embedding,
      bucketId: classifications.bucketId,
    })
    .from(classifications)
    .where(and(eq(classifications.threadId, threadId), eq(classifications.userId, session.userId)));

  if (!row) return new Response(JSON.stringify({ error: 'Email not found' }), { status: 404 });
  if (!row.embedding) return new Response(JSON.stringify({ error: 'Email has no embedding' }), { status: 422 });

  const embedding = row.embedding as number[];
  const oldBucketId = row.bucketId;

  // Update the classification — manual override is highest confidence
  await db.update(classifications)
    .set({ bucketId: newBucketId, classificationTier: 1, confidence: 1.0 })
    .where(eq(classifications.id, row.id));

  // Insert confirmed exemplar (non-blocking on failure)
  try {
    await db.insert(categoryExemplars).values({
      bucketId: newBucketId,
      embedding,
      source: 'manual',
      weight: 1.0,
      text: null,
      sourceThreadId: threadId,
    });
  } catch (err) {
    console.error('[reclassify] exemplar insert failed:', err);
  }

  // Log the reclassification (only when we have a valid fromBucketId)
  if (oldBucketId != null) {
    try {
      await db.insert(reclassificationLog).values({
        classificationId: row.id,
        fromBucketId: oldBucketId,
        toBucketId: newBucketId,
        source: 'manual_drag',
      });
    } catch (err) {
      console.error('[reclassify] log insert failed:', err);
    }
  }

  // Re-evaluate nearby ambiguous neighbors
  const reEvaluated: ReEvaluated[] = [];
  try {
    const vectorStr = `[${embedding.join(',')}]`;

    const neighborResult = await db.execute(sql`
      SELECT c.id, c.thread_id AS "threadId", c.embedding, c.bucket_id AS "bucketId"
      FROM ${classifications} c
      WHERE c.user_id = ${session.userId}
        AND c.bucket_id IS NOT NULL
        AND c.confidence < 0.70
        AND c.embedding IS NOT NULL
        AND c.thread_id != ${threadId}
      ORDER BY (c.embedding <=> ${vectorStr}::vector) ASC
      LIMIT 10
    `);

    type NeighborRow = { id: number; threadId: string; embedding: unknown; bucketId: number };
    const neighbors = (neighborResult.rows as NeighborRow[]).map((r) => ({
      id: Number(r.id),
      threadId: r.threadId,
      embedding: r.embedding as number[],
      bucketId: Number(r.bucketId),
    })).filter((r) => Array.isArray(r.embedding));

    await Promise.allSettled(
      neighbors.map(async (neighbor) => {
        try {
          const matches = await withRetry(() => findNearestExemplars(neighbor.embedding, session.userId));
          const decision = resolveClassification(matches);
          if (decision && decision.bucketId !== neighbor.bucketId) {
            await db.update(classifications)
              .set({ bucketId: decision.bucketId, classificationTier: 2, confidence: decision.confidence })
              .where(eq(classifications.id, neighbor.id));
            reEvaluated.push({ threadId: neighbor.threadId, newBucketId: decision.bucketId });
          }
        } catch (err) {
          console.error('[reclassify] neighbor re-eval failed:', err);
        }
      }),
    );
  } catch (err) {
    console.error('[reclassify] neighbor query failed:', err);
  }

  return new Response(JSON.stringify({ success: true, reEvaluated }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
