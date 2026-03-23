import { db } from '@/lib/db';
import { buckets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type Bucket = typeof buckets.$inferSelect;

export const DEFAULT_BUCKETS = [
  {
    name: 'Important',
    description:
      'Person-to-person emails, urgent messages, emails requiring immediate action',
    color: '#3B82F6',
    sortOrder: 1,
  },
  {
    name: 'Can Wait',
    description: 'Non-urgent but relevant: FYIs, team updates, event invitations',
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
