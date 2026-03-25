'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { InboxThread } from '@/lib/inbox/get-inbox-threads';
import EmailList from './email-list';
import ClassifyButton, { type ClassifyButtonHandle } from './classify-button';
import ManageBucketsButton from './manage-buckets-button';
import ManageBucketsPanel, { type PanelBucket } from './manage-buckets-panel';
import GraphView from '@/components/graph/graph-view';

interface BucketTabsProps {
  threads: InboxThread[];
  buckets: { id: number; name: string; color: string; sortOrder: number; isDefault: boolean; description: string | null }[];
  isDemo: boolean;
}

interface CreationStatus {
  bucketName: string;
  phase: string;
  checked: number;
  moved: number;
  isEdit: boolean;
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
  isEdit: boolean;
}

const UNCATEGORIZED_ID = -1;

export default function BucketTabs({ threads, buckets: initialBuckets, isDemo }: BucketTabsProps) {
  const router = useRouter();
  const [buckets, setBuckets] = useState(initialBuckets);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [creationStatus, setCreationStatus] = useState<CreationStatus | null>(null);
  const [creationDone, setCreationDone] = useState<CreationDone | null>(null);
  const [overlapWarning, setOverlapWarning] = useState<OverlapWarning | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const classifyButtonRef = useRef<ClassifyButtonHandle>(null);

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

  function handleBucketSaved(bucketId: number, name: string) {
    setBuckets((prev) => prev.map((b) => b.id === bucketId ? { ...b, name } : b));
  }

  function handleBucketCreated(bucket: PanelBucket) {
    setBuckets((prev) => [...prev, bucket]);
    setActiveId(bucket.id);
    startCreationSSE(bucket.id, bucket.name, false);
  }

  function handleBucketUpdated(bucketId: number) {
    const bucket = buckets.find((b) => b.id === bucketId);
    startCreationSSE(bucketId, bucket?.name ?? 'bucket', true);
  }

  function handleForceCreate() {
    if (!overlapWarning) return;
    const { bucketId, bucketName, isEdit } = overlapWarning;
    setOverlapWarning(null);
    startCreationSSE(bucketId, bucketName, isEdit, true);
  }

  function handleBucketDeleted(bucketId: number, _bucketName: string) {
    setBuckets((prev) => {
      const remaining = prev.filter((b) => b.id !== bucketId);
      const directBucket = remaining.find((b) => b.name === 'Direct');
      if (directBucket) setActiveId(directBucket.id);
      return remaining;
    });
    classifyButtonRef.current?.startClassify();
  }

  async function startCreationSSE(bucketId: number, bucketName: string, isEdit: boolean, force = false) {
    setCreationStatus({ bucketName, phase: 'Setting up bucket...', checked: 0, moved: 0, isEdit });
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
            handleSSEEvent(bucketId, bucketName, isEdit, event);
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

  function handleSSEEvent(bucketId: number, bucketName: string, isEdit: boolean, event: Record<string, unknown>) {
    switch (event.type) {
      case 'bucket_enriching':
        setCreationStatus((prev) => prev ? { ...prev, phase: 'Setting up bucket...' } : null);
        break;
      case 'reclassify_progress':
        setCreationStatus((prev) =>
          prev ? { ...prev, phase: 'Scanning...', checked: (event.checked as number) ?? prev.checked, moved: (event.moved as number) ?? prev.moved } : null,
        );
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
      case 'eviction_complete': {
        const evicted = event.evictedCount as number;
        if (evicted > 0) {
          setCreationStatus((prev) =>
            prev ? { ...prev, phase: `↩ ${evicted} emails re-evaluated` } : null,
          );
        }
        break;
      }
      case 'overlap_warning':
        setCreationStatus(null);
        setOverlapWarning({
          conflictingBucketName: event.conflictingBucketName as string,
          similarity: event.similarity as number,
          bucketId,
          bucketName,
          isEdit,
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

  const panelBuckets = buckets.map((b) => ({ ...b }));

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="heading-xl" style={{ color: 'var(--text-primary)' }}>Inbox</h1>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-0.5 rounded-md p-0.5"
            style={{ border: '1px solid var(--border-default)' }}
          >
            <button
              onClick={() => setView('list')}
              title="List view"
              className="rounded p-1.5 transition-colors duration-150"
              style={{
                background: view === 'list' ? 'var(--bg-tertiary)' : 'transparent',
                color: view === 'list' ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              {/* List icon */}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="3" y1="4" x2="11" y2="4" />
                <line x1="3" y1="7" x2="11" y2="7" />
                <line x1="3" y1="10" x2="11" y2="10" />
              </svg>
            </button>
            <button
              onClick={() => setView('graph')}
              title="Graph view"
              className="rounded p-1.5 transition-colors duration-150"
              style={{
                background: view === 'graph' ? 'var(--bg-tertiary)' : 'transparent',
                color: view === 'graph' ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              {/* Scatter/cluster icon */}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="4" cy="4" r="1.5" />
                <circle cx="10" cy="3" r="1.5" />
                <circle cx="3" cy="10" r="1.5" />
                <circle cx="9" cy="10" r="1.5" />
                <circle cx="7" cy="7" r="1.5" />
              </svg>
            </button>
          </div>
          <ClassifyButton ref={classifyButtonRef} isDemo={isDemo} />
          <ManageBucketsButton onClick={() => setIsPanelOpen(true)} />
        </div>
      </div>

      {view === 'graph' && <GraphView />}

      {view === 'list' && (<>
      <div className="flex items-center mb-1">
        <div
          className="flex gap-1 overflow-x-auto scrollbar-hide flex-1"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          {buckets.map((bucket) => {
            const isActive = activeId === bucket.id;
            const count = countFor(bucket.id);
            return (
              <button
                key={bucket.id}
                onClick={() => setActiveId(bucket.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm whitespace-nowrap transition-colors duration-150 cursor-pointer rounded-t${!isActive ? ' hover:bg-secondary' : ''}`}
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
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm whitespace-nowrap transition-colors duration-150 cursor-pointer rounded-t${activeId !== UNCATEGORIZED_ID ? ' hover:bg-secondary' : ''}`}
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
      </div>

      {/* Creation progress banner */}
      {creationStatus && (
        <div
          className="flex items-center gap-2 px-4 py-2 body-sm"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
        >
          <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--text-tertiary)', borderTopColor: 'var(--text-primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
          <span>
            {(() => {
              const verb = creationStatus.isEdit ? 'Updating' : 'Creating';
              if (creationStatus.label) return `${creationStatus.label}... ${creationStatus.moved} reclassified`;
              if (creationStatus.phase === 'Setting up bucket...') return `${verb} "${creationStatus.bucketName}"... Setting up`;
              return `${verb} "${creationStatus.bucketName}"... ${creationStatus.checked} checked, ${creationStatus.moved} moved`;
            })()}
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
      </>)}

      <ManageBucketsPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        buckets={panelBuckets}
        isDemo={isDemo}
        onBucketCreated={handleBucketCreated}
        onBucketDeleted={handleBucketDeleted}
        onBucketUpdated={handleBucketUpdated}
        onBucketSaved={handleBucketSaved}
        onBucketsChanged={handleBucketsChanged}
      />
    </div>
  );
}
