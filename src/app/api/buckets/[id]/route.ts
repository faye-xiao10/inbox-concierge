import { and, eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buckets, classifications, reclassificationLog } from '@/lib/db/schema';
import { getSession } from '@/lib/session';
import { batchEmbed } from '@/lib/embed/gemini-embed';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession(request);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { id } = await params;
  const bucketId = parseInt(id, 10);
  if (isNaN(bucketId)) return new Response(JSON.stringify({ error: 'Invalid bucket id' }), { status: 400 });

  let body: { name?: string; description?: string } = {};
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const description = (body.description ?? '').trim();
  if (!name || name.length > 50) return new Response(JSON.stringify({ error: 'Name must be 1–50 characters' }), { status: 400 });
  if (!description || description.length > 500) return new Response(JSON.stringify({ error: 'Description must be 1–500 characters' }), { status: 400 });

  const [bucket] = await db
    .select({ id: buckets.id, isDefault: buckets.isDefault, description: buckets.description })
    .from(buckets)
    .where(and(eq(buckets.id, bucketId), eq(buckets.userId, session.userId)));

  if (!bucket) return new Response(JSON.stringify({ error: 'Bucket not found' }), { status: 404 });
  if (bucket.isDefault) return new Response(JSON.stringify({ error: 'Cannot edit default buckets' }), { status: 403 });

  const descriptionChanged = description !== (bucket.description ?? '').trim();

  const [updated] = await db
    .update(buckets)
    .set({ name, description, ...(descriptionChanged ? { enrichedDescription: null, boundaryNotes: null } : {}) })
    .where(and(eq(buckets.id, bucketId), eq(buckets.userId, session.userId)))
    .returning();

  // Re-embed when description changes so reclassification uses the updated vector
  if (descriptionChanged) {
    try {
      const [embedding] = await batchEmbed([`${name}: ${description}`], session.userId);
      await db.update(buckets).set({ embedding }).where(eq(buckets.id, bucketId));
    } catch (embedErr) {
      console.error('[buckets/patch] Failed to re-embed bucket:', embedErr);
    }
  }

  return new Response(JSON.stringify({ ...updated, needsReclassify: descriptionChanged }), { headers: { 'Content-Type': 'application/json' } });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession(request);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { id } = await params;
  const bucketId = parseInt(id, 10);
  if (isNaN(bucketId)) return new Response(JSON.stringify({ error: 'Invalid bucket id' }), { status: 400 });

  const [bucket] = await db
    .select({ id: buckets.id, isDefault: buckets.isDefault })
    .from(buckets)
    .where(and(eq(buckets.id, bucketId), eq(buckets.userId, session.userId)));

  if (!bucket) return new Response(JSON.stringify({ error: 'Bucket not found' }), { status: 404 });
  if (bucket.isDefault) return new Response(JSON.stringify({ error: 'Cannot delete default buckets' }), { status: 403 });

  try {
    await db.update(classifications)
      .set({ bucketId: null, classificationTier: null, confidence: null, urgencyScore: null })
      .where(and(eq(classifications.userId, session.userId), eq(classifications.bucketId, bucketId)));

    await db.delete(reclassificationLog).where(
      or(
        eq(reclassificationLog.fromBucketId, bucketId),
        eq(reclassificationLog.toBucketId, bucketId),
      ),
    );

    // categoryExemplars deleted via ON DELETE CASCADE from buckets FK
    await db.delete(buckets).where(and(eq(buckets.id, bucketId), eq(buckets.userId, session.userId)));

    return new Response(JSON.stringify({ deleted: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Delete bucket error:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete bucket' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
