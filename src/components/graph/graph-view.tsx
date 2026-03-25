'use client';

import { useEffect, useRef, useState } from 'react';
import type { EmailNode } from '@/lib/inbox/get-graph-data';
import EmailGraph from './email-graph';

export default function GraphView() {
  const [nodes, setNodes] = useState<EmailNode[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

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

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 400 }}>
        <div
          style={{
            width: 24,
            height: 24,
            border: '3px solid var(--border-default)',
            borderTopColor: 'var(--accent-primary)',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }}
        />
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3"
        style={{ height: 400, color: 'var(--text-secondary)' }}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="7" cy="7" r="2" />
          <circle cx="17" cy="7" r="2" />
          <circle cx="12" cy="17" r="2" />
          <circle cx="4" cy="17" r="2" />
          <circle cx="20" cy="17" r="2" />
        </svg>
        <p className="body-sm text-center" style={{ maxWidth: 280 }}>
          Run <strong>Classify Inbox</strong> to generate the graph view
        </p>
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="border border-black/10 rounded-lg shadow-sm" style={{ width: '100%', overflow: 'hidden' }}>
        <EmailGraph nodes={nodes} width={dimensions.width} height={dimensions.height} />
      </div>
      <p className="text-sm text-center mt-2 opacity-50 select-none">
        Each dot is an email &nbsp;·&nbsp; Size = urgency &nbsp;·&nbsp; Color = bucket &nbsp;·&nbsp; Opacity = recency &nbsp;·&nbsp; Scroll to zoom &nbsp;·&nbsp; Click a node to inspect
      </p>
    </>
  );
}
