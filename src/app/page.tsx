import Link from 'next/link';
import PipelineAnimation from '@/components/landing/pipeline-animation';

// ─── Graph node data ──────────────────────────────────────────────────────────

type NodeData = {
  cx: number; cy: number; r: number; fill: string;
  anim: string; dur: number; delay: number; strokeColor?: string;
};

const GRAPH_NODES: NodeData[] = [
  // Direct — blue #3B82F6, upper left
  { cx: 75, cy: 65, r: 10, fill: '#3B82F6', anim: 'lp-float-a', dur: 4.2, delay: 0 },
  { cx: 55, cy: 50, r: 7, fill: '#3B82F6', anim: 'lp-float-b', dur: 3.8, delay: 0.5 },
  { cx: 97, cy: 48, r: 8, fill: '#3B82F6', anim: 'lp-float-c', dur: 4.5, delay: 1.1, strokeColor: '#EAB308' },
  { cx: 60, cy: 80, r: 6, fill: '#3B82F6', anim: 'lp-float-d', dur: 3.6, delay: 0.3 },
  { cx: 90, cy: 82, r: 9, fill: '#3B82F6', anim: 'lp-float-a', dur: 4.8, delay: 0.9 },
  { cx: 44, cy: 68, r: 7, fill: '#3B82F6', anim: 'lp-float-e', dur: 4.1, delay: 1.5 },
  { cx: 108, cy: 67, r: 6, fill: '#3B82F6', anim: 'lp-float-b', dur: 3.9, delay: 0.7 },
  { cx: 70, cy: 95, r: 8, fill: '#3B82F6', anim: 'lp-float-f', dur: 4.4, delay: 1.8 },
  { cx: 102, cy: 90, r: 6, fill: '#3B82F6', anim: 'lp-float-c', dur: 4.0, delay: 2.1, strokeColor: '#EF4444' },
  // Updates — amber #F59E0B, upper right
  { cx: 265, cy: 55, r: 9, fill: '#F59E0B', anim: 'lp-float-b', dur: 4.3, delay: 0.6 },
  { cx: 247, cy: 41, r: 7, fill: '#F59E0B', anim: 'lp-float-a', dur: 3.7, delay: 1.2 },
  { cx: 284, cy: 42, r: 8, fill: '#F59E0B', anim: 'lp-float-d', dur: 4.6, delay: 0.2 },
  { cx: 250, cy: 68, r: 6, fill: '#F59E0B', anim: 'lp-float-e', dur: 3.9, delay: 1.7 },
  { cx: 279, cy: 70, r: 10, fill: '#F59E0B', anim: 'lp-float-c', dur: 4.2, delay: 0.4 },
  { cx: 300, cy: 55, r: 7, fill: '#F59E0B', anim: 'lp-float-f', dur: 4.0, delay: 1.0 },
  { cx: 240, cy: 53, r: 8, fill: '#F59E0B', anim: 'lp-float-a', dur: 4.5, delay: 2.3, strokeColor: '#EAB308' },
  { cx: 294, cy: 73, r: 6, fill: '#F59E0B', anim: 'lp-float-b', dur: 3.8, delay: 0.8 },
  { cx: 260, cy: 78, r: 7, fill: '#F59E0B', anim: 'lp-float-e', dur: 4.1, delay: 1.4 },
  // Newsletters — teal #14B8A6, center
  { cx: 175, cy: 122, r: 8, fill: '#14B8A6', anim: 'lp-float-c', dur: 4.4, delay: 0.3 },
  { cx: 158, cy: 109, r: 7, fill: '#14B8A6', anim: 'lp-float-a', dur: 4.0, delay: 1.6 },
  { cx: 193, cy: 111, r: 6, fill: '#14B8A6', anim: 'lp-float-d', dur: 3.8, delay: 0.9 },
  { cx: 160, cy: 135, r: 9, fill: '#14B8A6', anim: 'lp-float-b', dur: 4.7, delay: 2.0, strokeColor: '#EAB308' },
  { cx: 190, cy: 136, r: 7, fill: '#14B8A6', anim: 'lp-float-f', dur: 4.2, delay: 0.5 },
  { cx: 207, cy: 122, r: 8, fill: '#14B8A6', anim: 'lp-float-e', dur: 3.9, delay: 1.2 },
  { cx: 144, cy: 124, r: 6, fill: '#14B8A6', anim: 'lp-float-a', dur: 4.5, delay: 0.7 },
  // Promotions — green #22C55E, lower right
  { cx: 297, cy: 176, r: 9, fill: '#22C55E', anim: 'lp-float-e', dur: 4.1, delay: 1.3 },
  { cx: 279, cy: 163, r: 7, fill: '#22C55E', anim: 'lp-float-b', dur: 4.5, delay: 0.6 },
  { cx: 314, cy: 163, r: 8, fill: '#22C55E', anim: 'lp-float-d', dur: 3.9, delay: 2.1 },
  { cx: 276, cy: 187, r: 6, fill: '#22C55E', anim: 'lp-float-a', dur: 4.3, delay: 0.1 },
  { cx: 310, cy: 190, r: 10, fill: '#22C55E', anim: 'lp-float-c', dur: 4.7, delay: 1.8 },
  { cx: 331, cy: 176, r: 7, fill: '#22C55E', anim: 'lp-float-f', dur: 4.0, delay: 0.4, strokeColor: '#EF4444' },
  { cx: 320, cy: 150, r: 6, fill: '#22C55E', anim: 'lp-float-e', dur: 3.7, delay: 1.0 },
  { cx: 293, cy: 201, r: 8, fill: '#22C55E', anim: 'lp-float-b', dur: 4.4, delay: 2.4 },
  // Auto-Archive — gray #6B7280, lower left
  { cx: 70, cy: 172, r: 8, fill: '#6B7280', anim: 'lp-float-d', dur: 4.2, delay: 1.1 },
  { cx: 52, cy: 159, r: 6, fill: '#6B7280', anim: 'lp-float-a', dur: 4.6, delay: 0.3 },
  { cx: 89, cy: 159, r: 7, fill: '#6B7280', anim: 'lp-float-c', dur: 3.8, delay: 1.9 },
  { cx: 48, cy: 180, r: 9, fill: '#6B7280', anim: 'lp-float-f', dur: 4.4, delay: 0.8 },
  { cx: 86, cy: 184, r: 6, fill: '#6B7280', anim: 'lp-float-b', dur: 4.0, delay: 1.5 },
  { cx: 68, cy: 195, r: 8, fill: '#6B7280', anim: 'lp-float-e', dur: 3.9, delay: 2.2 },
  { cx: 106, cy: 172, r: 7, fill: '#6B7280', anim: 'lp-float-a', dur: 4.3, delay: 0.6 },
];

// ─── Feature cards ────────────────────────────────────────────────────────────

type Feature = { icon: React.ReactNode; title: string; body: string };

const FEATURES: Feature[] = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <path d="M3 4h18l-7 8v7l-4-2V12L3 4z" />
      </svg>
    ),
    title: '4-Tier Classification',
    body: 'Gmail categories and domain rules handle ~77% of your inbox for free. Only genuinely ambiguous emails reach Claude — the pipeline optimizes for accuracy at minimal cost.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <path d="M5 12.5a9 9 0 0 1 14 0" />
        <path d="M8.5 16a5 5 0 0 1 7 0" />
        <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
    title: 'Streams Live',
    body: 'Results appear in real time via SSE as each email is classified. Watch your inbox organize itself — no waiting for a bulk result at the end.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <circle cx="12" cy="5" r="2.5" />
        <circle cx="5" cy="18" r="2.5" />
        <circle cx="19" cy="18" r="2.5" />
        <line x1="12" y1="7.5" x2="6.5" y2="16" />
        <line x1="12" y1="7.5" x2="17.5" y2="16" />
        <line x1="7.5" y1="18" x2="16.5" y2="18" />
      </svg>
    ),
    title: 'Semantic Graph View',
    body: 'Every email plotted by meaning using UMAP + D3 force simulation. Hover to preview, drag to reclassify. Filter by bucket, tier, confidence, or urgency in real time.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
    title: 'Custom Buckets',
    body: 'Create buckets in plain English. The system generates exemplar emails from your description, checks for overlap with existing buckets, and reclassifies live.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" />
      </svg>
    ),
    title: 'Pipeline Metrics',
    body: 'After every run, see a full breakdown by classification tier, average confidence per tier, total LLM calls, exemplar counts per bucket, and total processing time.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <path d="M12 3l8 3v5c0 4.5-3.5 8.5-8 10C7.5 19.5 4 15.5 4 11V6l8-3z" />
      </svg>
    ),
    title: 'Security Scanning',
    body: '15 regex patterns run in parallel with embedding — flagging phishing attempts, suspicious URLs, PII exposure, and dangerous attachments before you open them.',
  },
];

// ─── Import React for JSX type ────────────────────────────────────────────────

import React from 'react';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2rem', height: '52px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-primary)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <span className="hidden sm:block" style={{
          fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1rem',
          color: 'var(--text-primary)', letterSpacing: '-0.01em',
        }}>
          Inbox Concierge
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <form action="/api/auth/demo" method="POST">
            <button type="submit" style={{
              padding: '6px 14px', fontSize: '13px', fontWeight: 500,
              background: 'var(--bg-secondary)', color: 'var(--text-primary)',
              border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
              cursor: 'pointer', transition: 'background 150ms ease',
              fontFamily: 'var(--font-body)',
            }}>
              Try Demo
            </button>
          </form>
          <Link href="/api/auth/google" style={{
            padding: '6px 14px', fontSize: '13px', fontWeight: 500,
            background: 'var(--accent-primary)', color: '#fff',
            border: '1px solid transparent', borderRadius: 'var(--radius-md)',
            textDecoration: 'none', transition: 'background 150ms ease',
          }}>
            Sign in with Google
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: '1120px', margin: '0 auto', padding: '5rem 2rem 4rem' }}>
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '3rem', alignItems: 'center' }}>

          {/* Left — text + CTAs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h1 style={{
              fontFamily: 'var(--font-heading)', fontWeight: 700,
              fontSize: 'clamp(2.6rem, 5vw, 3.5rem)', lineHeight: 1.15,
              color: 'var(--text-primary)', letterSpacing: '-0.02em',
              margin: 0,
            }}>
              Your inbox,<br />finally sorted.
            </h1>
            <p style={{
              fontSize: '1.05rem', lineHeight: 1.6,
              color: 'var(--text-secondary)', maxWidth: '480px', margin: 0,
            }}>
              Inbox Concierge classifies 200 Gmail threads in seconds using a 4-tier
              AI pipeline — from free domain rules to Claude Sonnet. Results stream
              live into a semantic graph where every email finds its place.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '340px' }}>
              <form action="/api/auth/demo" method="POST">
                <button type="submit" style={{
                  width: '100%', padding: '13px 20px', fontSize: '15px', fontWeight: 600,
                  background: 'var(--accent-primary)', color: '#fff',
                  border: '1px solid transparent', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', transition: 'background 150ms ease',
                  fontFamily: 'var(--font-body)',
                }}>
                  Try Demo — no login required
                </button>
              </form>
              <Link href="/api/auth/google" style={{
                display: 'block', textAlign: 'center',
                padding: '11px 20px', fontSize: '15px', fontWeight: 500,
                background: 'transparent', color: 'var(--text-primary)',
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                textDecoration: 'none', transition: 'background 150ms ease',
              }}>
                Sign in with Google
              </Link>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: 0 }}>
              gmail.readonly only · never sends or deletes · open source
            </p>
          </div>

          {/* Right — visual split */}
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 8px 32px rgba(59, 50, 38, 0.1)',
            overflow: 'hidden',
          }}>
            {/* Graph cluster */}
            <div style={{ padding: '16px 16px 12px' }}>
              <p style={{
                fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em',
                color: 'var(--text-tertiary)', textTransform: 'uppercase', margin: '0 0 10px',
              }}>
                Semantic Graph
              </p>
              <svg
                viewBox="0 0 380 225"
                style={{ width: '100%', display: 'block', overflow: 'visible' }}
                aria-hidden="true"
              >
                {/* Cluster labels */}
                <text x="75" y="26" textAnchor="middle" fontSize="9" fill="#A89B8A" fontFamily="var(--font-body)">Direct</text>
                <text x="268" y="22" textAnchor="middle" fontSize="9" fill="#A89B8A" fontFamily="var(--font-body)">Updates</text>
                <text x="175" y="96" textAnchor="middle" fontSize="9" fill="#A89B8A" fontFamily="var(--font-body)">Newsletters</text>
                <text x="298" y="140" textAnchor="middle" fontSize="9" fill="#A89B8A" fontFamily="var(--font-body)">Promotions</text>
                <text x="72" y="145" textAnchor="middle" fontSize="9" fill="#A89B8A" fontFamily="var(--font-body)">Auto-Archive</text>
                {/* Nodes */}
                {GRAPH_NODES.map((n, i) => (
                  <circle
                    key={i}
                    cx={n.cx}
                    cy={n.cy}
                    r={n.r}
                    fill={n.fill}
                    fillOpacity={0.85}
                    stroke={n.strokeColor ?? 'none'}
                    strokeWidth={n.strokeColor ? 2 : 0}
                    style={{
                      animation: `${n.anim} ${n.dur}s ${n.delay}s infinite ease-in-out`,
                    }}
                  />
                ))}
              </svg>
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid var(--border-subtle)' }} />

            {/* Pipeline animation */}
            <div style={{ padding: '12px 16px 16px' }}>
              <p style={{
                fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em',
                color: 'var(--text-tertiary)', textTransform: 'uppercase', margin: '0 0 10px',
              }}>
                Classification Pipeline
              </p>
              <PipelineAnimation />
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section style={{
        maxWidth: '1120px', margin: '0 auto', padding: '4rem 2rem 5rem',
        borderTop: '1px solid var(--border-subtle)',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-heading)', fontWeight: 700,
          fontSize: 'clamp(1.6rem, 3vw, 2rem)', lineHeight: 1.25,
          color: 'var(--text-primary)', textAlign: 'center',
          margin: '0 0 3rem', letterSpacing: '-0.01em',
        }}>
          Everything you need to triage faster
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: '1rem' }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              display: 'flex', flexDirection: 'column', gap: '10px',
            }}>
              <div style={{ color: 'var(--accent-primary)' }}>{f.icon}</div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {f.title}
              </h3>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '2rem',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: 'var(--text-tertiary)',
      }}>
        Built with Next.js · Drizzle · pgvector · Claude · D3
      </footer>
    </div>
  );
}
