import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-primary px-4">
      <div className="text-center">
        <h1 className="heading-xl mb-2 font-[var(--font-heading)] text-[var(--text-primary)]">
          Inbox Concierge
        </h1>
        <p className="text-[var(--text-secondary)] text-base">
          AI-powered email triage — zero inbox anxiety
        </p>
      </div>

      <div className="flex gap-3">
        <form action="/api/auth/demo" method="POST">
          <Button type="submit" variant="primary" size="md">
            Try Demo
          </Button>
        </form>

        <Link
          href="/api/auth/google"
          className={[
            'inline-flex items-center justify-center gap-2',
            'font-medium leading-none text-sm',
            'rounded-[var(--radius-md)]',
            'px-4 py-2',
            'transition-colors duration-150 ease-out',
            'bg-[var(--bg-secondary)] text-[var(--text-primary)]',
            'hover:bg-[var(--bg-tertiary)]',
            'border border-[var(--border-default)]',
          ].join(' ')}
        >
          Sign in with Google
        </Link>
      </div>
    </main>
  );
}
