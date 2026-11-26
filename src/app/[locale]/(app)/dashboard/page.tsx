import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { StudentWarningsCard, type StudentWarning } from "@/components/student-warnings-card";
import { AnnouncementList } from "@/components/announcement-list";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { formatDate, formatNumber } from "@/lib/utils";
import type { PointsBreakdown } from "@/lib/types";
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  badgeClass,
  buttonPrimary,
  buttonSecondary,
} from "@/components/ui";

type AttendanceRow = { status: "present" | "absent" | "late" };
type SubmissionRow = {
  assignment_id: string;
  final_score: number | null;
  ai_score: number | null;
  assignments: { max_score: number } | null;
};
type BadgeRow = {
  awarded_at: string;
  badges: {
    name_en: string;
    name_ar: string;
    description_en: string;
    description_ar: string;
    icon: string;
  } | null;
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

export default async function StudentDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  const t = await getTranslations("dashboard");

  const supabase = await createClient();
  const [attendanceResult, sessionCountResult, submissionsResult, badgesResult, upcomingResult, announcementsResult, activeSessionResult, breakdownResult, pastSessionsResult, allAssignmentsResult, studentSubmissionsResult, studentWarningsResult] =
    await Promise.all([
      supabase.from("attendance").select("status").eq("student_id", profile.id),
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .lte("session_date", new Date().toISOString().slice(0, 10)),
      supabase
        .from("submissions")
        .select("assignment_id, final_score, ai_score, assignments(max_score)")
        .eq("student_id", profile.id)
        .returns<SubmissionRow[]>(),
      supabase
        .from("student_badges")
        .select("awarded_at, badges(name_en, name_ar, description_en, description_ar, icon)")
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
        .returns<SubmissionWarnRow[]>(),
      supabase
        .from("student_warnings")
        .select("id, reason, note, created_at")
        .eq("student_id", profile.id)
        .order("created_at", { ascending: false })
        .returns<{ id: string; reason: string; note: string | null; created_at: string }[]>(),
    ]);

  if (attendanceResult.error) console.error("[dashboard] attendance error:", attendanceResult.error);
  if (sessionCountResult.error) console.error("[dashboard] sessionCount error:", sessionCountResult.error);
  if (submissionsResult.error) console.error("[dashboard] submissions error:", submissionsResult.error);
  if (badgesResult.error) console.error("[dashboard] badges error:", badgesResult.error);
  if (upcomingResult.error) console.error("[dashboard] upcoming error:", upcomingResult.error);
  if (announcementsResult.error) console.error("[dashboard] announcements error:", announcementsResult.error);
  if (activeSessionResult.error) console.error("[dashboard] activeSession error:", activeSessionResult.error);
  if (breakdownResult.error) console.error("[dashboard] my_breakdown error:", breakdownResult.error);
  if (pastSessionsResult.error) console.error("[dashboard] past sessions error:", pastSessionsResult.error);
  if (allAssignmentsResult.error) console.error("[dashboard] assignments error:", allAssignmentsResult.error);
  if (studentSubmissionsResult.error) console.error("[dashboard] student submissions error:", studentSubmissionsResult.error);
  if (studentWarningsResult.error) console.error("[dashboard] student warnings error:", studentWarningsResult.error);

  const hasError = [
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
  ].some(Boolean);

  const breakdown = ((breakdownResult.data ?? [])[0] ?? null) as PointsBreakdown | null;

  const attendance = (attendanceResult.data ?? []) as AttendanceRow[];
  const attended = attendance.filter(
    (row) => row.status === "present" || row.status === "late",
  ).length;
  const totalSessions = sessionCountResult.count ?? 0;
  const attendanceRate =
    totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 0;

  const bestByAssignment = new Map<string, number>();
  for (const row of submissionsResult.data ?? []) {
    const score = row.final_score ?? row.ai_score;
    if (score === null || score === undefined) continue;
    const max = row.assignments?.max_score ?? 100;
    const percent = max > 0 ? Math.min(100, Math.max(0, (score / max) * 100)) : 0;
    const previous = bestByAssignment.get(row.assignment_id);
    if (previous === undefined || percent > previous) {
      bestByAssignment.set(row.assignment_id, percent);
    }
  }

  const gradedCount = bestByAssignment.size;
  const averagePercent =
    gradedCount > 0
      ? [...bestByAssignment.values()].reduce((sum, value) => sum + value, 0) / gradedCount
      : null;

  const badges = badgesResult.data ?? [];
  const upcoming = upcomingResult.data ?? [];
  const announcements = announcementsResult.data ?? [];
  const activeSession = activeSessionResult.data ?? null;

  // Warnings (students only). Computed on every load, nothing stored.
  type WarnItem = StudentWarning & { sortKey: number };
  const warnItems: WarnItem[] = [];
  if (profile.role === "student") {
    const accountCreatedMs = Date.parse(profile.created_at);
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const todayMs = todayUtc.getTime();
    const nowMs = Date.now();

    const attendedSessionIds = new Set<string>();
    const attRes = await supabase
      .from("attendance")
      .select("session_id")
      .eq("student_id", profile.id);
    for (const r of (attRes.data ?? []) as { session_id: string }[]) {
      attendedSessionIds.add(r.session_id);
    }

    const pastSessions = (pastSessionsResult.data ?? []) as SessionWarnRow[];
    for (const sess of pastSessions) {
      const sessionDateMs = Date.parse(sess.session_date + "T00:00:00Z");
      if (sessionDateMs >= todayMs) continue;
      if (sessionDateMs < accountCreatedMs) continue;
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
        sortKey: sessionDateMs,
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
  }

  // Manual warnings (from HR/admin)
  if (profile.role === "student") {
    for (const w of (studentWarningsResult.data ?? []) as { id: string; reason: string; note: string | null; created_at: string }[]) {
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

  // Newest first
  warnItems.sort((a, b) => b.sortKey - a.sortKey);
  const warnings: StudentWarning[] = warnItems.map(({ sortKey, ...rest }) => rest);

  const showAllWarningsLabel =
    warnings.length > 5 ? t("showAllWarnings", { count: warnings.length }) : "";

  return (
    <div className="space-y-6">
      {hasError ? <Alert>{t("loadError")}</Alert> : null}

      {profile.role === "student" && warnings.length > 0 ? (
        <StudentWarningsCard
          title={t("warningsTitle")}
          showAllLabel={showAllWarningsLabel}
          warnings={warnings}
        />
      ) : null}

      <PageHeader
        title={t("greeting", { name: profile.display_name })}
        description={t("subtitle")}
        action={
          <div className="flex items-center gap-2">
            <span className={`${badgeClass} font-mono`}>{profile.student_code}</span>
            <Link href="/attendance" className={buttonSecondary}>
              {t("viewAttendance")}
            </Link>
          </div>
        }
      />

      {activeSession ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              {t("attendanceOpen", { title: activeSession.title })}
            </p>
            {activeSession.code_expires_at ? (
              <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                {formatDate(activeSession.code_expires_at, locale, {
                  timeStyle: "short",
                })}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("points")}
          value={formatNumber(Number(breakdown?.total_points ?? 0), locale, 2)}
          hint={
            breakdown?.all_rank != null
              ? t("pointsRank", { rank: formatNumber(Number(breakdown.all_rank), locale) })
              : t("pointsDetail")
          }
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="M12 3v3M12 18v3M4.2 7.2l2.1 2.1M17.7 14.7l2.1 2.1M3 12h3M18 12h3M4.2 16.8l2.1-2.1M17.7 9.3l2.1-2.1" />
              <circle cx="12" cy="12" r="3.5" />
            </svg>
          }
        />
        <StatCard
          label={t("attendance")}
          value={`${formatNumber(attendanceRate, locale)}%`}
          hint={t("attendanceDetail", { attended, total: totalSessions })}
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4" />
            </svg>
          }
        />
        <StatCard
          label={t("average")}
          value={
            averagePercent === null
              ? "—"
              : `${formatNumber(averagePercent, locale, 1)}%`
          }
          hint={t("averageDetail", { count: gradedCount })}
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
            </svg>
          }
        />
        <StatCard
          label={t("badges")}
          value={formatNumber(badges.length, locale)}
          hint={t("badgesDetail")}
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <circle cx="12" cy="9" r="5" />
              <path d="m8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7" />
            </svg>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col lg:col-span-2">
          <CardHeader
            title={t("deadlines")}
            action={
              <Link
                href="/assignments"
                className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
              >
                {t("allAssignments")}
              </Link>
            }
          />
          {upcoming.length === 0 ? (
            <div className="p-5">
              <EmptyState title={t("noDeadlines")} />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcoming.map((assignment) => (
                <li key={assignment.id}>
                  <Link
                    href={`/assignments/${assignment.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        {assignment.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {assignment.deadline
                          ? t("due", {
                              date: formatDate(assignment.deadline, locale, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }),
                            })
                          : "—"}
                      </p>
                    </div>
                    <span className={badgeClass}>
                      {t("outOf", {
                        max: formatNumber(assignment.max_score, locale),
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader title={t("yourBadges")} />
          {badges.length === 0 ? (
            <div className="p-5">
              <EmptyState title={t("noBadges")} />
            </div>
          ) : (
            <ul className="space-y-3 p-5">
              {badges.map((row, index) => {
                const badge = row.badges;
                if (!badge) return null;
                return (
                  <li key={`${row.awarded_at}-${index}`} className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-lg dark:bg-amber-500/10">
                      <span aria-hidden="true">{badge.icon}</span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        {locale === "ar" ? badge.name_ar : badge.name_en}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {formatDate(row.awarded_at, locale)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title={t("announcements")} />
        <AnnouncementList
          announcements={announcements}
          locale={locale}
          pinnedLabel={t("pinned")}
          emptyTitle={t("noAnnouncements")}
        />
      </Card>
    </div>
  );
}
