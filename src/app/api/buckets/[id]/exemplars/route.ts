import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buckets, categoryExemplars } from '@/lib/db/schema';
import { getSession } from '@/lib/session';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession(request);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { id } = await params;
  const bucketId = parseInt(id, 10);
  if (isNaN(bucketId)) return new Response(JSON.stringify({ error: 'Invalid bucket id' }), { status: 400 });

  const [bucket] = await db
    .select({ id: buckets.id })
    .from(buckets)
    .where(and(eq(buckets.id, bucketId), eq(buckets.userId, session.userId)));

  if (!bucket) return new Response(JSON.stringify({ error: 'Bucket not found' }), { status: 404 });

  const rows = await db
    .select({ id: categoryExemplars.id, text: categoryExemplars.text })
    .from(categoryExemplars)
    .where(and(eq(categoryExemplars.bucketId, bucketId), isNotNull(categoryExemplars.text)));

  return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
}
