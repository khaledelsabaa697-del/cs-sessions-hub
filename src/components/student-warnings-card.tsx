"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

export type StudentWarning = {
  id: string;
  kind: "absence" | "missed" | "late" | "manual";
  href: string;
  text: string;
  badgeLabel: string;
};

const MAX_VISIBLE = 5;

export function StudentWarningsCard({
  title,
  showAllLabel,
  warnings,
}: {
  title: string;
  showAllLabel: string;
  warnings: StudentWarning[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (warnings.length === 0) return null;

  const visible = expanded ? warnings : warnings.slice(0, MAX_VISIBLE);
  const hasMore = warnings.length > MAX_VISIBLE;

  return (
    <Card className="overflow-hidden border-amber-500/30 bg-amber-500/[0.06]">
      <div className="flex items-center gap-2 border-b border-amber-500/20 px-5 py-3.5">
        <TriangleAlert className="size-4 text-amber-600 dark:text-amber-300" aria-hidden="true" />
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-200">
          {title}
        </h2>
        <span className="ms-auto rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800 dark:text-amber-200">
          {warnings.length}
        </span>
      </div>
      <ul className="divide-y divide-amber-500/15">
        {visible.map((w) => {
          const badge =
            w.kind === "missed"
              ? "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300"
              : w.kind === "late" || w.kind === "manual"
                ? "bg-amber-500/10 text-amber-800 ring-amber-500/20 dark:text-amber-200"
                : "bg-[var(--glass-inset)]0/10 text-[var(--ink-soft)] ring-slate-500/20 ";
          return (
            <li key={w.id}>
              <Link
                href={w.href}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 transition hover:bg-amber-500/[0.07]"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--ink)]">
                  <span className="font-mono text-[10px] text-amber-600/70 dark:text-amber-300/60" aria-hidden="true">
                    !
                  </span>
                  {w.text}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium ring-1 ring-inset",
                    badge,
                  )}
                >
                  {w.badgeLabel}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {hasMore && !expanded ? (
        <div className="px-5 py-3">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800 transition hover:text-amber-600 dark:text-amber-200"
          >
            {showAllLabel}
          </button>
        </div>
      ) : null}
    </Card>
  );
}
