import type { InboxThread } from '@/lib/inbox/get-inbox-threads';
import EmailRow from './email-row';
import EmptyState from './empty-state';

interface EmailListProps {
  threads: InboxThread[];
  bucketName: string;
}

export default function EmailList({ threads, bucketName }: EmailListProps) {
  if (threads.length === 0) {
    return <EmptyState bucketName={bucketName} />;
  }

  return (
    <ul
      className="bg-elevated rounded-lg overflow-hidden mt-2"
      style={{ boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-subtle)' }}
    >
      {threads.map((thread) => (
        <li key={thread.threadId} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="last:border-0">
          <EmailRow thread={thread} />
        </li>
      ))}
    </ul>
  );
}
