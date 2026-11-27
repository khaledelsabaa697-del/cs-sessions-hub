export default function AppLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="h-9 w-64 animate-pulse rounded-lg bg-[var(--glass-strong)] " />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl border border-[var(--line)] bg-[var(--glass)]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-64 animate-pulse rounded-2xl border border-[var(--line)] bg-[var(--glass)] lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-2xl border border-[var(--line)] bg-[var(--glass)]" />
      </div>
    </div>
  );
}
