import { eq, and, count, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buckets, categoryExemplars } from '@/lib/db/schema';
import { batchEmbed } from '@/lib/embed/gemini-embed';
import { withRetry } from '@/lib/utils/retry';

// Hand-crafted exemplars that precisely represent person-to-person email patterns.
// Embedded as high-weight (0.8) anchors — do NOT replace with LLM-generated text.
const DIRECT_EXEMPLAR_TEXTS = [
  '[SUBJECT] Hey, following up on our conversation [FROM] Sarah Chen <sarah@gmail.com> [PREVIEW] Just wanted to check in and see if you had a chance to look at what we discussed',
  '[SUBJECT] Quick question for you [FROM] Marcus Johnson <m.johnson@company.com> [PREVIEW] Hi, hope you\'re doing well! I had a question I wanted to run by you directly',
  '[SUBJECT] Re: Interview next week [FROM] Jamie Park <jamie@startup.io> [PREVIEW] Thanks for getting back to me so quickly. Does Tuesday at 2pm work for you?',
  '[SUBJECT] Fw: Offer details [FROM] Lin Han <linhan@gmail.com> [PREVIEW] Sent from my iPhone — forwarding this to you, let me know what you think',
  '[SUBJECT] You are cordially invited [FROM] Erica Yang <erica@umich.edu> [PREVIEW] Hi Faye, I hope you\'ve been doing well! I wanted to personally invite you to our event this year',
  '[SUBJECT] Checking in [FROM] David Rodriguez <david.r@gmail.com> [PREVIEW] Hey! It\'s been a while. Are you free to catch up sometime this week?',
  '[SUBJECT] Re: Your application - next steps [FROM] recruiter@techcompany.com [PREVIEW] Hi Faye, we reviewed your application and would love to set up a call to discuss the role',
  '[SUBJECT] Can you take a look at this? [FROM] boss@company.com [PREVIEW] Need your input on this before the end of the week. Let me know your thoughts',
];

const SYNTHETIC_EXEMPLARS: Record<string, string[]> = {
  Updates: [
    'LinkedIn: Marcus Johnson viewed your profile',
    'GitHub: New comment on your pull request #42',
    'Slack digest: 5 unread messages in #general since you were away',
    'Your weekly activity summary from Notion is ready',
    'Twitter: You have 3 new followers this week',
    'GitHub Actions: workflow run completed on main branch',
    'Jira: Issue PROJ-123 was assigned to you',
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

export async function ensureExemplarsForAllBuckets(userId: number): Promise<void> {
  const userBuckets = await db
    .select({ id: buckets.id, name: buckets.name })
    .from(buckets)
    .where(eq(buckets.userId, userId));

  if (userBuckets.length === 0) return;

  const bucketIds = userBuckets.map((b) => b.id);
  const existingCounts = await db
    .select({ bucketId: categoryExemplars.bucketId, cnt: count() })
    .from(categoryExemplars)
    .where(inArray(categoryExemplars.bucketId, bucketIds))
    .groupBy(categoryExemplars.bucketId);

  const countByBucket = Object.fromEntries(existingCounts.map((r) => [r.bucketId, Number(r.cnt)]));

  for (const bucket of userBuckets) {
    if ((countByBucket[bucket.id] ?? 0) > 0) continue;

    const isDirect = bucket.name === 'Direct';
    const texts = isDirect ? DIRECT_EXEMPLAR_TEXTS : SYNTHETIC_EXEMPLARS[bucket.name];
    const weight = isDirect ? 0.8 : 0.5;

    if (!texts || texts.length === 0) {
      console.warn(`ensureExemplars: no synthetic template for "${bucket.name}", skipping`);
      continue;
    }

    try {
      const vectors = await withRetry(() => batchEmbed(texts, userId));
      const results = await Promise.allSettled(
        vectors.map((embedding) =>
          db.insert(categoryExemplars).values({
            bucketId: bucket.id,
            embedding,
            source: 'synthetic',
            weight,
            sourceThreadId: null,
          }),
        ),
      );
      const created = results.filter((r) => r.status === 'fulfilled').length;
      console.warn(`ensureExemplars: seeded ${created} exemplars for "${bucket.name}" (weight ${weight})`);
    } catch (err) {
      console.error(`ensureExemplars: failed for "${bucket.name}":`, err);
    }
  }
}
