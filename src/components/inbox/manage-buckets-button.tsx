'use client';

interface ManageBucketsButtonProps {
  onClick: () => void;
  isDisabled?: boolean;
}

export default function ManageBucketsButton({ onClick, isDisabled }: ManageBucketsButtonProps) {
  return (
    <button
      className="btn-ghost btn-md"
      onClick={isDisabled ? undefined : onClick}
      title={isDisabled ? 'Classification in progress…' : undefined}
      style={{
        border: '1px solid var(--border-default)',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
      }}
    >
      Manage Buckets
    </button>
  );
}
