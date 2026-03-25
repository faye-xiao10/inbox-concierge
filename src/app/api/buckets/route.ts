import { eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buckets } from '@/lib/db/schema';
import { getSession } from '@/lib/session';
import { batchEmbed } from '@/lib/embed/gemini-embed';

const CUSTOM_COLORS = ['#8B5CF6', '#EC4899', '#F97316', '#06B6D4', '#84CC16'];

export async function GET(request: Request): Promise<Response> {
  const session = await getSession(request);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const rows = await db
    .select({ id: buckets.id, name: buckets.name, color: buckets.color, sortOrder: buckets.sortOrder, isDefault: buckets.isDefault, description: buckets.description })
    .from(buckets)
    .where(eq(buckets.userId, session.userId))
    .orderBy(asc(buckets.sortOrder));

  return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession(request);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let body: { name?: string; description?: string; force?: boolean } = {};
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const description = (body.description ?? '').trim();

  if (!name || name.length > 50) return new Response(JSON.stringify({ error: 'Name must be 1–50 characters' }), { status: 400 });
  if (!description || description.length > 500) return new Response(JSON.stringify({ error: 'Description must be 1–500 characters' }), { status: 400 });

  const userBuckets = await db
    .select({ name: buckets.name, sortOrder: buckets.sortOrder })
    .from(buckets)
    .where(eq(buckets.userId, session.userId));

  if (userBuckets.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
    return new Response(JSON.stringify({ error: 'A bucket with that name already exists' }), { status: 400 });
  }

  const color = CUSTOM_COLORS[userBuckets.length % CUSTOM_COLORS.length];
  const sortOrder = Math.max(...userBuckets.map((b) => b.sortOrder), 0) + 1;

  const [newBucket] = await db.insert(buckets).values({
    userId: session.userId, name, description,
    color, sortOrder, isDefault: false,
  }).returning();

  // Embed the bucket so reclassification can start immediately (before enrichment)
  try {
    const [embedding] = await batchEmbed([`${name}: ${description}`], session.userId);
    await db.update(buckets).set({ embedding }).where(eq(buckets.id, newBucket.id));
  } catch (embedErr) {
    console.error('[buckets] Failed to embed new bucket:', embedErr);
  }

  return new Response(JSON.stringify({ status: 'created', bucket: newBucket }), { headers: { 'Content-Type': 'application/json' } });
}
