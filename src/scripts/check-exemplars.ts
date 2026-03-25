import { db } from '../lib/db/index';
import { buckets, categoryExemplars } from '../lib/db/schema/index';
import { eq } from 'drizzle-orm';

const DEFAULT_BUCKET_NAMES = new Set(['Direct', 'Updates', 'Newsletters', 'Promotions', 'Auto-Archive']);

async function main() {
  const allBuckets = await db.select().from(buckets);
  const needsBackfill: string[] = [];

  for (const b of allBuckets) {
    const exemplars = await db
      .select()
      .from(categoryExemplars)
      .where(eq(categoryExemplars.bucketId, b.id));
    console.log(
      b.name,
      '| exemplars:', exemplars.length,
      '| with text:', exemplars.filter(e => e.text).length,
      '| sample:', exemplars[0]?.text?.slice(0, 60) ?? '(none)'
    );
    if (!DEFAULT_BUCKET_NAMES.has(b.name) && exemplars.length === 0) {
      needsBackfill.push(b.name);
    }
  }

  if (needsBackfill.length > 0) {
    console.log('\n⚠ Custom buckets with 0 exemplars (need backfill via UI):');
    for (const name of needsBackfill) console.log(' •', name);
  } else {
    console.log('\n✓ All custom buckets have exemplars.');
  }

  process.exit(0);
}

main().catch(console.error);
