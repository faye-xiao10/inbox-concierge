'use client';

import { createPortal } from 'react-dom';
import type { EmailNode } from '@/lib/inbox/get-graph-data';
import { formatTimestamp } from '@/lib/inbox/format-timestamp';

interface TooltipProps {
  node: EmailNode | null;
  x: number;
  y: number;
  visible: boolean;
}

export default function GraphTooltip({ node, x, y, visible }: TooltipProps) {
  if (typeof document === 'undefined') return null;

  // Positioning logic remains same
  const flipLeft = x > window.innerWidth - 300;
  const left = flipLeft ? x - 292 : x + 12;
  const top = y < 140 ? y + 20 : y - 8;

  const tier = node?.classificationTier ?? 0;

  // Semantic color mapping from STYLE.md
  const tierStyles = {
    3: { bg: 'rgba(181, 84, 78, 0.15)', text: 'var(--color-error)' }, // Tier 3 - Red/Error
    2: { bg: 'rgba(196, 147, 63, 0.15)', text: 'var(--color-warning)' }, // Tier 2 - Gold/Warning
    1: { bg: 'rgba(91, 127, 165, 0.15)', text: 'var(--color-info)' }, // Tier 1 - Blue/Info
    0: { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)' }, // Tier 0 - Neutral
  };

  const currentTier = tierStyles[tier as keyof typeof tierStyles] || tierStyles[0];

  const urgencyColor =
    (node?.urgencyScore ?? 0) > 0.7 ? 'var(--color-error)' :
    (node?.urgencyScore ?? 0) > 0.4 ? 'var(--color-warning)' : 'var(--color-success)';

  const tooltip = (
    <div
      className="w-72 overflow-hidden"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 180ms ease',
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        fontFamily: 'var(--font-body, sans-serif)',
      }}
    >
      {/* Zone 1 — Header (Subject + Sender) */}
      <div className="px-3 pt-3 pb-2" style={{ background: 'var(--bg-secondary)' }}>
        <p style={{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          lineHeight: 1.25,
          margin: 0,
        }}>
          {node?.subject || '(No subject)'}
        </p>
        <p style={{
          fontSize: '11px',
          color: 'var(--text-secondary)',
          margin: '4px 0 0',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '8px',
        }}>
          <span>{node?.senderName} · {node?.senderEmail}</span>
          <span style={{ flexShrink: 0, color: 'var(--text-tertiary)' }}>
            {node?.timestamp ? formatTimestamp(new Date(node.timestamp)) : ''}
          </span>
        </p>
      </div>

      <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

      {/* Zone 2 — Body (Snippet) */}
      <div className="px-3 py-2" style={{ background: 'var(--bg-primary)' }}>
        <p style={{
          fontSize: '11px',
          color: 'var(--text-secondary)',
          lineHeight: 1.55, // Matched to STYLE.md
          margin: 0,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {node?.snippet}
        </p>
      </div>

      <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

      {/* Zone 3 — Footer (Meta Data) */}
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap" style={{ background: 'var(--bg-secondary)' }}>
        {/* Confidence Percentage */}
        <span style={{
          fontSize: '11px', 
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '0.02em',
        }}>
          {Math.round((node?.confidence ?? 1) * 100)}% Confidence
        </span>

        {/* Tier Badge */}
        <span style={{
          fontSize: '10px', 
          fontWeight: 700,
          padding: '1px 6px', 
          borderRadius: 'var(--radius-sm)',
          letterSpacing: '0.05em', 
          textTransform: 'uppercase',
          background: currentTier.bg, 
          color: currentTier.text,
        }}>
          T{tier}
        </span>

        {/* Urgency Score + Indicator */}
        <span style={{
          fontSize: '11px', 
          color: 'var(--text-secondary)',
          display: 'flex', 
          alignItems: 'center', 
          gap: '5px',
        }}>
          <span style={{
            width: '6px', 
            height: '6px', 
            borderRadius: 'var(--radius-full)',
            background: urgencyColor, 
            display: 'inline-block',
          }} />
          {(node?.urgencyScore ?? 0).toFixed(1)} Urgency
        </span>

        {/* Security Warning Badge */}
        {(node?.securityFlags?.length ?? 0) > 0 && (
          <span style={{
            fontSize: '10px', 
            fontWeight: 700,
            color: 'var(--color-error)',
            background: 'var(--accent-subtle)',
            padding: '1px 6px', 
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(181, 84, 78, 0.2)',
          }}>
            ⚠ {node!.securityFlags[0]}
          </span>
        )}
      </div>
    </div>
  );

  return createPortal(tooltip, document.body);
}