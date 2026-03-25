'use client';

import type { PipelineMetrics } from '@/lib/pipeline/orchestrator';

interface MetricsPanelProps {
  metrics: PipelineMetrics | null;
  isRunning: boolean;
}

function Card({ value, label, subtext, pulse }: any) {
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
      borderRadius: 12,
      padding: '24px 20px',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '160px' // Slightly taller to accommodate the new stacked layouts
    }}>
      <div className={pulse ? 'animate-pulse' : ''} style={{
        fontSize: typeof value === 'string' ? '2.5rem' : 'inherit',
        fontWeight: 800,
        color: pulse ? 'transparent' : 'var(--text-primary)',
        lineHeight: 1,
        background: pulse ? 'var(--bg-tertiary)' : 'transparent',
        borderRadius: pulse ? 4 : 0,
        minWidth: 100,
      }}>
        {pulse ? '\u00a0' : value}
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 16 }}> {/* Added padding-top for spacing */}
        <div style={{ color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.1em' }}>
          {label}
        </div>
        {subtext && (
          <div style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: '14px', fontWeight: 600 }}>
            {subtext}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MetricsPanel({ metrics, isRunning }: MetricsPanelProps) {
  if (!metrics && !isRunning) return null;
  const pulse = isRunning && !metrics;

  const getAvg = (tier: number) => metrics?.avgConfidenceByTier.find((r) => r.tier === tier)?.avg ?? 100;

  const automatedCount = (metrics?.tier0Count ?? 0) + (metrics?.tier1Count ?? 0) + (metrics?.tier2Count ?? 0);
  const efficiency = metrics ? Math.round((automatedCount / metrics.totalThreads) * 100) : 0;

  const efficiencyValue = (
    <div>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8 }}>
        {metrics ? `Automated: ${automatedCount} / ${metrics.totalThreads}` : '---'}
      </div>
      <div style={{ fontSize: '2.5rem' }}>{efficiency}%</div>
    </div>
  );

  const TierBreakdown = metrics ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: 4 }}>
      <TierRow label="Gmail Native" code="T0" count={metrics.tier0Count} color="var(--text-primary)" isBold />
      <TierRow label="Domain Rules" code="T1" count={metrics.tier1Count} color="var(--text-secondary)" />
      <TierRow label="Vector Memory" code="T2" count={metrics.tier2Count} color="var(--text-secondary)" />
      <TierRow label="Claude 3.5 (LLM)" code="T3" count={metrics.tier3Count} color="var(--accent-primary)" isBold />
    </div>
  ) : null;

  const ConfidenceBreakdown = metrics ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: 4 }}>
      <TierRow label="Gmail Precision" code="T0" count={`${Math.round(getAvg(0))}%`} color="var(--text-primary)" isBold />
      <TierRow label="Rule Accuracy" code="T1" count={`${Math.round(getAvg(1))}%`} color="var(--text-secondary)" />
      <TierRow label="Vector Similarity" code="T2" count={`${Math.round(getAvg(2))}%`} color="var(--text-secondary)" />
      <TierRow label="LLM Reasoning" code="T3" count={`${Math.round(getAvg(3))}%`} color="var(--accent-primary)" isBold />
    </div>
  ) : null;

  return (
    <div style={{ marginTop: 48, paddingBottom: 60 }}>
      <h2 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 24 }}>
        Pipeline Performance
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        <Card value={efficiencyValue} label="AI Efficiency" subtext="LLM Offload Rate" pulse={pulse} />
        <Card value={TierBreakdown} label="Classification Method" subtext="Processing Hierarchy" pulse={pulse} />
        <Card value={metrics ? String(metrics.llmCalls) : ''} label="Total AI Operations" subtext="Batched API Calls" pulse={pulse} />
        <Card value={ConfidenceBreakdown} label="Avg Confidence" subtext="Model certainty per tier" pulse={pulse} />
        <Card value={metrics ? String(metrics.exemplarsAdded) : ''} label="Exemplars" subtext="New patterns learned" pulse={pulse} />
        <Card value={metrics ? `${(metrics.durationMs / 1000).toFixed(1)}s` : ''} label="Processing Time" subtext="Pipeline duration" pulse={pulse} />
      </div>

      <div style={{ 
        marginTop: 32, 
        padding: '24px', 
        background: 'var(--bg-secondary)', 
        borderRadius: 12, 
        border: '1px solid var(--border-default)',
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
          System Methodology
        </h3>
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '20px 40px'
        }}>
          <MethodologyItem code="T0" title="Gmail Native" desc="Fastest. Uses existing Google system labels and metadata." />
          <MethodologyItem code="T1" title="Domain Rules" desc="Deterministic. Matches trusted sender domains with 100% accuracy." />
          <MethodologyItem code="T2" title="Vector Memory" desc="Learned. Uses pgvector similarity search to match previous user actions." />
          <MethodologyItem code="T3" title="Claude 3.5" desc="Intelligent. Deep reasoning fallback for complex or unseen email types." />
        </div>
      </div>
    </div>
  );
}

function TierRow({ label, code, count, color, isBold }: any) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color, fontWeight: isBold ? 800 : 500 }}>
      <span><strong style={{ opacity: isBold ? 1 : 0.5, marginRight: 6 }}>{code}</strong> {label}</span>
      <span>{count}</span>
    </div>
  );
}

function MethodologyItem({ code, title, desc }: any) {
  return (
    <div style={{ fontSize: '13px', lineHeight: 1.5 }}>
      <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: 2 }}>
        <span style={{ color: 'var(--text-tertiary)', marginRight: 4 }}>{code}</span> {title}
      </div>
      <div style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>{desc}</div>
    </div>
  );
}