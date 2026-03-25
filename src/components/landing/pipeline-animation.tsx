'use client';

import { useState, useEffect } from 'react';
import React from 'react';

const STAGES = [
  { code: 'SYNC', top: 'Gmail', bottom: '200 threads' },
  { code: 'EMBED', top: 'Gemini', bottom: 'embed + scan' },
  { code: 'T0+T1', top: 'Domain', bottom: 'rules · free' },
  { code: 'T2+T3', top: 'Vector', bottom: '+ Claude' },
  { code: 'TRIAGE', top: 'Urgency', bottom: 'scoring' },
];

export default function PipelineAnimation() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((p) => (p + 1) % STAGES.length), 800);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', justifyContent: 'center' }}>
      {STAGES.map((s, i) => (
        <React.Fragment key={s.code}>
          <div
            style={{
              background: active === i ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
              border: `1.5px solid ${active === i ? 'var(--accent-primary)' : 'var(--border-default)'}`,
              borderRadius: '8px',
              padding: '8px 10px',
              textAlign: 'center',
              transition: 'border-color 0.25s ease, background 0.25s ease',
              minWidth: '54px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 700,
                color: active === i ? 'var(--accent-primary)' : 'var(--text-primary)',
                transition: 'color 0.25s ease',
                letterSpacing: '0.03em',
              }}
            >
              {s.code}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px' }}>{s.top}</div>
            <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', marginTop: '1px' }}>{s.bottom}</div>
          </div>
          {i < STAGES.length - 1 && (
            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', flexShrink: 0 }}>→</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
