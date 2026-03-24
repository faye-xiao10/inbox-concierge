import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buckets, categoryExemplars } from '@/lib/db/schema';

const DIRECT_DESCRIPTION =
  "Emails from real people that require your direct attention or response. Includes messages from your boss, manager, colleagues, clients, friends, and family. Job interview requests, recruiter outreach, meeting requests, deadline reminders, direct questions addressed to you personally, contract or document approvals, and any email where you are the explicit next step. The sender expects a reply or action from you specifically.";

const UPDATES_DESCRIPTION =
  "Informational notifications and status updates that don't require a reply or action. Includes LinkedIn activity (job alerts, profile views, connection requests, weekly digests), GitHub notifications, calendar invites you just need to note, company-wide announcements, order confirmations, event reminders, team standup summaries, and automated platform digests. You might read it, but you won't respond to it.";

async function main() {
  console.log('Renaming buckets: Important → Direct, Can Wait → Updates...');

  // Find all affected bucket IDs before updating
  const affected = await db
    .select({ id: buckets.id, name: buckets.name })
    .from(buckets)
    .where(
      and(
        inArray(buckets.name, ['Important', 'Can Wait']),
        eq(buckets.isDefault, true),
      ),
    );

  const affectedIds = affected.map((b) => b.id);
  console.log(`Found ${affected.length} bucket(s) to rename:`, affected.map((b) => `${b.name} (id=${b.id})`).join(', '));

  // Update Important → Direct
  const importantResult = await db
    .update(buckets)
    .set({ name: 'Direct', description: DIRECT_DESCRIPTION, enrichedDescription: null, boundaryNotes: null })
    .where(and(eq(buckets.name, 'Important'), eq(buckets.isDefault, true)))
    .returning({ id: buckets.id });

  // Update Can Wait → Updates
  const canWaitResult = await db
    .update(buckets)
    .set({ name: 'Updates', description: UPDATES_DESCRIPTION, enrichedDescription: null, boundaryNotes: null })
    .where(and(eq(buckets.name, 'Can Wait'), eq(buckets.isDefault, true)))
    .returning({ id: buckets.id });

  const totalUpdated = importantResult.length + canWaitResult.length;
  console.log(`Updated ${totalUpdated} bucket(s).`);

  // Delete stale exemplars for affected buckets
  let deletedExemplars = 0;
  if (affectedIds.length > 0) {
    const deleted = await db
      .delete(categoryExemplars)
      .where(inArray(categoryExemplars.bucketId, affectedIds))
      .returning({ id: categoryExemplars.id });
    deletedExemplars = deleted.length;
  }

  console.log(`Deleted ${deletedExemplars} stale exemplar(s).`);
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('rename-buckets failed:', err);
  process.exit(1);
});
