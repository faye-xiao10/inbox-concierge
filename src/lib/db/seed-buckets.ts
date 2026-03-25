import { db } from '@/lib/db';
import { buckets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type Bucket = typeof buckets.$inferSelect;

export const DEFAULT_BUCKETS = [
  {
    name: 'Direct',
    description:
      'Emails from real people that require your direct attention or response. Includes messages from your boss, manager, colleagues, clients, friends, and family. Job interview requests, recruiter outreach, meeting requests, deadline reminders, direct questions addressed to you personally, contract or document approvals, and any email where you are the explicit next step. The sender expects a reply or action from you specifically.',
    color: '#3B82F6',
    sortOrder: 1,
  },
  {
    name: 'Updates',
    description:
      'Informational notifications and status updates that don\'t require a reply or action. Includes LinkedIn activity (job alerts, profile views, connection requests, weekly digests), GitHub notifications, calendar invites you just need to note, company-wide announcements, order confirmations, event reminders, team standup summaries, and automated platform digests. You might read it, but you won\'t respond to it.',
    color: '#F59E0B',
    sortOrder: 2,
  },
  {
    name: 'Newsletters',
    description:
      'Substack, Beehiiv, mailing lists, industry reports, content roundups',
    color: '#14B8A6',
    sortOrder: 3,
  },
  {
    name: 'Promotions',
    description: 'Marketing emails, deals, product launches, SaaS offers',
    color: '#22C55E',
    sortOrder: 4,
  },
  {
    name: 'Auto-Archive',
    description:
      'Receipts, shipping confirmations, 2FA codes, password resets, automated notifications',
    color: '#6B7280',
    sortOrder: 5,
  },
] as const;

export async function seedDefaultBuckets(userId: number): Promise<Bucket[]> {
  try {
    await db
      .insert(buckets)
      .values(
        DEFAULT_BUCKETS.map((b) => ({
          userId,
          ...b,
          isDefault: true,
        })),
      )
      .onConflictDoNothing();

    return db.select().from(buckets).where(eq(buckets.userId, userId));
  } catch (error) {
    throw new Error(`Failed to seed default buckets: ${String(error)}`);
  }
}
