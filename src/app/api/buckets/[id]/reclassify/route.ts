import { and, count, eq } from 'drizzle-orm';
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

  const [{ exemplarCount }] = await db
    .select({ exemplarCount: count() })
    .from(categoryExemplars)
    .where(eq(categoryExemplars.bucketId, bucketId));

  // Re-enrich whenever exemplars are missing, even if enrichedDescription was previously set.
  // Handles the case where enrichment partially succeeded (description saved, exemplars not).
  const needsEnrichment = !bucket.enrichedDescription || Number(exemplarCount) === 0;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: PipelineEvent) => {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(event) + '\n\n'));
      };

      try {
        emit({ type: 'bucket_enriching', message: 'Setting up bucket...' });

        // Run reclassification and enrichment in parallel — both must finish before close.
        // Vercel kills the function as soon as the stream closes, so enrichment must complete here.
        const [, enrichResult] = await Promise.all([
          runReclassification(session.userId, bucketId, emit),
          needsEnrichment
            ? enrichBucket(bucket.name, bucket.description ?? '', session.userId, force).catch((err: unknown) => {
                console.error('[reclassify] Enrichment failed (non-fatal):', err);
                return null;
              })
            : Promise.resolve(null),
        ]);

        // Persist enrichment results (exemplars + metadata) before closing.
        if (enrichResult && !enrichResult.overlapping) {
          await db.update(buckets)
            .set({ enrichedDescription: enrichResult.enrichedDescription, boundaryNotes: enrichResult.boundaryNotes })
            .where(eq(buckets.id, bucketId));
          // Clear stale exemplars before writing fresh ones to avoid duplicates on re-enrich.
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
        } else if (enrichResult?.overlapping) {
          emit({ type: 'overlap_warning', conflictingBucketName: enrichResult.conflictingBucketName, similarity: Math.round(enrichResult.similarity * 100) });
        }
        controller.close();
      } catch (error) {
        emit({ type: 'error', message: String(error), stage: 'reclassify' });
        controller.close();
        return;
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}
