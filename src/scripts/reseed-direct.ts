import { db } from '@/lib/db';
import { users, buckets, categoryExemplars } from '@/lib/db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { ensureExemplarsForAllBuckets } from '@/lib/pipeline/bootstrap-exemplars';

async function main() {
  const [user] = await db.select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.isDemo, false))
    .limit(1);

  if (!user) { console.log('No real user found'); process.exit(0); }
  console.log(`Re-seeding Direct + Updates for user ${user.id} (${user.email})`);

  const targetBuckets = await db
    .select({ id: buckets.id, name: buckets.name })
    .from(buckets)
    .where(and(eq(buckets.userId, user.id), inArray(buckets.name, ['Direct', 'Updates'])));

  if (targetBuckets.length === 0) { console.log('No Direct/Updates buckets found'); process.exit(0); }

  const ids = targetBuckets.map((b) => b.id);
  const deleted = await db.delete(categoryExemplars).where(inArray(categoryExemplars.bucketId, ids));
  console.log(`Deleted existing exemplars for: ${targetBuckets.map((b) => b.name).join(', ')}`);
  void deleted;

  await ensureExemplarsForAllBuckets(user.id);
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
