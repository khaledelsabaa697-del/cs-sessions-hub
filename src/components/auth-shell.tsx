import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Check, Code2, Trophy, Zap } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { AmbientBackground } from "@/components/ambient-background";
import { RankBadge } from "@/components/gamification/rank-badge";

const TIER_POINTS: Record<string, string> = {
  bronze: "0+",
  silver: "200+",
  gold: "500+",
  diamond: "1000+",
};

export async function AuthShell({
  locale,
  title,
  subtitle,
  children,
  footer,
}: {
  locale: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "auth" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const tg = await getTranslations({ locale, namespace: "gamification" });

  return (
    <main className="relative min-h-dvh lg:grid lg:grid-cols-[1.08fr_1fr]">
      <AmbientBackground />

      <aside className="dark relative hidden overflow-hidden border-e border-white/10 bg-navy-950 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="pointer-events-none absolute -end-24 -top-24 size-[26rem] rounded-full bg-primary-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -start-24 size-[26rem] rounded-full bg-bronze-500/15 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 70% 60% at 40% 30%, black, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 40% 30%, black, transparent 75%)",
          }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/5">
            <BrandMark className="size-10" />
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-bronze-300">
              // SFE
            </p>
            <p className="text-sm font-semibold tracking-tight">{tc("appName")}</p>
          </div>
        </div>

        <div className="relative z-10 max-w-lg">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-bronze-300">
            // rank_up
          </p>
          <h2 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight">
            {t("brandTitle")}
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">
            {t("brandSubtitle")}
          </p>

          <ul className="mt-8 grid gap-2.5 text-sm text-slate-200">
            {["featureAttendance", "featureAssignments", "featureProgress"].map((key) => (
              <li key={key} className="flex items-center gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/25">
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>

          {/* Decorative rank ladder */}
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-300">
                <Trophy className="size-3.5 text-bronze-300" aria-hidden="true" />
                {tg("rank")}
              </div>
              <span className="font-mono text-[10px] text-slate-500">1000 XP</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-1.5">
              {(["bronze", "silver", "gold", "diamond"] as const).map((tier) => (
                <div key={tier} className="flex flex-1 flex-col items-center gap-1.5">
                  <RankBadge tier={tier} label={tg(tier)} />
                  <span className="font-mono text-[9px] text-slate-500">{TIER_POINTS[tier]}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Zap className="size-3.5 text-bronze-300" aria-hidden="true" />
              <div className="xp-track h-1.5 flex-1 rounded-full !bg-white/10">
                <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-bronze-600 to-bronze-300" />
              </div>
              <span className="font-mono text-[9px] text-slate-400">620 / 1000</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Code2 className="size-3.5" aria-hidden="true" />
            CS Fundamentals
          </span>
          <span dir="ltr">C++ · 2026</span>
        </div>
      </aside>

      <section className="relative flex min-h-dvh flex-col">
        <div className="flex items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5 lg:invisible">
            <BrandMark className="size-8" />
            <span className="text-sm font-semibold tracking-tight text-[var(--ink)]">
              {tc("appName")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pb-14 sm:px-6">
          <div className="w-full max-w-md animate-rise">
            <div className="glass-card relative overflow-hidden rounded-3xl p-6 sm:p-8">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-bronze-400/60 to-transparent"
                aria-hidden="true"
              />
              <p className="caption-code">secure.access</p>
              <h1 className="mt-2 text-balance text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
                {title}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">{subtitle}</p>
              {children}
            </div>
            <div className="mt-6 text-center font-mono text-[10px] leading-relaxed text-[var(--ink-muted)]">
              {footer ?? t("footerNote")}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
