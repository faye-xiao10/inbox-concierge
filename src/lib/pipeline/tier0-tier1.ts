import { eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifications, buckets } from '@/lib/db/schema';

type BucketMap = Record<string, number>;

interface TierResult {
  bucketId: number;
  tier: 0 | 1;
  confidence: 1.0;
}

export interface TierSummary {
  tier0Count: number;
  tier1Count: number;
  totalClassified: number;
}

export interface TierProgressEvent {
  stage: 'tier0_complete' | 'tier1_complete';
  count: number;
}

// ─── Domain map ──────────────────────────────────────────────────────────────

function domainMap(domains: string[], bucket: string): Record<string, string> {
  return Object.fromEntries(domains.map((d) => [d, bucket]));
}

const DOMAIN_MAP: Record<string, string> = {
  ...domainMap(['substack.com','beehiiv.com','mailchimp.com','convertkit.com','klaviyo.com',
    'ghost.io','buttondown.email','revue.nl','tinyletter.com','wsj.com','nytimes.com',
    'washingtonpost.com','economist.com','ft.com','theatlantic.com','newyorker.com',
    'wired.com','techcrunch.com','theverge.com','morningbrew.com','axios.com',
    'politico.com','bloomberg.com','reuters.com','hbr.org','medium.com',
    'forbes.com','businessinsider.com'], 'Newsletters'),
  ...domainMap(['amazon.com','amazon.co.uk','ups.com','fedex.com','usps.com','dhl.com',
    'shopify.com','etsy.com','ebay.com','walmart.com','target.com','stripe.com',
    'paypal.com','square.com','venmo.com','cashapp.com','doordash.com','ubereats.com',
    'grubhub.com','instacart.com','expedia.com','booking.com','airbnb.com',
    'hotels.com','delta.com','united.com','southwest.com',
    'github.com','gitlab.com','bitbucket.org','jira.atlassian.com','atlassian.com',
    'notion.so','figma.com','vercel.com','netlify.com','heroku.com','render.com',
    'railway.app','datadog.com','pagerduty.com','sentry.io','statuspage.io',
    'opsgenie.com'], 'Auto-Archive'),
  ...domainMap(['linkedin.com','twitter.com','x.com','facebook.com','instagram.com',
    'meetup.com','eventbrite.com','lu.ma','calendly.com','doodle.com'], 'Can Wait'),
};

// ─── Sender patterns ─────────────────────────────────────────────────────────

const SENDER_PATTERNS: { pattern: RegExp; bucketName: string }[] = [
  { pattern: /^noreply@/i, bucketName: 'Auto-Archive' },
  { pattern: /^no-reply@/i, bucketName: 'Auto-Archive' },
  { pattern: /^donotreply@/i, bucketName: 'Auto-Archive' },
  { pattern: /newsletter@/i, bucketName: 'Newsletters' },
  { pattern: /^news@/i, bucketName: 'Newsletters' },
  { pattern: /digest@/i, bucketName: 'Newsletters' },
  { pattern: /^marketing@/i, bucketName: 'Promotions' },
  { pattern: /^promo@/i, bucketName: 'Promotions' },
  { pattern: /^offers@/i, bucketName: 'Promotions' },
  { pattern: /^deals@/i, bucketName: 'Promotions' },
  { pattern: /^support@/i, bucketName: 'Can Wait' },
  { pattern: /^help@/i, bucketName: 'Can Wait' },
  { pattern: /^notifications?@/i, bucketName: 'Auto-Archive' },
  { pattern: /^updates@/i, bucketName: 'Auto-Archive' },
  { pattern: /sendgrid\.net$/i, bucketName: 'Promotions' },
  { pattern: /amazonses\.com$/i, bucketName: 'Promotions' },
  { pattern: /sparkpostmail\.com$/i, bucketName: 'Promotions' },
  { pattern: /mandrillapp\.com$/i, bucketName: 'Promotions' },
];

// ─── Pure classifiers ────────────────────────────────────────────────────────

export function classifyTier0(
  gmailCategory: string | null,
  bucketMap: BucketMap,
): TierResult | null {
  const categoryToBucket: Record<string, string> = {
    Promotions: 'Promotions',
    Social: 'Can Wait',
    Updates: 'Can Wait',
    Forums: 'Can Wait',
  };
  if (!gmailCategory || !(gmailCategory in categoryToBucket)) return null;
  const bucketName = categoryToBucket[gmailCategory];
  const bucketId = bucketMap[bucketName];
  if (bucketId === undefined) return null;
  return { bucketId, tier: 0, confidence: 1.0 };
}

export function classifyTier1(
  senderEmail: string | null,
  bucketMap: BucketMap,
): TierResult | null {
  if (!senderEmail) return null;

  for (const { pattern, bucketName } of SENDER_PATTERNS) {
    if (pattern.test(senderEmail)) {
      const bucketId = bucketMap[bucketName];
      if (bucketId === undefined) return null;
      return { bucketId, tier: 1, confidence: 1.0 };
    }
  }

  const atIndex = senderEmail.indexOf('@');
  if (atIndex === -1) return null;
  const domain = senderEmail.slice(atIndex + 1).toLowerCase();
  const bucketName = DOMAIN_MAP[domain];
  if (!bucketName) return null;
  const bucketId = bucketMap[bucketName];
  if (bucketId === undefined) return null;
  return { bucketId, tier: 1, confidence: 1.0 };
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function runTier0AndTier1(
  userId: number,
  onProgress?: (event: TierProgressEvent) => void,
): Promise<TierSummary> {
  const [unclassifiedThreads, bucketRows] = await Promise.all([
    db
      .select({
        id: classifications.id,
        gmailCategory: classifications.gmailCategory,
        senderEmail: classifications.senderEmail,
      })
      .from(classifications)
      .where(isNull(classifications.bucketId)),
    db
      .select({ id: buckets.id, name: buckets.name })
      .from(buckets)
      .where(eq(buckets.userId, userId)),
  ]);

  const bucketMap: BucketMap = Object.fromEntries(
    bucketRows.map((b) => [b.name, b.id]),
  );

  const tier0Results: { id: number; bucketId: number; tier: 0 }[] = [];
  const tier1Results: { id: number; bucketId: number; tier: 1 }[] = [];

  for (const thread of unclassifiedThreads) {
    const t0 = classifyTier0(thread.gmailCategory, bucketMap);
    if (t0) {
      tier0Results.push({ id: thread.id, bucketId: t0.bucketId, tier: 0 });
      continue;
    }
    const t1 = classifyTier1(thread.senderEmail, bucketMap);
    if (t1) {
      tier1Results.push({ id: thread.id, bucketId: t1.bucketId, tier: 1 });
    }
  }

  onProgress?.({ stage: 'tier0_complete', count: tier0Results.length });
  onProgress?.({ stage: 'tier1_complete', count: tier1Results.length });

  const allResults: { id: number; bucketId: number; tier: 0 | 1 }[] = [
    ...tier0Results,
    ...tier1Results,
  ];

  for (const batch of chunk(allResults, 50)) {
    const settled = await Promise.allSettled(
      batch.map((r) =>
        db
          .update(classifications)
          .set({ bucketId: r.bucketId, classificationTier: r.tier, confidence: 1.0 })
          .where(eq(classifications.id, r.id)),
      ),
    );
    for (const result of settled) {
      if (result.status === 'rejected') {
        console.error('Tier 0/1 write failed:', result.reason);
      }
    }
  }

  return {
    tier0Count: tier0Results.length,
    tier1Count: tier1Results.length,
    totalClassified: tier0Results.length + tier1Results.length,
  };
}
