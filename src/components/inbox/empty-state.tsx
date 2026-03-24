interface EmptyStateProps {
  bucketName: string;
}

export default function EmptyState({ bucketName }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
      </svg>
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
        No emails in <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{bucketName}</span>
      </p>
    </div>
  );
}
