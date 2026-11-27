import type { CSSProperties } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Crown, EyeOff, Medal, Trophy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Alert, Avatar, BentoTile, EmptyState, PageHeader, StatCard, buttonSecondary } from "@/components/ui";
import { RankBadge } from "@/components/gamification/rank-badge";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { rankTierFor } from "@/lib/gamification";
import type { LeaderboardEntry, PointsBreakdown, PointsConfig } from "@/lib/types";

type Period = "week" | "all";

const podiumSlots = [
  { rank: 2, height: "sm:mt-8", glow: "rgb(199 212 227 / 0.4)", ring: "ring-slate-300/50" },
  { rank: 1, height: "", glow: "rgb(246 196 83 / 0.5)", ring: "ring-amber-300/60" },
  { rank: 3, height: "sm:mt-12", glow: "rgb(199 153 103 / 0.4)", ring: "ring-amber-600/40" },
] as const;

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  const t = await getTranslations("leaderboard");
  const tg = await getTranslations("gamification");

  const { period: rawPeriod } = await searchParams;
  const period: Period = rawPeriod === "week" ? "week" : "all";

  const supabase = await createClient();
  const breakdownRequest =
    profile.role === "student" ? supabase.rpc("my_breakdown") : Promise.resolve({ data: null, error: null });
  const [boardResult, configResult, breakdownResult] = await Promise.all([
    supabase.rpc("leaderboard_page", { p_period: period }),
    supabase
      .from("points_config")
      .select("leaderboard_visible, weekly_reset_at")
      .eq("id", 1)
      .single<Pick<PointsConfig, "leaderboard_visible" | "weekly_reset_at">>(),
    breakdownRequest,
  ]);

  const hasError = [boardResult.error, configResult.error].some(Boolean);
  const entries = (boardResult.data ?? []) as LeaderboardEntry[];
  const visible = configResult.data?.leaderboard_visible ?? true;
  const breakdown = ((breakdownResult.data ?? [])[0] ?? null) as PointsBreakdown | null;

  const myRank = period === "week" ? breakdown?.weekly_rank : breakdown?.all_rank;
  const myPoints = period === "week" ? breakdown?.weekly_points : breakdown?.total_points;
  const myGap = period === "week" ? breakdown?.weekly_gap : breakdown?.all_gap;
  const optedOut = breakdown?.opted_out ?? false;

  const total = entries.length;
  const me = entries.find((entry) => entry.is_me) ?? null;
  const topThree = entries.slice(0, 3);
  const rest = entries.slice(3);
  const meOutsideTop = me && me.rank > 3 ? me : null;

  function Row({ entry, pinned = false }: { entry: LeaderboardEntry; pinned?: boolean }) {
    const tier = rankTierFor(Number(entry.points));
    return (
      <li
        className={cn(
          "flex items-center gap-3 rounded-xl border px-3 py-3 transition",
          entry.is_me
            ? "border-bronze-400/30 bg-bronze-500/10"
            : pinned
              ? "border-bronze-400/25 bg-bronze-500/[0.07]"
              : "border-transparent hover:border-[var(--line)] hover:bg-[var(--glass-inset)]",
        )}
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg font-mono text-xs font-bold",
            entry.rank === 1
              ? "bg-amber-500/15 text-amber-600 ring-1 ring-inset ring-amber-400/30 dark:text-amber-300"
              : entry.rank <= 3
                ? "bg-[var(--glass-inset)] text-[var(--ink-soft)]"
                : "text-[var(--ink-muted)]",
          )}
        >
          {formatNumber(entry.rank, locale)}
        </span>
        <Avatar name={entry.display_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-medium text-[var(--ink)]">
            {entry.display_name}
            {entry.is_me ? (
              <span className="rounded-full bg-bronze-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-bronze-700 dark:text-bronze-200">
                {t("you")}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
            {tg(tier.key)}
          </p>
        </div>
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
          {formatNumber(Number(entry.points), locale, 2)}
        </span>
      </li>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="leaderboard"
        title={t("title")}
        description={t("subtitle")}
        action={
          <Link href={profile.role === "admin" ? "/admin/points" : "/progress"} className={buttonSecondary}>
            {profile.role === "admin" ? t("managePoints") : t("viewProgress")}
          </Link>
        }
      />

      {hasError ? <Alert>{t("loadError")}</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-[var(--line)] bg-[var(--glass-inset)] p-1 backdrop-blur">
          {(["week", "all"] as Period[]).map((value) => (
            <Link
              key={value}
              href={{ pathname: "/leaderboard", query: { period: value } }}
              className={cn(
                "rounded-lg px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] transition",
                period === value
                  ? "bg-bronze-500/15 text-bronze-700 shadow-sm ring-1 ring-inset ring-bronze-400/30 dark:text-bronze-200"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
              )}
              aria-current={period === value ? "page" : undefined}
            >
              {t(`period.${value}`)}
            </Link>
          ))}
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          {period === "week"
            ? t("weeklyBoardHint", {
                date: formatDate(configResult.data?.weekly_reset_at ?? new Date(), locale),
              })
            : t("allTimeBoardHint")}
        </p>
      </div>

      {profile.role === "student" && !optedOut && visible && myRank != null ? (
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StaggerItem>
            <StatCard
              label={t("yourRank")}
              value={`#${formatNumber(Number(myRank), locale)}`}
              hint={t("ofTotal", { count: total })}
              tone="bronze"
              icon={<Trophy className="size-5" aria-hidden="true" />}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label={period === "week" ? t("yourWeeklyPoints") : t("yourPoints")}
              value={formatNumber(Number(myPoints ?? 0), locale, 2)}
              hint={
                period === "week"
                  ? t("weeklyBoardHint", { date: formatDate(configResult.data?.weekly_reset_at ?? new Date(), locale) })
                  : t("allTimeBoardHint")
              }
              tone="teal"
              icon={<Medal className="size-5" aria-hidden="true" />}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label={t("toNextRank")}
              value={myGap != null && Number(myGap) > 0 ? formatNumber(Number(myGap), locale, 2) : "—"}
              hint={myGap != null && Number(myGap) > 0 ? t("keepGoing") : t("topRank")}
              tone="violet"
              icon={<Crown className="size-5" aria-hidden="true" />}
            />
          </StaggerItem>
        </Stagger>
      ) : null}

      {profile.role === "student" && optedOut ? (
        <Alert tone="info">
          {t("optedOutNote")}{" "}
          <Link href="/profile" className="font-semibold underline underline-offset-2">
            {t("changeInProfile")}
          </Link>
        </Alert>
      ) : null}

      {!visible ? <Alert tone="info">{t("hiddenNote")}</Alert> : null}

      {entries.length === 0 ? (
        <BentoTile>
          <EmptyState
            title={!visible ? t("hiddenTitle") : t("emptyTitle")}
            description={!visible ? t("hiddenNote") : t("emptyBody")}
            icon={<Trophy className="size-8" aria-hidden="true" />}
          />
        </BentoTile>
      ) : (
        <>
          {/* Podium */}
          <BentoTile className="overflow-hidden p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="caption-code">{tg("topThree")}</p>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                {t("studentCount", { count: total })}
              </span>
            </div>
            <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
              {podiumSlots.map((slot) => {
                const entry = topThree.find((row) => row.rank === slot.rank);
                if (!entry) return <div key={slot.rank} />;
                const tier = rankTierFor(Number(entry.points));
                const isChampion = slot.rank === 1;
                return (
                  <div
                    key={slot.rank}
                    className={cn(
                      "relative flex flex-col items-center rounded-2xl border px-2 pt-5 pb-3 text-center transition",
                      slot.height,
                      isChampion
                        ? "border-amber-400/35 bg-gradient-to-b from-amber-500/[0.14] to-transparent"
                        : "border-[var(--line)] bg-[var(--glass-inset)]",
                    )}
                    style={{ boxShadow: `0 18px 40px -30px ${slot.glow}` }}
                  >
                    {isChampion ? (
                      <Crown
                        className="absolute -top-3 size-6 text-amber-400 podium-glow"
                        style={{ "--glow": slot.glow } as CSSProperties}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span
                      className={cn(
                        "grid place-items-center rounded-full ring-2",
                        slot.ring,
                        isChampion ? "size-16" : "size-12",
                      )}
                    >
                      <Avatar name={entry.display_name} size={isChampion ? "lg" : "md"} />
                    </span>
                    <p className="mt-2 line-clamp-1 text-xs font-semibold text-[var(--ink)] sm:text-sm">
                      {entry.display_name}
                    </p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                      {tg(tier.key)}
                    </p>
                    <p className="mt-1 font-mono text-base font-bold text-[var(--ink)]">
                      {formatNumber(Number(entry.points), locale, 2)}
                    </p>
                    <span
                      className={cn(
                        "mt-1 inline-grid size-6 place-items-center rounded-full font-mono text-[10px] font-bold",
                        isChampion
                          ? "bg-amber-500/20 text-amber-700 dark:text-amber-200"
                          : "bg-[var(--glass-strong)] text-[var(--ink-muted)]",
                      )}
                    >
                      {slot.rank}
                    </span>
                  </div>
                );
              })}
            </div>
          </BentoTile>

          {meOutsideTop ? (
            <BentoTile className="border-bronze-400/25 p-3 sm:p-4">
              <p className="caption-code mb-2">{tg("yourPosition")}</p>
              <ul>
                <Row entry={meOutsideTop} pinned />
              </ul>
            </BentoTile>
          ) : null}

          <BentoTile className="p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="caption-code">{period === "week" ? t("weeklyBoard") : t("allTimeBoard")}</p>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                {t("studentCount", { count: total })}
              </span>
            </div>
            {rest.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--ink-muted)]">
                {topThree.length > 0 ? t("privacyNote") : t("emptyBody")}
              </p>
            ) : (
              <ul className="space-y-1">
                {rest.map((entry) => (
                  <Row key={`${entry.rank}-${entry.display_name}`} entry={entry} />
                ))}
              </ul>
            )}
          </BentoTile>
        </>
      )}

      <div className="flex items-start gap-2 px-1 font-mono text-[10px] leading-relaxed text-[var(--ink-muted)]">
        <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <p>{t("privacyNote")}</p>
      </div>
    </div>
  );
}
