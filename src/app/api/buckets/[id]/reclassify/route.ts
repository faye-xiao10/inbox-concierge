import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buckets, categoryExemplars } from '@/lib/db/schema';
import { getSession } from '@/lib/session';
import { enrichBucket } from '@/lib/buckets/enrich-bucket';
import { runReclassification } from '@/lib/pipeline/reclassify';
import type { PipelineEvent } from '@/lib/pipeline/orchestrator';

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: PipelineEvent) => {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(event) + '\n\n'));
      };

      try {
        // 1. Reclassify immediately — bucket.embedding set by POST handler before SSE started.
        //    runReclassification emits progress events and reclassify_complete internally.
        //    The client may close its reader after receiving reclassify_complete.
        emit({ type: 'bucket_enriching', message: 'Setting up bucket...' });
        await runReclassification(session.userId, bucketId, emit);
      } catch (error) {
        emit({ type: 'error', message: String(error), stage: 'reclassify' });
        controller.close();
        return;
      }

      // 2. Enrich after reclassification — generates exemplars for future pipeline runs.
      //    Client may have already closed its reader; overlap_warning is advisory-only here.
      if (!bucket.enrichedDescription) {
        try {
          const enrichResult = await enrichBucket(bucket.name, bucket.description ?? '', session.userId, force);

          if (enrichResult.overlapping) {
            emit({
              type: 'overlap_warning',
              conflictingBucketName: enrichResult.conflictingBucketName,
              similarity: Math.round(enrichResult.similarity * 100),
            });
          } else {
            await db.update(buckets)
              .set({ enrichedDescription: enrichResult.enrichedDescription, boundaryNotes: enrichResult.boundaryNotes })
              .where(eq(buckets.id, bucketId));

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
          }
        } catch (enrichErr) {
          console.error('[reclassify] Enrichment failed (non-fatal):', enrichErr);
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}
