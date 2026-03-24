'use client';

import { useState } from 'react';
import type { InboxThread } from '@/lib/inbox/get-inbox-threads';
import EmailList from './email-list';

interface BucketTabsProps {
  threads: InboxThread[];
  buckets: { id: number; name: string; color: string; sortOrder: number }[];
  isDemo: boolean;
}

const UNCATEGORIZED_ID = -1;

export default function BucketTabs({ threads, buckets, isDemo }: BucketTabsProps) {
  const countFor = (bucketId: number | null) =>
    threads.filter((t) => (bucketId === UNCATEGORIZED_ID ? t.bucketId === null : t.bucketId === bucketId)).length;

  const firstBucketWithEmails = buckets.find((b) => countFor(b.id) > 0);
  const [activeId, setActiveId] = useState<number>(
    firstBucketWithEmails?.id ?? buckets[0]?.id ?? UNCATEGORIZED_ID,
  );

  const filteredThreads = threads.filter((t) =>
    activeId === UNCATEGORIZED_ID ? t.bucketId === null : t.bucketId === activeId,
  );

  const activeBucket = buckets.find((b) => b.id === activeId);
  const uncategorizedCount = countFor(null);

  return (
    <div>
      <div
        className="flex gap-1 mb-1 overflow-x-auto"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        {buckets.map((bucket) => {
          const isActive = activeId === bucket.id;
          const count = countFor(bucket.id);
          return (
            <button
              key={bucket.id}
              onClick={() => setActiveId(bucket.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm whitespace-nowrap transition-colors duration-150 cursor-pointer"
              style={{
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: isActive ? `2px solid ${bucket.color}` : '2px solid transparent',
                fontWeight: isActive ? 600 : 400,
                marginBottom: '-1px',
              }}
            >
              {bucket.name}
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: isActive ? bucket.color + '22' : 'var(--bg-tertiary)',
                  color: isActive ? bucket.color : 'var(--text-tertiary)',
                  fontWeight: 500,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
        {uncategorizedCount > 0 && (
          <button
            onClick={() => setActiveId(UNCATEGORIZED_ID)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm whitespace-nowrap transition-colors duration-150 cursor-pointer"
            style={{
              color: activeId === UNCATEGORIZED_ID ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: activeId === UNCATEGORIZED_ID ? '2px solid var(--text-tertiary)' : '2px solid transparent',
              fontWeight: activeId === UNCATEGORIZED_ID ? 600 : 400,
              marginBottom: '-1px',
            }}
          >
            Uncategorized
            <span
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-tertiary)',
                fontWeight: 500,
              }}
            >
              {uncategorizedCount}
            </span>
          </button>
        )}
      </div>
      <EmailList
        threads={filteredThreads}
        bucketName={activeId === UNCATEGORIZED_ID ? 'Uncategorized' : (activeBucket?.name ?? 'this bucket')}
        isDemo={isDemo}
      />
    </div>
  );
}
