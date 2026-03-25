'use client';

interface ManageBucketsButtonProps {
  onClick: () => void;
}

export default function ManageBucketsButton({ onClick }: ManageBucketsButtonProps) {
  return (
    <button
      className="btn-ghost btn-md"
      onClick={onClick}
      style={{ border: '1px solid var(--border-default)', cursor: 'pointer' }}
    >
      Manage Buckets
    </button>
  );
}
