import type { InboxThread } from '@/lib/inbox/get-inbox-threads';
import { formatTimestamp } from '@/lib/inbox/format-timestamp';

interface EmailRowProps {
  thread: InboxThread;
  isDemo: boolean;
}

export default function EmailRow({ thread, isDemo }: EmailRowProps) {
  const { isUnread, senderName, subject, snippet, timestamp, securityFlags, confidence, classificationTier } = thread;

  const hasSecurityFlag = (securityFlags ?? []).length > 0;
  const showConfidence = confidence !== null && confidence < 0.8;
  const showTier = classificationTier !== null && classificationTier >= 2;

  const rowClass = `px-4 py-3 flex flex-col gap-0.5 transition-colors duration-150${isDemo ? '' : ' hover:bg-secondary cursor-pointer'}`;
  const rowStyle = { borderLeft: isUnread ? '2px solid var(--accent-primary)' : '2px solid transparent' };

  const inner = (
    <>
      {/* Line 1: sender + timestamp */}
      <div className="flex justify-between items-baseline gap-2">
        <span
          className="text-sm truncate"
          style={{ color: 'var(--text-primary)', fontWeight: isUnread ? 600 : 400 }}
          title={senderName}
        >
          {senderName || thread.senderEmail}
        </span>
        <span className="caption shrink-0 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {formatTimestamp(timestamp)}
        </span>
      </div>

      {/* Line 2: subject + badges */}
      <div className="flex justify-between items-center gap-2">
        <span
          className="text-sm truncate"
          style={{ color: 'var(--text-primary)', fontWeight: isUnread ? 600 : 400 }}
          title={subject}
        >
          {subject || '(no subject)'}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {hasSecurityFlag && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--color-error)', color: '#fff', fontWeight: 500 }}
            >
              ⚠ Security
            </span>
          )}
          {showConfidence && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: 'var(--color-warning)', color: '#fff', fontWeight: 500 }}
            >
              ~{Math.round((confidence ?? 0) * 100)}%
            </span>
          )}
          {showTier && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontWeight: 500 }}
            >
              T{classificationTier}
            </span>
          )}
        </div>
      </div>

      {/* Line 3: snippet */}
      <p className="text-sm truncate" style={{ color: 'var(--text-tertiary)' }} title={snippet}>
        {snippet}
      </p>
    </>
  );

  if (isDemo) {
    return <div className={rowClass} style={rowStyle}>{inner}</div>;
  }

  return (
    <a
      href={`https://mail.google.com/mail/u/0/#inbox/${thread.threadId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={rowClass}
      style={rowStyle}
    >
      {inner}
    </a>
  );
}
