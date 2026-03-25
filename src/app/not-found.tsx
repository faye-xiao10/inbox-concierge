import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        padding: '2rem',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '6rem',
            fontWeight: 700,
            lineHeight: 1,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          404
        </p>
        <p
          style={{
            marginTop: '0.75rem',
            fontSize: '1.125rem',
            color: 'var(--text-secondary)',
          }}
        >
          This page doesn&apos;t exist.
        </p>
      </div>

      <Link
        href="/inbox"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0.5rem 1.25rem',
          fontSize: '0.875rem',
          fontWeight: 500,
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--accent-primary)',
          color: '#fff',
          textDecoration: 'none',
          transition: 'background-color 150ms ease',
        }}
      >
        Return to Dashboard
      </Link>
    </main>
  );
}
