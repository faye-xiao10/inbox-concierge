'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EmailNode } from '@/lib/inbox/get-graph-data';
import type { FilterState } from './filter-types';
import { DEFAULT_FILTER_STATE } from './filter-types';
import type { PipelineMetrics } from '@/lib/pipeline/orchestrator';
import EmailGraph from './email-graph';
import FilterPanel from './filter-panel';
import MetricsPanel from './metrics-panel';

interface GraphViewProps {
  isDemo?: boolean;
  metrics?: PipelineMetrics | null;
  isRunning?: boolean;
}

interface Toast {
  message: string;
  visible: boolean;
}

export default function GraphView({ isDemo, metrics = null, isRunning = false }: GraphViewProps) {
  const [nodes, setNodes] = useState<EmailNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [toast, setToast] = useState<Toast | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/graph-data')
      .then((res) => res.json())
      .then((data: EmailNode[]) => setNodes(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: Math.floor(entry.contentRect.width),
          height: Math.max(520, Math.floor(window.innerHeight - 160)),
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const buckets = useMemo(() => {
    const seen = new Map<number, { id: number; name: string; color: string }>();
    for (const node of nodes) {
      if (!seen.has(node.bucketId)) {
        seen.set(node.bucketId, { id: node.bucketId, name: node.bucketName, color: node.bucketColor });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [nodes]);

  function showToast(message: string) {
    setToast({ message, visible: true });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  async function handleReclassify(threadId: string, newBucketId: number) {
    const bucketName = buckets.find((b) => b.id === newBucketId)?.name ?? 'new bucket';

    if (isDemo) {
      showToast(`Moved to ${bucketName} · demo mode`);
      return;
    }

    showToast(`Moved to ${bucketName} · system learned from your correction`);

    try {
      const res = await fetch('/api/reclassify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, newBucketId }),
      });

      if (!res.ok) throw new Error('API error');

      const { reEvaluated } = await res.json() as { reEvaluated: { threadId: string; newBucketId: number }[] };

      if (reEvaluated.length > 0) {
        setNodes((prev) => {
          const map = new Map(reEvaluated.map((r) => [r.threadId, r.newBucketId]));
          return prev.map((n) => {
            const newId = map.get(n.threadId);
            if (!newId) return n;
            const bucket = buckets.find((b) => b.id === newId);
            return { ...n, bucketId: newId, bucketName: bucket?.name ?? n.bucketName, bucketColor: bucket?.color ?? n.bucketColor };
          });
        });
      }
    } catch {
      showToast('Move failed — email stayed in original bucket');
    }
  }

  if (isMobile) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-lg"
        style={{
          height: 200,
          border: '1px solid var(--border-default)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="2" />
        </svg>
        <p className="body-sm text-center" style={{ maxWidth: 240 }}>
          Graph view requires a larger screen. Switch to list view on mobile.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 400 }}>
        <div style={{
          width: 24, height: 24,
          border: '3px solid var(--border-default)',
          borderTopColor: 'var(--accent-primary)',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3"
        style={{ height: 400, color: 'var(--text-secondary)' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="7" cy="7" r="2" /><circle cx="17" cy="7" r="2" /><circle cx="12" cy="17" r="2" />
          <circle cx="4" cy="17" r="2" /><circle cx="20" cy="17" r="2" />
        </svg>
        <p className="body-sm text-center" style={{ maxWidth: 280 }}>
          Run <strong>Classify Inbox</strong> to generate the graph view
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border border-black/10 rounded-lg shadow-sm"
        style={{ width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>
        <div ref={containerRef} style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <EmailGraph
            nodes={nodes}
            width={dimensions.width}
            height={dimensions.height}
            filterState={filterState}
            onReclassify={handleReclassify}
          />
        </div>
        <div style={{
          width: 260, flexShrink: 0,
          borderLeft: '1px solid var(--border-default)',
          background: 'var(--bg-elevated)',
          height: dimensions.height,
          overflowY: 'auto',
          boxShadow: '-2px 0 8px rgba(59,50,38,0.04)',
        }}>
          <FilterPanel
            filterState={filterState}
            onChange={(patch) => setFilterState((prev) => ({ ...prev, ...patch }))}
            onReset={() => setFilterState(DEFAULT_FILTER_STATE)}
            buckets={buckets}
          />
        </div>
      </div>

      <p className="text-sm text-center mt-2 opacity-50 select-none">
        Each dot is an email &nbsp;·&nbsp; Size = urgency &nbsp;·&nbsp; Color = bucket &nbsp;·&nbsp; Opacity = recency &nbsp;·&nbsp; Scroll to zoom &nbsp;·&nbsp; Drag a node to reclassify
      </p>

      <MetricsPanel metrics={metrics} isRunning={isRunning} />

      {/* Toast */}
      <div style={{
        position: 'fixed',
        bottom: 32,
        left: '50%',
        transform: `translateX(-50%) translateY(${toast?.visible ? '0' : '12px'})`,
        opacity: toast?.visible ? 1 : 0,
        transition: 'opacity 200ms ease, transform 200ms ease',
        pointerEvents: 'none',
        zIndex: 1000,
      }}>
        <div style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          padding: '8px 16px',
          fontSize: 13,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}>
          {toast?.message}
        </div>
      </div>
    </>
  );
}
