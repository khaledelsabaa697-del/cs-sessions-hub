"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Card, CardHeader } from "@/components/ui";

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
    <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/5">
      <CardHeader title={title} />
      <ul className="divide-y divide-amber-100 dark:divide-amber-500/20">
        {visible.map((w) => {
          const badgeClass =
            w.kind === "missed"
              ? "rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300"
              : w.kind === "late" || w.kind === "manual"
                ? "rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                : "rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300";
          return (
            <li key={w.id} className="px-5 py-3.5">
              <Link
                href={w.href}
                className="flex flex-wrap items-center justify-between gap-2 transition hover:opacity-80"
              >
                <span className="text-sm text-slate-900 dark:text-white">{w.text}</span>
                <span className={badgeClass}>{w.badgeLabel}</span>
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
            className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
          >
            {showAllLabel}
          </button>
        </div>
      ) : null}
    </Card>
  );
}
