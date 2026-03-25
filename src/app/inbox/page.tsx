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
      {session.isDemo && (
        <div style={{
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-default)',
          padding: '0 1rem',
          height: '2.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
          fontSize: '0.875rem', color: 'var(--text-secondary)',
        }}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" />
            <line x1="8" y1="7" x2="8" y2="11" />
            <circle cx="8" cy="5.5" r="0.5" fill="currentColor" stroke="none" />
          </svg>
          <span>You&apos;re in demo mode — 20 fixture emails.</span>
          <a href="/api/auth/google" style={{
            padding: '3px 10px', fontSize: '12px', fontWeight: 500,
            background: 'var(--accent-primary)', color: '#fff',
            border: '1px solid transparent', borderRadius: 'var(--radius-md)',
            textDecoration: 'none', transition: 'background 150ms ease',
          }}>
            Connect your Gmail →
          </a>
        </div>
      )}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <ErrorBoundary>
          <BucketTabs threads={threads} buckets={userBuckets} isDemo={session.isDemo} autoClassify={autoClassify} />
        </ErrorBoundary>
      </div>
    </main>
  );
}
