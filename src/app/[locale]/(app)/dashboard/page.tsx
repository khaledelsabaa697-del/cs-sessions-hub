import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Flame,
  Medal,
  Sparkles,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { StudentWarningsCard, type StudentWarning } from "@/components/student-warnings-card";
import { AnnouncementList } from "@/components/announcement-list";
import { BadgeGrid, type BadgeView } from "@/components/points/badge-grid";
import { WeeklyPointsChart } from "@/components/points/weekly-chart";
import { RankBadge } from "@/components/gamification/rank-badge";
import { GradingCelebration } from "@/components/gamification/celebration";
import { XpBar } from "@/components/motion/xp-bar";
import { CountUp } from "@/components/motion/count-up";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { Avatar, BentoTile, PageHeader, ScoreRing, badgeClass, buttonSecondary } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { formatDate, formatNumber, cairoToday, cn } from "@/lib/utils";
import { levelFor, rankTierFor, TIER_STYLES } from "@/lib/gamification";
import type { LeaderboardEntry, PointsBreakdown, WeeklyProgress } from "@/lib/types";

type AttendanceRow = { status: "present" | "absent" | "late" };
type SubmissionRow = {
  assignment_id: string;
  final_score: number | null;
  ai_score: number | null;
  assignments: { max_score: number } | null;
};
type BadgeRow = {
  badge_id: string;
  awarded_at: string;
  badges: {
    name_en: string;
    name_ar: string;
    description_en: string;
    description_ar: string;
    icon: string;
  } | null;
};
type BadgeCatalogRow = {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  icon: string;
};
type AssignmentRow = {
  id: string;
  title: string;
  deadline: string | null;
  max_score: number;
};
type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
};

type ActiveSession = {
  id: string;
  title: string;
  code_expires_at: string | null;
};

type SessionWarnRow = {
  id: string;
  title: string;
  session_date: string;
  created_at: string;
};

type AssignmentWarnRow = {
  id: string;
  title: string;
  deadline: string | null;
  created_at: string;
};

type SubmissionWarnRow = {
  assignment_id: string;
  created_at: string;
};

function TileLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)] transition hover:text-bronze-600 dark:hover:text-bronze-300"
    >
      {children}
      <ArrowUpRight
        className="size-3 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:-scale-x-100"
        aria-hidden="true"
      />
    </Link>
  );
}

export default async function StudentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  const t = await getTranslations("dashboard");
  const tg = await getTranslations("gamification");

  const supabase = await createClient();
  const [
    attendanceResult,
    sessionCountResult,
    submissionsResult,
    badgesResult,
    upcomingResult,
    announcementsResult,
    activeSessionResult,
    breakdownResult,
    pastSessionsResult,
    allAssignmentsResult,
    studentSubmissionsResult,
    studentWarningsResult,
    boardResult,
    weeksResult,
    catalogResult,
    attendanceLookupResult,
  ] = await Promise.all([
    supabase.from("attendance").select("status").eq("student_id", profile.id),
    supabase.from("sessions").select("id", { count: "exact", head: true }).lte("session_date", cairoToday()),
    supabase
      .from("submissions")
      .select("assignment_id, final_score, ai_score, assignments(max_score)")
      .eq("student_id", profile.id)
      .returns<SubmissionRow[]>(),
    supabase
      .from("student_badges")
      .select("badge_id, awarded_at, badges(name_en, name_ar, description_en, description_ar, icon)")
      .eq("student_id", profile.id)
      .order("awarded_at", { ascending: false })
      .returns<BadgeRow[]>(),
    supabase
      .from("assignments")
      .select("id, title, deadline, max_score")
      .gte("deadline", new Date().toISOString())
      .order("deadline", { ascending: true })
      .limit(3)
      .returns<AssignmentRow[]>(),
    supabase
      .from("announcements")
      .select("id, title, body, pinned, created_at")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3)
      .returns<AnnouncementRow[]>(),
    supabase
      .from("sessions")
      .select("id, title, code_expires_at")
      .gt("code_expires_at", new Date().toISOString())
      .order("code_expires_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .returns<ActiveSession | null>(),
    supabase.rpc("my_breakdown"),
    supabase
      .from("sessions")
      .select("id, title, session_date, created_at")
      .order("session_date", { ascending: false })
      .limit(200)
      .returns<SessionWarnRow[]>(),
    supabase
      .from("assignments")
      .select("id, title, deadline, created_at")
      .not("deadline", "is", null)
      .order("deadline", { ascending: false })
      .limit(200)
      .returns<AssignmentWarnRow[]>(),
    supabase
      .from("submissions")
      .select("assignment_id, created_at")
      .eq("student_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<SubmissionWarnRow[]>(),
    supabase
      .from("student_warnings")
      .select("id, reason, note, created_at")
      .eq("student_id", profile.id)
      .order("created_at", { ascending: false })
      .returns<{ id: string; reason: string; note: string | null; created_at: string }[]>(),
    supabase.rpc("leaderboard_page", { p_period: "all" }),
    supabase.rpc("my_progress_weeks", { p_weeks: 8 }),
    supabase
      .from("badges")
      .select("id, code, name_en, name_ar, description_en, description_ar, icon")
      .order("code")
      .returns<BadgeCatalogRow[]>(),
    supabase
      .from("attendance")
      .select("session_id")
      .eq("student_id", profile.id)
      .returns<{ session_id: string }[]>(),
  ]);

  const errors = [
    attendanceResult.error,
    sessionCountResult.error,
    submissionsResult.error,
    badgesResult.error,
    upcomingResult.error,
    announcementsResult.error,
    activeSessionResult.error,
    breakdownResult.error,
    pastSessionsResult.error,
    allAssignmentsResult.error,
    studentSubmissionsResult.error,
    studentWarningsResult.error,
    boardResult.error,
    weeksResult.error,
    attendanceLookupResult.error,
  ];
  for (const error of errors) {
    if (error) console.error("[dashboard] query error:", error);
  }
  const hasError = errors.some(Boolean);

  const breakdown = ((breakdownResult.data ?? [])[0] ?? null) as PointsBreakdown | null;
  const points = Number(breakdown?.total_points ?? 0);
  const weeklyPoints = Number(breakdown?.weekly_points ?? 0);
  const rank = breakdown?.all_rank != null ? Number(breakdown.all_rank) : null;
  const gap = breakdown?.all_gap != null ? Number(breakdown.all_gap) : null;
  const streak = Number(breakdown?.current_streak ?? 0);
  const longestStreak = Number(breakdown?.longest_streak ?? 0);

  const tier = rankTierFor(points);
  const level = levelFor(points);
  const tierLabel = tg(tier.key);
  const nextTierLabel = tier.nextMin === null ? null : tg(rankTierFor(tier.nextMin).key);

  const attendance = (attendanceResult.data ?? []) as AttendanceRow[];
  const attended = attendance.filter((row) => row.status === "present" || row.status === "late").length;
  const totalSessions = sessionCountResult.count ?? 0;
  const attendanceRate = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 0;

  const bestByAssignment = new Map<string, number>();
  for (const row of submissionsResult.data ?? []) {
    const score = row.final_score ?? row.ai_score;
    if (score === null || score === undefined) continue;
    const max = row.assignments?.max_score ?? 100;
    const percent = max > 0 ? Math.min(100, Math.max(0, (score / max) * 100)) : 0;
    const previous = bestByAssignment.get(row.assignment_id);
    if (previous === undefined || percent > previous) bestByAssignment.set(row.assignment_id, percent);
  }
  const gradedCount = bestByAssignment.size;
  const averagePercent =
    gradedCount > 0 ? [...bestByAssignment.values()].reduce((sum, value) => sum + value, 0) / gradedCount : null;

  const badges = badgesResult.data ?? [];
  const upcoming = upcomingResult.data ?? [];
  const announcements = announcementsResult.data ?? [];
  const activeSession = activeSessionResult.data ?? null;
  const weeks = (weeksResult.data ?? []) as WeeklyProgress[];
  const board = (boardResult.data ?? []) as LeaderboardEntry[];
  const boardTop = board.slice(0, 4);
  const meInTop = boardTop.some((entry) => entry.is_me);
  const myEntry = board.find((entry) => entry.is_me) ?? null;

  // Badge catalog with earned state.
  const earnedAt = new Map<string, string>();
  for (const row of badges) earnedAt.set(row.badge_id, row.awarded_at);
  const badgeViews: BadgeView[] = (catalogResult.data ?? []).map((badge) => {
    const awardedAt = earnedAt.get(badge.id);
    return {
      code: badge.code,
      icon: badge.icon,
      name: locale === "ar" ? badge.name_ar : badge.name_en,
      description: locale === "ar" ? badge.description_ar : badge.description_en,
      earned: Boolean(awardedAt),
      awardedAt: awardedAt ? formatDate(awardedAt, locale) : undefined,
    };
  });
  const earnedCount = badgeViews.filter((badge) => badge.earned).length;

  // Warnings (computed on load, nothing stored).
  type WarnItem = StudentWarning & { sortKey: number };
  const warnItems: WarnItem[] = [];
  {
    const accountCreatedMs = Date.parse(profile.created_at);
    const todayCairo = cairoToday();
    const nowMs = Date.now();

    const attendedSessionIds = new Set<string>();
    for (const r of (attendanceLookupResult.data ?? []) as { session_id: string }[]) {
      attendedSessionIds.add(r.session_id);
    }

    const pastSessions = (pastSessionsResult.data ?? []) as SessionWarnRow[];
    for (const sess of pastSessions) {
      if (sess.session_date >= todayCairo) continue;
      if (Date.parse(sess.session_date + "T00:00:00+02:00") < accountCreatedMs) continue;
      if (attendedSessionIds.has(sess.id)) continue;
      warnItems.push({
        id: `absence-${sess.id}`,
        kind: "absence",
        href: "/sessions",
        text: t("warningAbsence", {
          session: sess.title,
          date: formatDate(sess.session_date, locale, { dateStyle: "medium" }),
        }),
        badgeLabel: t("badgeAbsent"),
        sortKey: Date.parse(sess.session_date + "T00:00:00+02:00"),
      });
    }

    const allAssignments = (allAssignmentsResult.data ?? []) as AssignmentWarnRow[];
    const studentSubs = (studentSubmissionsResult.data ?? []) as SubmissionWarnRow[];
    const earliestByAssignment = new Map<string, number>();
    for (const sub of studentSubs) {
      const ms = Date.parse(sub.created_at);
      const prev = earliestByAssignment.get(sub.assignment_id);
      if (prev === undefined || ms < prev) earliestByAssignment.set(sub.assignment_id, ms);
    }
    for (const a of allAssignments) {
      if (!a.deadline) continue;
      const deadlineMs = Date.parse(a.deadline);
      if (deadlineMs >= nowMs) continue;
      if (Date.parse(a.created_at) < accountCreatedMs) continue;
      const earliest = earliestByAssignment.get(a.id);
      if (earliest === undefined) {
        warnItems.push({
          id: `missed-${a.id}`,
          kind: "missed",
          href: `/assignments/${a.id}`,
          text: t("warningMissed", { assignment: a.title }),
          badgeLabel: t("badgeMissed"),
          sortKey: deadlineMs,
        });
      } else if (earliest > deadlineMs) {
        warnItems.push({
          id: `late-${a.id}`,
          kind: "late",
          href: `/assignments/${a.id}`,
          text: t("warningLate", { assignment: a.title }),
          badgeLabel: t("badgeLate"),
          sortKey: deadlineMs,
        });
      }
    }

    for (const w of (studentWarningsResult.data ?? []) as {
      id: string;
      reason: string;
      note: string | null;
      created_at: string;
    }[]) {
      warnItems.push({
        id: `manual-${w.id}`,
        kind: "manual",
        href: "/dashboard",
        text: w.note ? `${w.reason} — ${w.note}` : w.reason,
        badgeLabel: t("badgeLate"),
        sortKey: Date.parse(w.created_at),
      });
    }
  }
  warnItems.sort((a, b) => b.sortKey - a.sortKey);
  const warnings: StudentWarning[] = warnItems.map(({ sortKey, ...rest }) => rest);
  const showAllWarningsLabel = warnings.length > 5 ? t("showAllWarnings", { count: warnings.length }) : "";

  const nextAssignment = upcoming[0] ?? null;
  const tierStyle = TIER_STYLES[tier.key];

  return (
    <div className="space-y-5">
      <GradingCelebration
        studentId={profile.id}
        level={level.level}
        points={points}
        badgeCount={earnedCount}
        labels={{
          levelTitle: tg("levelUpTitle", { level: level.level }),
          levelBody: tg("levelUpBody", { points: formatNumber(points, locale) }),
          badgeTitle: tg("badgeTitle"),
          badgeBody: tg("badgeBody"),
          dismiss: tg("dismiss"),
        }}
      />

      {hasError ? (
        <div className="glass-card rounded-xl border-rose-500/30 bg-rose-500/10 px-4 py-3 font-mono text-xs text-rose-700 dark:text-rose-200">
          {t("loadError")}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <StudentWarningsCard title={t("warningsTitle")} showAllLabel={showAllWarningsLabel} warnings={warnings} />
      ) : null}

      <PageHeader
        eyebrow="student.dashboard"
        title={t("greeting", { name: profile.display_name })}
        description={t("subtitle")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${badgeClass} uppercase`}>{profile.student_code}</span>
            <Link href="/attendance" className={buttonSecondary}>
              <CalendarCheck2 className="size-4" aria-hidden="true" />
              {t("viewAttendance")}
            </Link>
          </div>
        }
      />

      {activeSession ? (
        <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border-emerald-500/30 bg-emerald-500/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="relative grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 ring-1 ring-inset ring-emerald-400/30 dark:text-emerald-300">
              <span className="absolute inset-0 animate-ping rounded-xl bg-emerald-400/10" aria-hidden="true" />
              <CheckCircle2 className="relative size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                // check_in_open
              </p>
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                {t("attendanceOpen", { title: activeSession.title })}
              </p>
              {activeSession.code_expires_at ? (
                <p className="mt-0.5 font-mono text-[11px] text-emerald-700/80 dark:text-emerald-200/70">
                  {formatDate(activeSession.code_expires_at, locale, { timeStyle: "short" })}
                </p>
              ) : null}
            </div>
          </div>
          <Link
            href="/attendance"
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-500/20 dark:text-emerald-200"
          >
            {t("viewAttendance")}
            <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      ) : null}

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Rank + XP hero */}
        <StaggerItem className="sm:col-span-2 lg:col-span-2 lg:row-span-2">
          <BentoTile className="flex h-full flex-col justify-between overflow-hidden p-6">
            <div
              className="pointer-events-none absolute -end-10 -top-10 size-52 rounded-full opacity-25 blur-2xl"
              style={{ background: tierStyle.glow }}
              aria-hidden="true"
            />
            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <RankBadge tier={tier.key} label={tierLabel} size="md" />
                  <span className="rounded-full border border-[var(--line)] bg-[var(--glass-inset)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    {tg("levelShort")} {level.level}
                  </span>
                </div>
                <TileLink href="/progress">{t("pointsDetail")}</TileLink>
              </div>

              <div className="mt-6 flex items-end gap-2">
                <span className="font-mono text-5xl font-bold leading-none tracking-tight text-[var(--ink)] sm:text-6xl">
                  <CountUp value={points} decimals={points % 1 === 0 ? 0 : 2} />
                </span>
                <span className="pb-1.5 font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">XP</span>
              </div>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                {tg("level", { level: level.level })} ·{" "}
                {tier.pointsToNext !== null
                  ? tg("nextTier", {
                      points: formatNumber(tier.pointsToNext, locale),
                      tier: nextTierLabel ?? "",
                    })
                  : tg("maxTier")}
              </p>
            </div>

            <div className="relative mt-6 space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                  <span>{tg("xpLabel")}</span>
                  <span className="text-[var(--ink-soft)]">
                    {formatNumber(level.intoLevel, locale)} / {level.levelSize}
                  </span>
                </div>
                <XpBar progress={level.progress} label={tg("xpLabel")} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="glass-inset rounded-xl px-3 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    {t("average")}
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--ink)]">
                    {averagePercent === null ? "—" : `${formatNumber(averagePercent, locale, 1)}%`}
                  </p>
                </div>
                <div className="glass-inset rounded-xl px-3 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    {t("points")}
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--ink)]">
                    +{formatNumber(weeklyPoints, locale, 2)}
                  </p>
                </div>
                <div className="glass-inset rounded-xl px-3 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    {tg("rank")}
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--ink)]">
                    {rank === null ? "—" : `#${formatNumber(rank, locale)}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                <span>{tierLabel}</span>
                <span>{nextTierLabel ?? "MAX"}</span>
              </div>
              <div className="xp-track h-1 rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${tier.progress * 100}%`, background: tierStyle.hex }}
                />
              </div>
              {gap !== null && gap > 0 ? (
                <p className="font-mono text-[10px] text-[var(--ink-muted)]">
                  {t("pointsRank", { rank: formatNumber(rank ?? 0, locale) })} · {formatNumber(gap, locale, 2)} XP to
                  next
                </p>
              ) : null}
            </div>
          </BentoTile>
        </StaggerItem>

        {/* Streak */}
        <StaggerItem>
          <BentoTile className="glass-hover flex h-full flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="caption-code">{tg("streak")}</p>
              <Flame className="flame-pulse size-5 text-orange-500" aria-hidden="true" />
            </div>
            <div className="mt-4">
              <p className="font-mono text-4xl font-bold leading-none text-[var(--ink)]">
                <CountUp value={streak} />
                <span className="ms-1.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                  {tg("daysShort")}
                </span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--ink-muted)]">
                {streak > 0 ? tg("keepStreak") : tg("noStreak")}{" "}
                <span className="text-[var(--ink-soft)]">
                  {t("bestStreak", { count: formatNumber(longestStreak, locale) })}
                </span>
              </p>
            </div>
            <div className="mt-4 flex gap-1">
              {Array.from({ length: 7 }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    index < Math.min(7, streak) ? "bg-gradient-to-r from-orange-500 to-amber-400" : "bg-[var(--line)]",
                  )}
                />
              ))}
            </div>
          </BentoTile>
        </StaggerItem>

        {/* Attendance */}
        <StaggerItem>
          <BentoTile className="glass-hover flex h-full flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="caption-code">{t("attendance")}</p>
              <CalendarCheck2 className="size-5 text-teal-500" aria-hidden="true" />
            </div>
            <div className="mt-3 flex items-center gap-4">
              <ScoreRing value={attendanceRate} size={74} label={t("attendance")} />
              <div className="min-w-0">
                <p className="font-mono text-lg font-bold text-[var(--ink)]">
                  {formatNumber(attended, locale)}
                  <span className="text-xs font-medium text-[var(--ink-muted)]">
                    /{formatNumber(totalSessions, locale)}
                  </span>
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-muted)]">
                  {t("attendanceDetail", { attended, total: totalSessions })}
                </p>
              </div>
            </div>
            <Link
              href="/attendance"
              className="mt-4 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)] transition hover:text-bronze-600 dark:hover:text-bronze-300"
            >
              <Clock3 className="size-3" aria-hidden="true" />
              {t("viewAttendance")}
            </Link>
          </BentoTile>
        </StaggerItem>

        {/* Next assignment */}
        <StaggerItem className="sm:col-span-2 lg:col-span-2">
          <BentoTile className="glass-hover flex h-full flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="caption-code">{t("nextUp")}</p>
                {nextAssignment ? (
                  <>
                    <h2 className="mt-2 text-lg font-bold leading-snug text-[var(--ink)]">{nextAssignment.title}</h2>
                    <p className="mt-1 font-mono text-[11px] text-[var(--ink-muted)]">
                      {nextAssignment.deadline
                        ? t("due", {
                            date: formatDate(nextAssignment.deadline, locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }),
                          })
                        : "—"}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="mt-2 text-lg font-bold text-[var(--ink)]">{t("noUpcoming")}</h2>
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("noDeadlines")}</p>
                  </>
                )}
              </div>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-600 ring-1 ring-inset ring-sky-400/25 dark:text-sky-300">
                <CalendarCheck2 className="size-5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
              {nextAssignment ? (
                <>
                  <span className={badgeClass}>
                    {t("outOf", { max: formatNumber(nextAssignment.max_score, locale) })}
                  </span>
                  <Link
                    href={`/assignments/${nextAssignment.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-bronze-700 transition hover:text-bronze-600 dark:text-bronze-300"
                  >
                    {t("openAssignment")}
                    <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                  </Link>
                </>
              ) : (
                <TileLink href="/assignments">{t("allAssignments")}</TileLink>
              )}
            </div>
          </BentoTile>
        </StaggerItem>

        {/* Leaderboard */}
        <StaggerItem className="sm:col-span-2 lg:col-span-2">
          <BentoTile className="glass-hover flex h-full flex-col">
            <div className="flex items-center justify-between">
              <div>
                <p className="caption-code">{t("leaderboardTile")}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {rank === null ? tg("unranked") : t("pointsRank", { rank: formatNumber(rank, locale) })}
                </p>
              </div>
              <TileLink href="/leaderboard">{t("viewAll")}</TileLink>
            </div>

            <ul className="mt-4 space-y-1.5">
              {boardTop.map((entry) => (
                <li
                  key={`${entry.rank}-${entry.display_name}`}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-2.5 py-2 transition",
                    entry.is_me
                      ? "bg-bronze-500/12 ring-1 ring-inset ring-bronze-400/25"
                      : "hover:bg-[var(--glass-inset)]",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-bold",
                      entry.rank === 1
                        ? "bg-amber-500/15 text-amber-600 ring-1 ring-inset ring-amber-400/30 dark:text-amber-300"
                        : "bg-[var(--glass-inset)] text-[var(--ink-muted)]",
                    )}
                  >
                    {entry.rank === 1 ? (
                      <Trophy className="size-3.5" aria-hidden="true" />
                    ) : (
                      formatNumber(entry.rank, locale)
                    )}
                  </span>
                  <Avatar name={entry.display_name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink)]">
                    {entry.display_name}
                    {entry.is_me ? (
                      <span className="ms-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-bronze-600 dark:text-bronze-300">
                        {t("you")}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-mono text-xs font-semibold text-[var(--ink-soft)]">
                    {formatNumber(Number(entry.points), locale, 2)}
                  </span>
                </li>
              ))}
              {!meInTop && myEntry ? (
                <li className="mt-1 flex items-center gap-3 rounded-xl bg-bronze-500/12 px-2.5 py-2 ring-1 ring-inset ring-bronze-400/25">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-bronze-500/15 font-mono text-[11px] font-bold text-bronze-700 dark:text-bronze-300">
                    {formatNumber(myEntry.rank, locale)}
                  </span>
                  <Avatar name={myEntry.display_name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink)]">
                    {myEntry.display_name}
                  </span>
                  <span className="font-mono text-xs font-semibold text-bronze-700 dark:text-bronze-300">
                    {formatNumber(Number(myEntry.points), locale, 2)}
                  </span>
                </li>
              ) : null}
              {boardTop.length === 0 ? (
                <li className="rounded-xl border border-dashed border-[var(--line)] px-3 py-6 text-center text-xs text-[var(--ink-muted)]">
                  {t("noLeaderboard")}
                </li>
              ) : null}
            </ul>
          </BentoTile>
        </StaggerItem>

        {/* Momentum chart */}
        <StaggerItem className="sm:col-span-2 lg:col-span-2">
          <BentoTile className="flex h-full flex-col">
            <div className="flex items-center justify-between">
              <div>
                <p className="caption-code">{t("progressTile")}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{t("lastEightWeeks")}</p>
              </div>
              <span className="grid size-10 place-items-center rounded-xl bg-violet-500/15 text-violet-600 ring-1 ring-inset ring-violet-400/25 dark:text-violet-300">
                <Sparkles className="size-5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 flex-1">
              <WeeklyPointsChart
                data={weeks}
                locale={locale}
                pointsLabel={t("progressTile")}
                emptyLabel={t("noProgress")}
              />
            </div>
            <TileLink href="/progress">{t("viewProgress")}</TileLink>
          </BentoTile>
        </StaggerItem>

        {/* Badges */}
        <StaggerItem className="sm:col-span-2 lg:col-span-2">
          <BentoTile className="flex h-full flex-col">
            <div className="flex items-center justify-between">
              <div>
                <p className="caption-code">{t("yourBadges")}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {tg("badgesEarned", { earned: earnedCount, total: badgeViews.length })}
                </p>
              </div>
              <TileLink href="/progress">{t("viewAll")}</TileLink>
            </div>
            {badgeViews.length === 0 ? (
              <p className="mt-6 text-sm text-[var(--ink-muted)]">{t("noBadges")}</p>
            ) : (
              <div className="mt-4 grid grid-cols-4 gap-2">
                {badgeViews.slice(0, 8).map((badge) => (
                  <div
                    key={badge.code}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-center",
                      badge.earned
                        ? "border-amber-400/30 bg-amber-500/10"
                        : "border-[var(--line)] bg-[var(--glass-inset)] opacity-60",
                    )}
                    title={badge.description}
                  >
                    <span className={cn("text-xl", !badge.earned && "grayscale")} aria-hidden="true">
                      {badge.icon}
                    </span>
                    <span className="line-clamp-2 text-[9px] font-medium leading-tight text-[var(--ink-soft)]">
                      {badge.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-auto pt-4">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                <Medal className="size-3.5 text-bronze-500" aria-hidden="true" />
                {t("averageDetail", { count: gradedCount })} · {t("badgesDetail")}
              </div>
            </div>
          </BentoTile>
        </StaggerItem>

        {/* Announcements */}
        <StaggerItem className="sm:col-span-2 lg:col-span-2">
          <BentoTile className="flex h-full flex-col">
            <div className="flex items-center justify-between">
              <div>
                <p className="caption-code">{t("announcements")}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{t("announcementsHint")}</p>
              </div>
              <span className="grid size-10 place-items-center rounded-xl bg-bronze-500/15 text-bronze-700 ring-1 ring-inset ring-bronze-400/25 dark:text-bronze-300">
                <Star className="size-5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 flex-1">
              <AnnouncementList
                announcements={announcements}
                locale={locale}
                pinnedLabel={t("pinned")}
                emptyTitle={t("noAnnouncements")}
              />
            </div>
          </BentoTile>
        </StaggerItem>
      </Stagger>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden="true" />
          {t("pointsRank", { rank: rank === null ? "—" : `#${formatNumber(rank, locale)}` })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3.5" aria-hidden="true" />
          {formatDate(new Date(), locale, { dateStyle: "full" })}
        </span>
      </div>
    </div>
  );
}
