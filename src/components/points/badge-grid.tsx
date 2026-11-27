import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type BadgeView = {
  code: string;
  icon: string;
  name: string;
  description: string;
  earned: boolean;
  awardedAt?: string;
};

/** Illustrated badge tiles. Earned badges glow; locked ones stay as goals. */
export function BadgeGrid({ badges }: { badges: BadgeView[] }) {
  return (
    <ul className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
      {badges.map((badge) => (
        <li
          key={badge.code}
          className={cn(
            "group relative flex items-start gap-3 overflow-hidden rounded-2xl border p-3.5 transition",
            badge.earned
              ? "border-amber-400/30 bg-gradient-to-br from-amber-500/[0.12] to-transparent hover:border-amber-400/50"
              : "border-dashed border-[var(--line-strong)] bg-[var(--glass-inset)]",
          )}
        >
          {badge.earned ? (
            <span
              className="pointer-events-none absolute -end-6 -top-6 size-20 rounded-full bg-amber-400/15 blur-xl"
              aria-hidden="true"
            />
          ) : null}
          <span
            className={cn(
              "relative grid size-12 shrink-0 place-items-center rounded-xl text-2xl ring-1 ring-inset",
              badge.earned
                ? "bg-[var(--glass-strong)] ring-amber-400/30"
                : "bg-[var(--glass-inset)] ring-[var(--line)] grayscale",
            )}
            aria-hidden="true"
          >
            {badge.icon}
            {!badge.earned ? (
              <span className="absolute -bottom-1 -end-1 grid size-5 place-items-center rounded-full bg-[var(--bg)] text-[var(--ink-muted)] ring-1 ring-[var(--line)]">
                <Lock className="size-2.5" />
              </span>
            ) : null}
          </span>
          <div className="min-w-0">
            <p className={cn("text-sm font-semibold", badge.earned ? "text-[var(--ink)]" : "text-[var(--ink-muted)]")}>
              {badge.name}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--ink-muted)]">
              {badge.description}
            </p>
            {badge.earned && badge.awardedAt ? (
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-amber-700/90 dark:text-amber-300/80">
                {badge.awardedAt}
              </p>
            ) : (
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">// locked</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
