'use client';

import { useState } from 'react';
import type { FilterState } from './filter-types';
import { DEFAULT_FILTER_STATE } from './filter-types';

interface FilterPanelProps {
  filterState: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  buckets: Array<{ id: number; name: string; color: string }>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 28,
        height: 16,
        borderRadius: 8,
        background: checked ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
        border: '1px solid',
        borderColor: checked ? 'var(--accent-primary)' : 'var(--border-default)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 150ms ease, border-color 150ms ease',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 1,
          left: checked ? 13 : 1,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 150ms ease',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          display: 'block',
        }}
      />
    </button>
  );
}

function SectionHeader({ title, expanded, onToggle }: { title: string; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '8px 16px',
        background: 'none',
        border: 'none',
        borderBottom: '1px solid var(--border-default)',
        cursor: 'pointer',
      }}
    >
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-secondary)',
      }}>
        {title}
      </span>
      <span style={{
        color: 'var(--text-tertiary)',
        fontSize: 14,
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 200ms ease',
        lineHeight: 1,
      }}>
        ›
      </span>
    </button>
  );
}

function SliderRow({ label, value, min, max, step, format, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
      />
    </div>
  );
}

function isNonDefault(fs: FilterState): boolean {
  return (
    fs.keyword !== DEFAULT_FILTER_STATE.keyword ||
    fs.activeBucketIds.size > 0 ||
    fs.minConfidence !== DEFAULT_FILTER_STATE.minConfidence ||
    fs.minUrgency !== DEFAULT_FILTER_STATE.minUrgency ||
    fs.nodeSizeMultiplier !== DEFAULT_FILTER_STATE.nodeSizeMultiplier ||
    fs.textFadeZoom !== DEFAULT_FILTER_STATE.textFadeZoom
  );
}

function EncodingIcon({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
      {children}
    </div>
  );
}

// Inline circle with optional border ring
function Dot({ color, border }: { color: string; border?: string }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: color,
      border: border ? `2px solid ${border}` : 'none',
      flexShrink: 0,
    }} />
  );
}

export default function FilterPanel({ filterState, onChange, onReset, buckets }: FilterPanelProps) {
  const [legendOpen, setLegendOpen] = useState(true); 
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [displayOpen, setDisplayOpen] = useState(true);


  function toggleBucket(id: number) {
    const current = filterState.activeBucketIds;
    let next: Set<number>;
    if (current.size === 0) {
      next = new Set(buckets.map((b) => b.id).filter((bid) => bid !== id));
    } else {
      next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === buckets.length) next = new Set();
    }
    onChange({ activeBucketIds: next });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Panel title: Fixed at top ── */}
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          Classifications
        </span>
      </div>

      {/* ── All sections are now inside this single scrollable container ── */}
      <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── 1. Legend Section (Default Open) ── */}
        <SectionHeader title="Legend" expanded={legendOpen} onToggle={() => setLegendOpen(!legendOpen)} />
        <div style={{ overflow: 'hidden', maxHeight: legendOpen ? '400px' : '0', transition: 'max-height 200ms ease' }}>
          <div style={{ padding: '12px 16px' }}>
            
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>
              Border Legend
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <LegendRow icon={<Dot color="var(--bg-tertiary)" border="var(--border-default)" />} label="No border — Auto-classified" />
              <LegendRow icon={<Dot color="var(--bg-tertiary)" border="#8a775e" />} label="Espresso — AI Match" />
              <LegendRow icon={<Dot color="var(--bg-tertiary)" border="#E53935" />} label="Red — LLM-reviewed" />
            </div>

            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginTop: 18, marginBottom: 8 }}>
              Visual Encoding
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <LegendRow 
                icon={
                  <EncodingIcon>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
                      <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
                    </div>
                  </EncodingIcon>
                } 
                label="Size = Urgency" 
              />
              <LegendRow 
                icon={
                  <EncodingIcon>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-tertiary)', opacity: 1 }} />
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-tertiary)', opacity: 0.6 }} />
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-tertiary)', opacity: 0.25 }} />
                    </div>
                  </EncodingIcon>
                } 
                label="Opacity = Recency" 
              />
            </div>
          </div>
        </div>

        {/* ── 2. Filters Section ── */}
        <SectionHeader title="Filters" expanded={filtersOpen} onToggle={() => setFiltersOpen(!filtersOpen)} />
        <div style={{ overflow: 'hidden', maxHeight: filtersOpen ? '800px' : '0', transition: 'max-height 200ms ease' }}>
          <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Keyword search */}
            <div style={{ position: 'relative' }}>
              <svg
                style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }}
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search emails…"
                value={filterState.keyword}
                onChange={(e) => onChange({ keyword: e.target.value })}
                style={{
                  width: '100%',
                  paddingLeft: 28,
                  paddingRight: 8,
                  paddingTop: 6,
                  paddingBottom: 6,
                  fontSize: 12,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Bucket toggles */}
            {buckets.length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                  Buckets
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {buckets.map((b) => {
                    const isOn = filterState.activeBucketIds.size === 0 || filterState.activeBucketIds.has(b.id);
                    return (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                        </div>
                        <Toggle checked={isOn} onChange={() => toggleBucket(b.id)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <SliderRow
              label="Confidence"
              value={filterState.minConfidence}
              min={0} max={1} step={0.01}
              format={(v) => `≥ ${Math.round(v * 100)}%`}
              onChange={(v) => onChange({ minConfidence: v })}
            />

            <SliderRow
              label="Urgency"
              value={filterState.minUrgency}
              min={0} max={1} step={0.01}
              format={(v) => `≥ ${v.toFixed(2)}`}
              onChange={(v) => onChange({ minUrgency: v })}
            />
          </div>
        </div>

        {/* ── 3. Display Section ── */}
        <SectionHeader title="Display" expanded={displayOpen} onToggle={() => setDisplayOpen(!displayOpen)} />
        <div style={{ overflow: 'hidden', maxHeight: displayOpen ? '300px' : '0', transition: 'max-height 200ms ease' }}>
          <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SliderRow
              label="Node size"
              value={filterState.nodeSizeMultiplier}
              min={0.5} max={2} step={0.1}
              format={(v) => `${v.toFixed(1)}×`}
              onChange={(v) => onChange({ nodeSizeMultiplier: v })}
            />
          </div>
        </div>
      </div>

      {/* ── Reset button: Fixed at bottom ── */}
      <div style={{ borderTop: '1px solid var(--border-default)', padding: '10px 16px', flexShrink: 0 }}>
        <button
          className="btn-ghost btn-sm w-full"
          onClick={onReset}
          disabled={!isNonDefault(filterState)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' }}
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>↺</span>
          Reset filters
        </button>
      </div>
    </div>
  );
}

function LegendRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      {icon}
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{label}</span>
    </div>
  );
}
