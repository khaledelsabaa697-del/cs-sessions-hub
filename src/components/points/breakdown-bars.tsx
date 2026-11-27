import { cn } from "@/lib/utils";

export type BreakdownItem = {
  key: string;
  label: string;
  value: string;
  ratio: number;
  barClass: string;
};

/** Horizontal bars for the points breakdown. Values are pre-formatted. */
export function BreakdownBars({ items, emptyLabel }: { items: BreakdownItem[]; emptyLabel: string }) {
  const hasValue = items.some((item) => item.ratio > 0);

  if (!hasValue) {
    return <p className="text-sm text-[var(--ink-muted)]">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-[var(--ink-soft)]">{item.label}</span>
            <span className="text-sm font-semibold text-[var(--ink)]">{item.value}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--glass-inset)]">
            <div
              className={cn("h-full rounded-full transition-all", item.barClass)}
              style={{ width: `${Math.min(100, Math.max(0, item.ratio * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
