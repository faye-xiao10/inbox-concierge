import { isNull, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buckets } from '@/lib/db/schema';
import { batchEmbed } from '@/lib/embed/gemini-embed';

async function main() {
  const rows = await db
    .select({ id: buckets.id, name: buckets.name, description: buckets.description, userId: buckets.userId })
    .from(buckets)
    .where(isNull(buckets.embedding));

  if (rows.length === 0) {
    console.log('No buckets missing embeddings.');
    return;
  }

  console.log(`Found ${rows.length} bucket(s) without embeddings — embedding now...`);

  // batchEmbed handles up to 100 at once; chunk if needed
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const texts = chunk.map((b) => `${b.name}: ${b.description ?? ''}`);

    // Use userId of first row in chunk for usage logging; all share the same Gemini key
    const vectors = await batchEmbed(texts, chunk[0].userId);

    for (let j = 0; j < chunk.length; j++) {
      const { eq } = await import('drizzle-orm');
      await db.update(buckets).set({ embedding: vectors[j] }).where(eq(buckets.id, chunk[j].id));
      console.log(`  ✓ ${chunk[j].name} (id=${chunk[j].id})`);
    }
  }

  // Quick verification
  const remaining = await db
    .select({ id: buckets.id })
    .from(buckets)
    .where(isNull(buckets.embedding));
  const done = await db
    .select({ id: buckets.id })
    .from(buckets)
    .where(isNotNull(buckets.embedding));

  console.log(`\nDone. ${done.length} embedded, ${remaining.length} still missing.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
