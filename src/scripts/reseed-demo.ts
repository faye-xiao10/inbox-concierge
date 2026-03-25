import { db } from '@/lib/db';
import { users, classifications, buckets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { seedDemoUser } from '@/lib/db/seed-demo';

const DEMO_EMAIL = 'demo@inboxconcierge.app';

async function main() {
  const [user] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);

  if (!user) {
    console.error(`Demo user not found (email: ${DEMO_EMAIL}). Run the app and hit /api/auth/demo first.`);
    process.exit(1);
  }

  console.log(`Found demo user id=${user.id}`);

  const deleted = await db.delete(classifications).where(eq(classifications.userId, user.id));
  console.log(`Deleted existing classifications:`, deleted);

  const bucketRows = await db.select().from(buckets).where(eq(buckets.userId, user.id));
  console.log(`Buckets available: ${bucketRows.map((b) => b.name).join(', ')}`);

  await seedDemoUser(user.id, bucketRows);
  console.log('Demo threads re-seeded successfully.');
}

main().catch((err) => { console.error(err); process.exit(1); });
