import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/lib/session';
import { getInboxThreads } from '@/lib/inbox/get-inbox-threads';
import { db } from '@/lib/db';
import { buckets } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import BucketTabs from '@/components/inbox/bucket-tabs';
import ErrorBoundary from '@/components/ui/error-boundary';

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
        description: buckets.description,
      })
      .from(buckets)
      .where(eq(buckets.userId, session.userId))
      .orderBy(asc(buckets.sortOrder))
      .catch(() => []),
  ]);

  const autoClassify = !session.isDemo && threads.length === 0;

  return (
    <main className="min-h-screen bg-primary">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <ErrorBoundary>
          <BucketTabs threads={threads} buckets={userBuckets} isDemo={session.isDemo} autoClassify={autoClassify} />
        </ErrorBoundary>
      </div>
    </main>
  );
}
