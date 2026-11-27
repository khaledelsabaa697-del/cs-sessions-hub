import type { ReactNode } from "react";
import { AlertTriangle, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  error: {
    wrap: "border-s-rose-500/70 bg-rose-500/[0.07] text-rose-800 dark:text-rose-200",
    label: "text-rose-600 dark:text-rose-300",
    icon: XCircle,
    code: "error",
  },
  warning: {
    wrap: "border-s-amber-500/70 bg-amber-500/[0.07] text-amber-900 dark:text-amber-200",
    label: "text-amber-600 dark:text-amber-300",
    icon: AlertTriangle,
    code: "warning",
  },
  info: {
    wrap: "border-s-sky-500/70 bg-sky-500/[0.06] text-sky-900 dark:text-sky-200",
    label: "text-sky-600 dark:text-sky-300",
    icon: Info,
    code: "info",
  },
} as const;

/**
 * AI feedback styled like a compiler diagnostic, so comments read as part of
 * the editor rather than as another paragraph of prose.
 */
export function CompilerMessage({
  tone = "info",
  label,
  children,
}: {
  tone?: keyof typeof TONES;
  label?: string;
  children: ReactNode;
}) {
  const style = TONES[tone];
  const Icon = style.icon;
  return (
    <div className={cn("rounded-r-lg border-s-2 px-3.5 py-3 font-mono text-xs leading-relaxed", style.wrap)}>
      <div className={cn("mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]", style.label)}>
        <Icon className="size-3.5" aria-hidden="true" />
        <span>
          [{style.code}] {label ?? style.code}
        </span>
      </div>
      <div className="whitespace-pre-line">{children}</div>
    </div>
  );
}

export function DiagnosticList({
  items,
  label,
  empty,
}: {
  items: string[];
  label: string;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="font-mono text-xs text-[var(--ink-muted)]">{empty}</p>;
  }
  return (
    <div className="code-panel overflow-hidden rounded-lg">
      <div className="border-b border-white/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {items.map((item, index) => (
          <li key={index} className="flex gap-3 px-3 py-2 font-mono text-[11px] leading-relaxed">
            <span className="shrink-0 text-slate-600">{String(index + 1).padStart(2, "0")}</span>
            <span className="text-amber-200/90">
              <span className="text-slate-500">warning: </span>
              {item}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
