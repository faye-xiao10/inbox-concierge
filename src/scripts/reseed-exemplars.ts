import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ensureExemplarsForAllBuckets } from '@/lib/pipeline/bootstrap-exemplars';

async function main() {
  const [user] = await db.select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.isDemo, false))
    .limit(1);

  if (!user) { console.log('No real user found'); process.exit(0); }

  console.log(`Re-seeding exemplars for user ${user.id} (${user.email})`);
  await ensureExemplarsForAllBuckets(user.id);
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
