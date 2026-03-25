import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/lib/session';
import { getInboxThreads } from '@/lib/inbox/get-inbox-threads';
import { db } from '@/lib/db';
import { buckets } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import BucketTabs from '@/components/inbox/bucket-tabs';
import ClassifyButton from '@/components/inbox/classify-button';

export default async function InboxPage() {
  const session = await getSessionFromCookies();

  if (!session) {
    redirect('/');
  }

  const [threads, userBuckets] = await Promise.all([
    getInboxThreads(session.userId),
    db
      .select({
        id: buckets.id,
        name: buckets.name,
        color: buckets.color,
        sortOrder: buckets.sortOrder,
        isDefault: buckets.isDefault,
      })
      .from(buckets)
      .where(eq(buckets.userId, session.userId))
      .orderBy(asc(buckets.sortOrder))
      .catch(() => []),
  ]);

  return (
    <main className="min-h-screen bg-primary">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="heading-xl" style={{ color: 'var(--text-primary)' }}>Inbox</h1>
          <ClassifyButton isDemo={session.isDemo} />
        </div>
        <BucketTabs threads={threads} buckets={userBuckets} isDemo={session.isDemo} />
      </div>
    </main>
  );
}
