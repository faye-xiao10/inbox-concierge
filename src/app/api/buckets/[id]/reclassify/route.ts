import { and, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buckets, categoryExemplars } from '@/lib/db/schema';
import { getSession } from '@/lib/session';
import { enrichBucket } from '@/lib/buckets/enrich-bucket';
import { runReclassification } from '@/lib/pipeline/reclassify';
import type { PipelineEvent } from '@/lib/pipeline/orchestrator';

async function enrichAndSave(
  bucketId: number,
  userId: number,
  bucketName: string,
  bucketDescription: string,
  force: boolean,
): Promise<void> {
  try {
    const enrichResult = await enrichBucket(bucketName, bucketDescription, userId, force);

    await db.update(buckets)
      .set({ enrichedDescription: enrichResult.enrichedDescription, boundaryNotes: enrichResult.boundaryNotes })
      .where(eq(buckets.id, bucketId));
    await db.delete(categoryExemplars).where(eq(categoryExemplars.bucketId, bucketId));
    await Promise.allSettled(
      enrichResult.exemplarVectors.map((embedding, i) =>
        db.insert(categoryExemplars).values({
          bucketId,
          embedding,
          text: enrichResult.exemplarTexts[i] ?? null,
          source: 'synthetic',
          weight: 0.5,
          sourceThreadId: null,
        }),
      ),
    );
  } catch (err) {
    console.error(`[enrichAndSave] failed for bucketId=${bucketId}:`, err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession(request);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { id } = await params;
  const bucketId = parseInt(id, 10);
  if (isNaN(bucketId)) return new Response(JSON.stringify({ error: 'Invalid bucket id' }), { status: 400 });

  let force = false;
  try { const body = await request.json() as { force?: boolean }; force = body.force === true; } catch { /* no body */ }

  const [bucket] = await db
    .select({ id: buckets.id, name: buckets.name, description: buckets.description, enrichedDescription: buckets.enrichedDescription })
    .from(buckets)
    .where(and(eq(buckets.id, bucketId), eq(buckets.userId, session.userId)));

  if (!bucket) return new Response(JSON.stringify({ error: 'Bucket not found' }), { status: 404 });

  const [{ exemplarCount }] = await db
    .select({ exemplarCount: count() })
    .from(categoryExemplars)
    .where(eq(categoryExemplars.bucketId, bucketId));

  const needsEnrichment = !bucket.enrichedDescription || Number(exemplarCount) === 0;


  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: PipelineEvent) => {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(event) + '\n\n'));
      };

      try {
        emit({ type: 'bucket_enriching', message: 'Setting up bucket...' });

        // Reclassification and enrichment run in parallel.
        // Enrichment does not emit events — it saves silently alongside the reclassify stream.
        await Promise.all([
          runReclassification(session.userId, bucketId, emit),
          needsEnrichment
            ? enrichAndSave(bucketId, session.userId, bucket.name, bucket.description ?? '', force)
            : Promise.resolve(),
        ]);

        controller.close();
      } catch (error) {
        emit({ type: 'error', message: String(error), stage: 'reclassify' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}
