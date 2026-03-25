'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { InboxThread } from '@/lib/inbox/get-inbox-threads';
import EmailList from './email-list';
import ManageBucketsButton from './manage-buckets-button';
import ManageBucketsPanel, { type PanelBucket } from './manage-buckets-panel';

interface BucketTabsProps {
  threads: InboxThread[];
  buckets: { id: number; name: string; color: string; sortOrder: number; isDefault: boolean }[];
  isDemo: boolean;
}

interface CreationStatus {
  bucketName: string;
  phase: string;
  checked: number;
  moved: number;
  label?: string; // overrides default "Creating..." display text
}

interface CreationDone {
  bucketName: string;
  movedCount: number;
  doneLabel?: string; // overrides default "ready" display text
}

interface OverlapWarning {
  conflictingBucketName: string;
  similarity: number;
  bucketId: number;
  bucketName: string;
}

const UNCATEGORIZED_ID = -1;

export default function BucketTabs({ threads, buckets: initialBuckets, isDemo }: BucketTabsProps) {
  const router = useRouter();
  const [buckets, setBuckets] = useState(initialBuckets);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [creationStatus, setCreationStatus] = useState<CreationStatus | null>(null);
  const [creationDone, setCreationDone] = useState<CreationDone | null>(null);
  const [overlapWarning, setOverlapWarning] = useState<OverlapWarning | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function handleBucketsChanged() {
    router.refresh();
  }

  function handleBucketCreated(bucket: PanelBucket) {
    setBuckets((prev) => [...prev, bucket]);
    startCreationSSE(bucket.id, bucket.name);
  }

  function handleForceCreate() {
    if (!overlapWarning) return;
    const { bucketId, bucketName } = overlapWarning;
    setOverlapWarning(null);
    startCreationSSE(bucketId, bucketName, true);
  }

  function handleBucketDeleted(bucketId: number, _bucketName: string, displacedThreadIds: string[]) {
    setBuckets((prev) => prev.filter((b) => b.id !== bucketId));
    if (displacedThreadIds.length > 0) {
      startDisplacedSSE(displacedThreadIds);
    } else {
      router.refresh();
    }
  }

  async function startDisplacedSSE(threadIds: string[]) {
    const label = `Reclassifying ${threadIds.length} displaced email${threadIds.length !== 1 ? 's' : ''}`;
    setCreationStatus({ bucketName: '', phase: 'Reclassifying...', checked: threadIds.length, moved: 0, label });
    setCreationDone(null);

    try {
      const res = await fetch('/api/buckets/reclassify-displaced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadIds }),
      });
      if (!res.ok || !res.body) { router.refresh(); return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
            if (event.type === 'classification_result') {
              setCreationStatus((prev) => prev ? { ...prev, moved: prev.moved + 1 } : null);
            } else if (event.type === 'reclassify_complete') {
              const movedCount = (event.movedCount as number) ?? 0;
              setCreationStatus(null);
              setCreationDone({ bucketName: '', movedCount, doneLabel: `✓ ${movedCount} email${movedCount !== 1 ? 's' : ''} reclassified` });
              if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
              doneTimerRef.current = setTimeout(() => { setCreationDone(null); router.refresh(); }, 3000);
              return;
            }
          } catch { /* ignore */ }
        }
      }
    } catch {
      setCreationStatus(null);
      router.refresh();
    }
  }

  async function startCreationSSE(bucketId: number, bucketName: string, force = false) {
    setCreationStatus({ bucketName, phase: 'Setting up bucket...', checked: 0, moved: 0 });
    setCreationDone(null);

    try {
      const res = await fetch(`/api/buckets/${bucketId}/reclassify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
            handleSSEEvent(bucketId, bucketName, event);
            if (event.type === 'reclassify_complete' || event.type === 'overlap_warning') {
              return;
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch {
      setCreationStatus(null);
    }
  }

  function handleSSEEvent(bucketId: number, bucketName: string, event: Record<string, unknown>) {
    switch (event.type) {
      case 'bucket_enriching':
        setCreationStatus((prev) => prev ? { ...prev, phase: 'Setting up bucket...' } : null);
        break;
      case 'tier3_progress':
        setCreationStatus((prev) =>
          prev ? { ...prev, phase: 'Checking emails...', checked: (event.current as number) ?? prev.checked } : null,
        );
        break;
      case 'classification_result':
        if ((event.tier as number) === 3) {
          setCreationStatus((prev) => prev ? { ...prev, moved: prev.moved + 1 } : null);
        }
        break;
      case 'overlap_warning':
        setCreationStatus(null);
        setOverlapWarning({
          conflictingBucketName: event.conflictingBucketName as string,
          similarity: event.similarity as number,
          bucketId,
          bucketName,
        });
        break;
      case 'reclassify_complete': {
        const movedCount = (event.movedCount as number) ?? 0;
        setCreationStatus(null);
        setCreationDone({ bucketName, movedCount });
        if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
        doneTimerRef.current = setTimeout(() => {
          setCreationDone(null);
          router.refresh();
        }, 3000);
        break;
      }
    }
  }

  const panelBuckets = buckets.map((b) => ({ ...b, description: null }));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div
          className="flex gap-1 overflow-x-auto flex-1"
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
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', fontWeight: 500 }}
              >
                {uncategorizedCount}
              </span>
            </button>
          )}
        </div>
        <div className="pl-3 pb-1 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <ManageBucketsButton onClick={() => setIsPanelOpen(true)} />
        </div>
      </div>

      {/* Creation progress banner */}
      {creationStatus && (
        <div
          className="flex items-center gap-2 px-4 py-2 body-sm"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
        >
          <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--text-tertiary)', borderTopColor: 'var(--text-primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
          <span>
            {creationStatus.label
              ? `${creationStatus.label}... ${creationStatus.moved} reclassified`
              : creationStatus.phase === 'Setting up bucket...'
                ? `Creating "${creationStatus.bucketName}"... Setting up`
                : `Creating "${creationStatus.bucketName}"... ${creationStatus.checked} checked, ${creationStatus.moved} moved`}
          </span>
        </div>
      )}
      {creationDone && (
        <div
          className="px-4 py-2 body-sm"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-default)', color: 'var(--color-success, var(--text-primary))' }}
        >
          {creationDone.doneLabel ?? `✓ "${creationDone.bucketName}" ready — ${creationDone.movedCount} email${creationDone.movedCount !== 1 ? 's' : ''} moved`}
        </div>
      )}
      {overlapWarning && (
        <div
          className="px-4 py-2 body-sm flex items-center gap-3"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
        >
          <span style={{ color: 'var(--color-warning, #d97706)' }}>
            ⚠ &ldquo;{overlapWarning.bucketName}&rdquo; is {overlapWarning.similarity}% similar to &ldquo;{overlapWarning.conflictingBucketName}&rdquo;.
          </span>
          <button className="btn-ghost btn-sm" style={{ color: 'var(--text-primary)', fontWeight: 600 }} onClick={handleForceCreate}>
            Create anyway
          </button>
          <button className="btn-ghost btn-sm" style={{ color: 'var(--text-tertiary)' }} onClick={() => setOverlapWarning(null)}>
            Cancel
          </button>
        </div>
      )}

      <EmailList
        threads={filteredThreads}
        bucketName={activeId === UNCATEGORIZED_ID ? 'Uncategorized' : (activeBucket?.name ?? 'this bucket')}
        isDemo={isDemo}
      />

      <ManageBucketsPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        buckets={panelBuckets}
        isDemo={isDemo}
        onBucketCreated={handleBucketCreated}
        onBucketDeleted={handleBucketDeleted}
        onBucketsChanged={handleBucketsChanged}
      />
    </div>
  );
}
