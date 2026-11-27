import type { ReactNode } from "react";
import { cn, initials } from "@/lib/utils";
import { CountUp } from "@/components/motion/count-up";

export const inputClass =
  "w-full rounded-xl border border-[var(--line-strong)] bg-[var(--glass-inset)] px-3.5 py-2.5 text-sm text-[var(--ink)] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] outline-none transition placeholder:text-[var(--ink-muted)] focus:border-bronze-400 focus:ring-4 focus:ring-bronze-500/15 disabled:cursor-not-allowed disabled:opacity-60";

export const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]";

export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze-400";

export const buttonPrimary = cn(
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-700 via-primary-600 to-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-950/20 ring-1 ring-inset ring-white/10 transition hover:-translate-y-0.5 hover:shadow-[0_10px_36px_-12px_var(--bronze-glow)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
  focusRing,
);

export const buttonSecondary = cn(
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-[var(--glass)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] backdrop-blur transition hover:-translate-y-0.5 hover:border-bronze-400/60 hover:bg-[var(--glass-strong)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60",
  focusRing,
);

export const buttonGhost = cn(
  "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--glass-inset)] hover:text-[var(--ink)] disabled:opacity-60",
  focusRing,
);

export const iconButtonClass = cn(
  "inline-flex size-9 items-center justify-center rounded-lg text-[var(--ink-soft)] transition hover:bg-[var(--glass-inset)] hover:text-[var(--ink)] disabled:opacity-60",
  focusRing,
);

export const badgeClass =
  "inline-flex items-center gap-1 rounded-full border border-primary-500/20 bg-primary-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-primary-700 dark:text-primary-200";

export const codeClass = "code-panel overflow-auto rounded-xl p-3 font-mono text-xs leading-relaxed";

export const tabsClass = "inline-flex rounded-xl border border-[var(--line)] bg-[var(--glass-inset)] p-1 backdrop-blur";

export function tabPanelClass(isActive: boolean): string {
  return cn(
    "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition",
    isActive
      ? "bg-[var(--glass-strong)] text-[var(--ink)] shadow-sm ring-1 ring-bronze-400/25"
      : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("glass-card rounded-2xl", className)}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
      <div className="min-w-0">
        {eyebrow ? <p className="caption-code mb-1">{eyebrow}</p> : null}
        <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--ink-muted)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

const ICON_TONES: Record<string, string> = {
  bronze:
    "bg-gradient-to-br from-bronze-500/25 to-bronze-400/5 text-bronze-700 ring-1 ring-inset ring-bronze-400/25 dark:text-bronze-300",
  teal: "bg-gradient-to-br from-teal-500/20 to-teal-400/5 text-teal-700 ring-1 ring-inset ring-teal-400/25 dark:text-teal-300",
  violet:
    "bg-gradient-to-br from-violet-500/20 to-violet-400/5 text-violet-700 ring-1 ring-inset ring-violet-400/25 dark:text-violet-300",
  emerald:
    "bg-gradient-to-br from-emerald-500/20 to-emerald-400/5 text-emerald-700 ring-1 ring-inset ring-emerald-400/25 dark:text-emerald-300",
  rose: "bg-gradient-to-br from-rose-500/20 to-rose-400/5 text-rose-700 ring-1 ring-inset ring-rose-400/25 dark:text-rose-300",
  sky: "bg-gradient-to-br from-sky-500/20 to-sky-400/5 text-sky-700 ring-1 ring-inset ring-sky-400/25 dark:text-sky-300",
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "bronze",
  numericValue,
  suffix,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof ICON_TONES;
  numericValue?: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <Card className={cn("glass-hover overflow-hidden p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="caption-code">{label}</p>
          <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-[var(--ink)]">
            {numericValue !== undefined ? (
              <>
                <CountUp value={numericValue} />
                {suffix ? <span className="text-xl text-[var(--ink-muted)]">{suffix}</span> : null}
              </>
            ) : (
              value
            )}
          </p>
          {hint ? <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-muted)]">{hint}</p> : null}
        </div>
        {icon ? (
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", ICON_TONES[tone])}>{icon}</span>
        ) : null}
      </div>
    </Card>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const tones = {
    error: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  };

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-xl border px-3.5 py-2.5 font-mono text-xs leading-relaxed backdrop-blur", tones[tone])}
    >
      {children}
    </div>
  );
}

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className="glass-inset flex flex-col items-center justify-center rounded-xl border-dashed px-6 py-10 text-center">
      {icon ? <div className="mb-3 text-[var(--ink-muted)]">{icon}</div> : null}
      <p className="text-sm font-medium text-[var(--ink)]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-[var(--ink-muted)]">{description}</p>
      ) : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="caption-code mb-2">{eyebrow}</p> : null}
        <h1 className="text-balance text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>;
}

export function BentoTile({
  children,
  className,
  interactive = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag className={cn("glass-card relative overflow-hidden rounded-2xl p-5", interactive && "glass-hover", className)}>
      {children}
    </Tag>
  );
}

export function SectionCaption({ children }: { children: ReactNode }) {
  return <p className="caption-code">{children}</p>;
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "size-8 text-[10px]",
    md: "size-10 text-xs",
    lg: "size-14 text-sm",
    xl: "size-20 text-lg",
  };
  const letters = initials(name);
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary-600 to-primary-800 font-mono font-bold text-white ring-1 ring-inset ring-white/15",
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      {letters}
    </span>
  );
}

export function Progress({
  value,
  className,
  barClassName,
  label,
}: {
  value: number;
  className?: string;
  barClassName?: string;
  label?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn("xp-track h-2 rounded-full", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <div
        className={cn("h-full rounded-full bg-gradient-to-r from-bronze-600 to-bronze-300", barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ScoreRing({
  value,
  max = 100,
  size = 72,
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pct;

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-[var(--line)]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#score-ring-gradient)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
        <defs>
          <linearGradient id="score-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#b58a5b" />
            <stop offset="100%" stopColor="#d8b895" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute font-mono text-sm font-bold text-[var(--ink)]">{Math.round(pct * 100)}%</span>
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-[var(--glass-inset)]", className)} />;
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-[var(--line)]", className)} />;
}
