'use client';

import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { useRouter } from 'next/navigation';
import type { PipelineEvent, PipelineMetrics } from '@/lib/pipeline/orchestrator';

interface ClassifyButtonProps {
  isDemo: boolean;
  onRunningChange?: (isRunning: boolean) => void;
}

export interface ClassifyButtonHandle {
  startClassify: () => void;
}

type ClassifyStatus = 'idle' | 'running' | 'complete' | 'error';

const ClassifyButton = forwardRef<ClassifyButtonHandle, ClassifyButtonProps>(function ClassifyButton({ isDemo, onRunningChange }, ref) {
  const router = useRouter();
  const [status, setStatus] = useState<ClassifyStatus>('idle');
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [tier3Done, setTier3Done] = useState(0);
  const [tier3Total, setTier3Total] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleEvent(event: PipelineEvent) {
    switch (event.type) {
      case 'sync_progress':
        setProgress({ current: event.current, total: event.total });
        setStage(`Syncing emails ${event.current}/${event.total}...`);
        break;
      case 'embed_progress':
        setProgress({ current: event.current, total: event.total });
        setStage(`Embedding ${event.current}/${event.total}...`);
        break;
      case 'tier2_progress':
        setProgress({ current: event.current, total: event.total });
        setStage(`Semantic matching ${event.current}/${event.total}...`);
        break;
      case 'tier3_progress':
        setTier3Total(event.total);
        setProgress({ current: event.current, total: event.total });
        break;
      case 'classification_result':
        if (event.tier === 3) setTier3Done((n) => n + 1);
        break;
      case 'sync_complete': setProgress(null); setStage('Analyzing emails...'); break;
      case 'embed_complete': setStage('Running security scan...'); break;
      case 'security_complete': setStage('Applying rules...'); break;
      case 'tier0_complete':
      case 'tier1_complete': setStage('Semantic matching...'); break;
      case 'tier2_complete': setStage('AI classification...'); break;
      case 'tier3_complete': setTier3Done(0); setTier3Total(null); setStage('Scoring urgency...'); break;
      case 'triage_complete': setStage('Finishing up...'); break;
      case 'pipeline_complete':
        setMetrics(event.metrics);
        setStatus('complete');
        onRunningChange?.(false);
        router.refresh();
        // Auto-reset to idle after 3s
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
          setStatus('idle');
          setMetrics(null);
        }, 3000);
        break;
      case 'error':
        setStatus('error');
        setErrorMessage(event.message);
        onRunningChange?.(false);
        break;
    }
  }

  async function startClassify() {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setStatus('running');
    onRunningChange?.(true);
    setProgress(null);
    setTier3Done(0);
    setTier3Total(null);
    setMetrics(null);
    setErrorMessage('');
    setStage(isDemo ? 'Classifying demo data...' : 'Starting pipeline...');

    const response = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      setStatus('error');
      setErrorMessage(err.error ?? 'Classification failed');
      return;
    }

    const reader = response.body!.getReader();
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
          const event = JSON.parse(line.slice(6)) as PipelineEvent;
          handleEvent(event);
        } catch { /* malformed event, skip */ }
      }
    }

    setStatus((s) => (s === 'running' ? 'complete' : s));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({ startClassify }), []);

  // Button is always rendered — state controls label and disabled
  const inTier3 = tier3Done > 0 || tier3Total !== null;
  const runningLabel = inTier3
    ? `Classifying... ${tier3Done}${tier3Total !== null ? `/${tier3Total}` : ''}`
    : (stage || 'Classifying...');

  if (status === 'running') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2 body-sm" style={{ color: 'var(--text-secondary)' }}>
          <span className="inline-block w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
          {runningLabel}
        </div>
        {progress && (
          <div className="flex items-center gap-2 body-sm" style={{ color: 'var(--text-tertiary)' }}>
            <div className="w-32 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ backgroundColor: 'var(--accent-primary)', width: `${Math.round((progress.current / progress.total) * 100)}%` }} />
            </div>
            {progress.current}/{progress.total}
          </div>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-3">
        <span className="body-sm" style={{ color: 'var(--color-error)' }}>⚠ {errorMessage}</span>
        <button className="btn-ghost btn-sm" onClick={() => { setStatus('idle'); setErrorMessage(''); }}>
          Retry
        </button>
      </div>
    );
  }

  // idle or complete — always show the primary button
  return (
    <button className="btn-primary btn-md" onClick={startClassify}>
      {status === 'complete' && metrics ? `✓ ${metrics.totalThreads} classified` : 'Classify Inbox'}
    </button>
  );
});

export default ClassifyButton;
