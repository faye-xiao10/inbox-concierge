export default function InboxLoading() {
  return (
    <main className="min-h-screen bg-primary">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="h-8 w-24 rounded-md bg-tertiary animate-pulse mb-6" />
        <div className="flex gap-2 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 w-28 rounded-full bg-secondary animate-pulse" />
          ))}
        </div>
        <div className="bg-elevated rounded-lg overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3 border-b border-subtle last:border-0">
              <div className="flex justify-between mb-1.5">
                <div className="h-3.5 w-32 rounded bg-secondary animate-pulse" />
                <div className="h-3 w-12 rounded bg-secondary animate-pulse" />
              </div>
              <div className="h-3.5 w-64 rounded bg-tertiary animate-pulse mb-1.5" />
              <div className="h-3 w-full max-w-sm rounded bg-tertiary animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
