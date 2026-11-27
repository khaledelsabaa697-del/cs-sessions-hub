import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowUpRight, Flame, Medal, Sparkles, Star, TrendingUp, Trophy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Alert, BentoTile, PageHeader, ScoreRing, buttonSecondary } from "@/components/ui";
import { BadgeGrid, type BadgeView } from "@/components/points/badge-grid";
import { BreakdownBars, type BreakdownItem } from "@/components/points/breakdown-bars";
import { WeeklyPointsChart } from "@/components/points/weekly-chart";
import { RankBadge } from "@/components/gamification/rank-badge";
import { XpBar } from "@/components/motion/xp-bar";
import { CountUp } from "@/components/motion/count-up";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/utils";
import { levelFor, rankTierFor, TIER_STYLES } from "@/lib/gamification";
import type { PointsBreakdown, WeeklyProgress } from "@/lib/types";

type BadgeCatalogRow = {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  icon: string;
};

type EarnedBadgeRow = {
  badge_id: string;
  awarded_at: string;
};

const WEEKS = 8;

export default async function ProgressPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  if (profile.role === "admin") redirect(`/${locale}/admin/points`);

  const t = await getTranslations("progress");
  const tg = await getTranslations("gamification");

  const supabase = await createClient();
  const [breakdownResult, weeksResult, catalogResult, earnedResult] = await Promise.all([
    supabase.rpc("my_breakdown"),
    supabase.rpc("my_progress_weeks", { p_weeks: WEEKS }),
    supabase
      .from("badges")
      .select("id, code, name_en, name_ar, description_en, description_ar, icon")
      .order("code")
      .returns<BadgeCatalogRow[]>(),
    supabase
      .from("student_badges")
      .select("badge_id, awarded_at")
      .eq("student_id", profile.id)
      .returns<EarnedBadgeRow[]>(),
  ]);

  if (breakdownResult.error) console.error("[progress] my_breakdown error:", breakdownResult.error);
  if (weeksResult.error) console.error("[progress] my_progress_weeks error:", weeksResult.error);
  if (catalogResult.error) console.error("[progress] badges catalog error:", catalogResult.error);
  if (earnedResult.error) console.error("[progress] earned badges error:", earnedResult.error);

  const hasError = [breakdownResult.error, weeksResult.error, catalogResult.error, earnedResult.error].some(Boolean);

  const breakdown = ((breakdownResult.data ?? [])[0] ?? null) as PointsBreakdown | null;
  const weeks = (weeksResult.data ?? []) as WeeklyProgress[];

  const safeBreakdown = breakdown ?? {
    total_points: 0,
    weekly_points: 0,
    homework_points: 0,
    attendance_points: 0,
    on_time_points: 0,
    streak_points: 0,
    attended_count: 0,
    late_count: 0,
    longest_streak: 0,
    current_streak: 0,
    badge_count: 0,
    all_rank: null,
    all_gap: null,
    weekly_rank: null,
    weekly_gap: null,
    leaderboard_visible: true,
    opted_out: false,
  };

  const totalPoints = Number(safeBreakdown.total_points);
  const tier = rankTierFor(totalPoints);
  const level = levelFor(totalPoints);
  const tierStyle = TIER_STYLES[tier.key];
  const nextTier = tier.nextMin === null ? null : rankTierFor(tier.nextMin);

  const points = (value: number | null | undefined) => formatNumber(Number(value ?? 0), locale, 2);

  const earnedById = new Map((earnedResult.data ?? []).map((row) => [row.badge_id, row.awarded_at]));

  const badges: BadgeView[] = (catalogResult.data ?? []).map((badge) => {
    const awardedAt = earnedById.get(badge.id);
    return {
      code: badge.code,
      icon: badge.icon,
      name: locale === "ar" ? badge.name_ar : badge.name_en,
      description: locale === "ar" ? badge.description_ar : badge.description_en,
      earned: Boolean(awardedAt),
      awardedAt: awardedAt ? t("earnedOn", { date: formatDate(awardedAt, locale) }) : undefined,
    };
  });

  const earnedCount = badges.filter((badge) => badge.earned).length;

  const components = [
    {
      key: "homework",
      value: Number(safeBreakdown.homework_points),
      bar: "bg-gradient-to-r from-bronze-600 to-bronze-400",
    },
    {
      key: "attendance",
      value: Number(safeBreakdown.attendance_points),
      bar: "bg-gradient-to-r from-teal-600 to-teal-400",
    },
    { key: "onTime", value: Number(safeBreakdown.on_time_points), bar: "bg-gradient-to-r from-sky-600 to-sky-400" },
    { key: "streak", value: Number(safeBreakdown.streak_points), bar: "bg-gradient-to-r from-amber-600 to-amber-400" },
  ];
  const componentTotal = Math.max(
    totalPoints,
    components.reduce((sum, item) => sum + item.value, 0),
    1,
  );

  const breakdownItems: BreakdownItem[] = components.map((item) => ({
    key: item.key,
    label: t(`components.${item.key}`),
    value: points(item.value),
    ratio: item.value / componentTotal,
    barClass: item.bar,
  }));

  const ranksHidden = !safeBreakdown.leaderboard_visible || safeBreakdown.opted_out;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="student.progress"
        title={t("title")}
        description={t("subtitle")}
        action={
          <Link href="/leaderboard" className={buttonSecondary}>
            <Trophy className="size-4" aria-hidden="true" />
            {t("viewLeaderboard")}
          </Link>
        }
      />

      {hasError ? <Alert>{t("loadError")}</Alert> : null}

      {safeBreakdown.opted_out ? (
        <Alert tone="info">{t("optedOutNote")}</Alert>
      ) : !safeBreakdown.leaderboard_visible ? (
        <Alert tone="info">{t("hiddenNote")}</Alert>
      ) : null}

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem className="sm:col-span-2">
          <BentoTile className="relative flex h-full flex-col justify-between overflow-hidden p-6">
            <div
              className="pointer-events-none absolute -end-12 -top-12 size-56 rounded-full opacity-25 blur-2xl"
              style={{ background: tierStyle.glow }}
              aria-hidden="true"
            />
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <RankBadge tier={tier.key} label={tg(tier.key)} size="md" />
                <span className="rounded-full border border-[var(--line)] bg-[var(--glass-inset)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                  {tg("levelShort")} {level.level}
                </span>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                {t("allTime")}
              </span>
            </div>

            <div className="relative mt-6 flex items-end gap-2">
              <span className="font-mono text-5xl font-bold leading-none text-[var(--ink)] sm:text-6xl">
                <CountUp value={totalPoints} decimals={totalPoints % 1 === 0 ? 0 : 2} />
              </span>
              <span className="pb-1.5 font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">XP</span>
            </div>

            <div className="relative mt-5">
              <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                <span>{tg("xpLabel")}</span>
                <span>
                  {formatNumber(level.intoLevel, locale)} / {level.levelSize}
                </span>
              </div>
              <XpBar progress={level.progress} label={tg("xpLabel")} />
              <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[var(--ink-muted)]">
                <span>{tg(tier.key)}</span>
                <span>
                  {tier.pointsToNext !== null && nextTier
                    ? tg("nextTier", {
                        points: formatNumber(tier.pointsToNext, locale),
                        tier: tg(nextTier.key),
                      })
                    : tg("maxTier")}
                </span>
              </div>
            </div>
          </BentoTile>
        </StaggerItem>

        <StaggerItem>
          <BentoTile className="glass-hover flex h-full flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="caption-code">{t("weeklyPoints")}</p>
              <TrendingUp className="size-5 text-teal-500" aria-hidden="true" />
            </div>
            <p className="mt-3 font-mono text-4xl font-bold text-[var(--ink)]">
              <CountUp
                value={Number(safeBreakdown.weekly_points)}
                decimals={Number(safeBreakdown.weekly_points) % 1 === 0 ? 0 : 2}
              />
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("thisWeek")}</p>
          </BentoTile>
        </StaggerItem>

        <StaggerItem>
          <BentoTile className="glass-hover flex h-full flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="caption-code">{t("streak")}</p>
              <Flame className="flame-pulse size-5 text-orange-500" aria-hidden="true" />
            </div>
            <p className="mt-3 font-mono text-4xl font-bold text-[var(--ink)]">
              <CountUp value={Number(safeBreakdown.current_streak)} />
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              {t("bestStreak", { count: formatNumber(Number(safeBreakdown.longest_streak), locale) })}
            </p>
          </BentoTile>
        </StaggerItem>

        <StaggerItem>
          <BentoTile className="glass-hover flex h-full items-center justify-between gap-3">
            <div>
              <p className="caption-code">{t("totalPoints")}</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[var(--ink)]">
                {points(safeBreakdown.total_points)}
              </p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("allTime")}</p>
            </div>
            <ScoreRing value={earnedCount} max={Math.max(1, badges.length)} size={64} label={t("badgesTitle")} />
          </BentoTile>
        </StaggerItem>

        <StaggerItem className="sm:col-span-2 lg:col-span-2">
          <BentoTile className="flex h-full flex-col">
            <div className="flex items-center justify-between">
              <div>
                <p className="caption-code">{t("chartTitle")}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("chartSubtitle")}</p>
              </div>
              <span className="grid size-10 place-items-center rounded-xl bg-violet-500/15 text-violet-600 ring-1 ring-inset ring-violet-400/25 dark:text-violet-300">
                <Sparkles className="size-5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 flex-1">
              <WeeklyPointsChart
                data={weeks}
                locale={locale}
                pointsLabel={t("chartLabel")}
                emptyLabel={t("chartEmpty")}
              />
            </div>
            <p className="mt-2 font-mono text-[10px] text-[var(--ink-muted)]">
              {t("chartFooter", {
                attended: formatNumber(Number(safeBreakdown.attended_count), locale),
                late: formatNumber(Number(safeBreakdown.late_count), locale),
              })}
            </p>
          </BentoTile>
        </StaggerItem>

        <StaggerItem className="sm:col-span-2 lg:col-span-2">
          <BentoTile className="flex h-full flex-col">
            <div className="flex items-center justify-between">
              <div>
                <p className="caption-code">{t("breakdownTitle")}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("breakdownSubtitle")}</p>
              </div>
              <span className="grid size-10 place-items-center rounded-xl bg-bronze-500/15 text-bronze-700 ring-1 ring-inset ring-bronze-400/25 dark:text-bronze-300">
                <Star className="size-5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-4 flex-1">
              <BreakdownBars items={breakdownItems} emptyLabel={t("breakdownEmpty")} />
            </div>
            <dl className="mt-5 space-y-2 border-t border-[var(--line)] pt-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">{t("totalPoints")}</dt>
                <dd className="font-mono font-semibold text-[var(--ink)]">{points(safeBreakdown.total_points)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">{t("weeklyPoints")}</dt>
                <dd className="font-mono font-semibold text-[var(--ink)]">{points(safeBreakdown.weekly_points)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">{t("rank")}</dt>
                <dd className="font-mono font-semibold text-[var(--ink)]">
                  {safeBreakdown.all_rank != null ? `#${formatNumber(Number(safeBreakdown.all_rank), locale)}` : "—"}
                </dd>
              </div>
            </dl>
          </BentoTile>
        </StaggerItem>

        <StaggerItem className="sm:col-span-2 lg:col-span-4">
          <BentoTile className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
              <div>
                <p className="caption-code">{t("badgesTitle")}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  {t("badgesSubtitle", {
                    earned: formatNumber(earnedCount, locale),
                    total: formatNumber(badges.length, locale),
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Medal className="size-4 text-bronze-500" aria-hidden="true" />
                <span className="font-mono text-xs font-semibold text-[var(--ink-soft)]">
                  {formatNumber(earnedCount, locale)} / {formatNumber(badges.length, locale)}
                </span>
                <ArrowUpRight className="size-3.5 text-[var(--ink-muted)] rtl:-scale-x-100" aria-hidden="true" />
              </div>
            </div>
            {badges.length > 0 ? (
              <BadgeGrid badges={badges} />
            ) : (
              <p className="p-5 text-sm text-[var(--ink-muted)]">{t("badgesEmpty")}</p>
            )}
          </BentoTile>
        </StaggerItem>
      </Stagger>

      {ranksHidden ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          // rank_visibility_hidden
        </p>
      ) : null}
    </div>
  );
}
