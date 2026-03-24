import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifications, buckets } from '@/lib/db/schema';

type BucketMap = Record<string, number>;
interface TierResult { bucketId: number; tier: 0 | 1; confidence: 1.0 }
export interface TierSummary { tier0Count: number; tier1Count: number; totalClassified: number }
export interface TierProgressEvent { stage: 'tier0_complete' | 'tier1_complete'; count: number }

// ─── Domain map ──────────────────────────────────────────────────────────────

function dm(domains: string[], bucket: string): Record<string, string> {
  return Object.fromEntries(domains.map((d) => [d, bucket]));
}

const DOMAIN_MAP: Record<string, string> = {
  ...dm(['substack.com','beehiiv.com','mailchimp.com','convertkit.com','klaviyo.com',
    'ghost.io','buttondown.email','revue.nl','tinyletter.com','wsj.com','nytimes.com',
    'washingtonpost.com','economist.com','ft.com','theatlantic.com','newyorker.com',
    'wired.com','techcrunch.com','theverge.com','morningbrew.com','axios.com',
    'politico.com','bloomberg.com','reuters.com','hbr.org','medium.com','forbes.com',
    'businessinsider.com','realpython.com','pythonweekly.com','tldr.tech',
    'thehustle.co','lennysnewsletter.com','every.to','milkroad.com',
    'hackernewsletter.com','densediscovery.com'], 'Newsletters'),
  ...dm(['amazon.com','amazon.co.uk','ups.com','fedex.com','usps.com','dhl.com',
    'shopify.com','etsy.com','ebay.com','walmart.com','target.com','stripe.com',
    'paypal.com','square.com','cashapp.com','doordash.com','ubereats.com',
    'grubhub.com','instacart.com','expedia.com','booking.com','airbnb.com',
    'hotels.com','delta.com','united.com','southwest.com','github.com','gitlab.com',
    'bitbucket.org','jira.atlassian.com','atlassian.com','notion.so','figma.com',
    'vercel.com','netlify.com','heroku.com','render.com','railway.app','datadog.com',
    'pagerduty.com','sentry.io','statuspage.io','opsgenie.com','google.com',
    'slack.com','zoom.us','anthropic.com','openai.com','docusign.com',
    'dropbox.com','greenhouse.io','lever.co','workday.com'], 'Auto-Archive'),
  ...dm(['linkedin.com','twitter.com','x.com','facebook.com','instagram.com',
    'meetup.com','eventbrite.com','lu.ma','calendly.com','doodle.com'], 'Updates'),
  ...dm(['glassdoor.com','builtin.com','indeed.com','venmo.com',
    'pixabay.com','unsplash.com'], 'Promotions'),
};

function getBucketForDomain(domain: string): string | undefined {
  if (DOMAIN_MAP[domain]) return DOMAIN_MAP[domain];
  const parts = domain.split('.');
  if (parts.length > 2) {
    const root = parts.slice(-2).join('.');
    if (DOMAIN_MAP[root]) return DOMAIN_MAP[root];
  }
  return undefined;
}

// ─── Sender patterns (checked in order — first match wins) ───────────────────

const SENDER_PATTERNS: { pattern: RegExp; bucketName: string }[] = [
  // Newsletter delivery domains
  { pattern: /substack\.com$/i, bucketName: 'Newsletters' },
  { pattern: /beehiiv\.com$/i, bucketName: 'Newsletters' },
  { pattern: /ghost\.io$/i, bucketName: 'Newsletters' },
  { pattern: /convertkit\.com$/i, bucketName: 'Newsletters' },
  { pattern: /mcsv\.net$/i, bucketName: 'Newsletters' },
  { pattern: /list-manage\.com$/i, bucketName: 'Newsletters' },
  // Newsletter address prefixes
  { pattern: /^hello@/i, bucketName: 'Newsletters' },
  { pattern: /^letters@/i, bucketName: 'Newsletters' },
  { pattern: /^weekly@/i, bucketName: 'Newsletters' },
  { pattern: /^daily@/i, bucketName: 'Newsletters' },
  { pattern: /^morning@/i, bucketName: 'Newsletters' },
  // Auto-Archive — transactional
  { pattern: /^noreply@/i, bucketName: 'Auto-Archive' },
  { pattern: /^no-reply@/i, bucketName: 'Auto-Archive' },
  { pattern: /^donotreply@/i, bucketName: 'Auto-Archive' },
  { pattern: /^billing@/i, bucketName: 'Auto-Archive' },
  { pattern: /^receipts?@/i, bucketName: 'Auto-Archive' },
  { pattern: /^invoice@/i, bucketName: 'Auto-Archive' },
  { pattern: /^alert@/i, bucketName: 'Auto-Archive' },
  { pattern: /^security@/i, bucketName: 'Auto-Archive' },
  { pattern: /^confirm@/i, bucketName: 'Auto-Archive' },
  { pattern: /^verify@/i, bucketName: 'Auto-Archive' },
  { pattern: /^account@/i, bucketName: 'Auto-Archive' },
  { pattern: /^notifications?@/i, bucketName: 'Auto-Archive' },
  { pattern: /^updates@/i, bucketName: 'Auto-Archive' },
  // Newsletter patterns
  { pattern: /newsletter@/i, bucketName: 'Newsletters' },
  { pattern: /^news@/i, bucketName: 'Newsletters' },
  { pattern: /digest@/i, bucketName: 'Newsletters' },
  // Promotions
  { pattern: /^marketing@/i, bucketName: 'Promotions' },
  { pattern: /^promo@/i, bucketName: 'Promotions' },
  { pattern: /^offers@/i, bucketName: 'Promotions' },
  { pattern: /^deals@/i, bucketName: 'Promotions' },
  { pattern: /^community@/i, bucketName: 'Promotions' },
  { pattern: /^team@/i, bucketName: 'Promotions' },
  { pattern: /sendgrid\.net$/i, bucketName: 'Promotions' },
  { pattern: /amazonses\.com$/i, bucketName: 'Promotions' },
  { pattern: /sparkpostmail\.com$/i, bucketName: 'Promotions' },
  { pattern: /mandrillapp\.com$/i, bucketName: 'Promotions' },
  // Can Wait
  { pattern: /^support@/i, bucketName: 'Updates' },
  { pattern: /^help@/i, bucketName: 'Updates' },
];

// ─── Pure classifiers ────────────────────────────────────────────────────────

export function classifyTier0(gmailCategory: string | null, bucketMap: BucketMap): TierResult | null {
  const map: Record<string, string> = { Promotions: 'Promotions', Social: 'Updates' };
  if (!gmailCategory || !(gmailCategory in map)) return null;
  const bucketId = bucketMap[map[gmailCategory]];
  return bucketId !== undefined ? { bucketId, tier: 0, confidence: 1.0 } : null;
}

export function classifyTier1(senderEmail: string | null, bucketMap: BucketMap): TierResult | null {
  if (!senderEmail) return null;

  for (const { pattern, bucketName } of SENDER_PATTERNS) {
    if (pattern.test(senderEmail)) {
      const bucketId = bucketMap[bucketName];
      return bucketId !== undefined ? { bucketId, tier: 1, confidence: 1.0 } : null;
    }
  }

  const atIndex = senderEmail.indexOf('@');
  if (atIndex === -1) return null;
  const domain = senderEmail.slice(atIndex + 1).toLowerCase();
  const bucketName = getBucketForDomain(domain);
  if (!bucketName) return null;
  const bucketId = bucketMap[bucketName];
  return bucketId !== undefined ? { bucketId, tier: 1, confidence: 1.0 } : null;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function runTier0AndTier1(userId: number, onProgress?: (event: TierProgressEvent) => void): Promise<TierSummary> {
  const [unclassifiedThreads, bucketRows] = await Promise.all([
    db.select({ id: classifications.id, gmailCategory: classifications.gmailCategory, senderEmail: classifications.senderEmail })
      .from(classifications)
      .where(and(eq(classifications.userId, userId), isNull(classifications.bucketId))),
    db.select({ id: buckets.id, name: buckets.name }).from(buckets).where(eq(buckets.userId, userId)),
  ]);

  const bucketMap: BucketMap = Object.fromEntries(bucketRows.map((b) => [b.name, b.id]));
  const tier0Results: { id: number; bucketId: number; tier: 0 }[] = [];
  const tier1Results: { id: number; bucketId: number; tier: 1 }[] = [];

  for (const thread of unclassifiedThreads) {
    const t0 = classifyTier0(thread.gmailCategory, bucketMap);
    if (t0) { tier0Results.push({ id: thread.id, bucketId: t0.bucketId, tier: 0 }); continue; }
    const t1 = classifyTier1(thread.senderEmail, bucketMap);
    if (t1) tier1Results.push({ id: thread.id, bucketId: t1.bucketId, tier: 1 });
  }

  onProgress?.({ stage: 'tier0_complete', count: tier0Results.length });
  onProgress?.({ stage: 'tier1_complete', count: tier1Results.length });

  const allResults: { id: number; bucketId: number; tier: 0 | 1 }[] = [...tier0Results, ...tier1Results];
  for (const batch of chunk(allResults, 50)) {
    const settled = await Promise.allSettled(
      batch.map((r) => db.update(classifications).set({ bucketId: r.bucketId, classificationTier: r.tier, confidence: 1.0 }).where(eq(classifications.id, r.id))),
    );
    for (const result of settled) {
      if (result.status === 'rejected') console.error('Tier 0/1 write failed:', result.reason);
    }
  }

  return { tier0Count: tier0Results.length, tier1Count: tier1Results.length, totalClassified: tier0Results.length + tier1Results.length };
}
