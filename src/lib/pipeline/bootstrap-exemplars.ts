import { eq, and, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buckets, categoryExemplars } from '@/lib/db/schema';
import { batchEmbed } from '@/lib/embed/gemini-embed';
import { withRetry } from '@/lib/utils/retry';

const SYNTHETIC_EXEMPLARS: Record<string, string[]> = {
  Important: [
    'Urgent message from colleague needing immediate response',
    'Direct email from manager: meeting tomorrow to discuss project deadline',
    'Client question requiring action: please review attached proposal',
    'Interview scheduled: confirm availability for Thursday 2pm',
    'Bug report from customer: production system down, needs urgent fix',
  ],
  'Can Wait': [
    'FYI: team standup notes from today\'s meeting',
    'Company announcement: new office policy starting next month',
    'Colleague sharing article they thought you\'d find interesting',
    'Event invitation: optional team happy hour Friday',
    'Team update: sprint retrospective summary attached',
  ],
  Newsletters: [
    'Substack weekly digest: top stories in tech this week',
    'Beehiiv newsletter: industry insights and analysis',
    'Your weekly roundup from the product team',
    'Monthly report: AI trends and what\'s happening in the space',
    'Creator update: new post published on their blog',
  ],
  Promotions: [
    'Limited time offer: 30% off annual subscription expires Friday',
    'New product launch: introducing our latest feature',
    'Webinar invite: join us live to see the demo',
    'Black Friday sale: biggest deals of the year',
    'SaaS discount for early adopters: upgrade now',
  ],
  'Auto-Archive': [
    'Your order has shipped: tracking number 1Z999AA1',
    'Two-factor authentication code: 847291',
    'Password reset request for your account',
    'Receipt for your purchase: $49.99',
    'Automated notification: your backup completed successfully',
  ],
};

export async function bootstrapExemplars(
  userId: number,
): Promise<{ created: number; skipped: number }> {
  const userBuckets = await db
    .select({ id: buckets.id, name: buckets.name })
    .from(buckets)
    .where(eq(buckets.userId, userId));

  const existingCounts = await db
    .select({ bucketId: categoryExemplars.bucketId, count: count() })
    .from(categoryExemplars)
    .where(and(
      eq(categoryExemplars.source, 'synthetic'),
    ))
    .groupBy(categoryExemplars.bucketId);

  const countByBucket = Object.fromEntries(
    existingCounts.map((r) => [r.bucketId, Number(r.count)]),
  );

  const toSeed: { bucketId: number; texts: string[] }[] = [];
  let skipped = 0;

  for (const bucket of userBuckets) {
    const texts = SYNTHETIC_EXEMPLARS[bucket.name];
    if (!texts) continue;
    if ((countByBucket[bucket.id] ?? 0) >= 5) {
      skipped += 5;
      continue;
    }
    toSeed.push({ bucketId: bucket.id, texts });
  }

  if (toSeed.length === 0) return { created: 0, skipped };

  const allTexts = toSeed.flatMap((b) => b.texts);
  let vectors: number[][];

  try {
    vectors = await withRetry(() => batchEmbed(allTexts, userId));
  } catch (error) {
    throw new Error(`Failed to embed synthetic exemplars: ${String(error)}`);
  }

  const inserts: { bucketId: number; embedding: number[] }[] = [];
  let offset = 0;
  for (const { bucketId, texts } of toSeed) {
    for (let i = 0; i < texts.length; i++) {
      inserts.push({ bucketId, embedding: vectors[offset + i] });
    }
    offset += texts.length;
  }

  const results = await Promise.allSettled(
    inserts.map(({ bucketId, embedding }) =>
      db.insert(categoryExemplars).values({
        bucketId,
        embedding,
        source: 'synthetic',
        weight: 0.5,
        sourceThreadId: null,
      }),
    ),
  );

  const created = results.filter((r) => r.status === 'fulfilled').length;
  for (const r of results) {
    if (r.status === 'rejected') console.error('Exemplar insert failed:', r.reason);
  }

  return { created, skipped };
}
