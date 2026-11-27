import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ArrowUpRight,
  BookOpenCheck,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Megaphone,
  Star,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  Alert,
  Avatar,
  BentoTile,
  EmptyState,
  PageHeader,
  StatCard,
  badgeClass,
  buttonPrimary,
  buttonSecondary,
} from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { requireStaff } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate, initials } from "@/lib/utils";
import type { SubmissionStatus } from "@/lib/types";

type RecentStudent = {
  id: string;
  display_name: string;
  username: string;
  student_code: string;
  created_at: string;
};

type PendingRow = {
  id: string;
  assignment_id: string;
  status: SubmissionStatus;
  created_at: string;
  assignments: { title: string } | null;
  profiles: { display_name: string } | null;
};

type WarningRow = {
  id: string;
  reason: string;
  note: string | null;
  created_at: string;
};

export default async function AdminOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireStaff(locale);
  const isAdmin = profile.role === "admin";
  const t = await getTranslations("admin.overview");
  const ts = await getTranslations("submissionStatus");

  const supabase = await createClient();
  const [students, sessions, assignments, pending, recent, pendingList, warningsCount, recentWarnings] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
      supabase.from("sessions").select("id", { count: "exact", head: true }),
      supabase.from("assignments").select("id", { count: "exact", head: true }),
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "queued", "grading", "pending_retry", "failed"]),
      supabase
        .from("profiles")
        .select("id, display_name, username, student_code, created_at")
        .eq("role", "student")
        .order("created_at", { ascending: false })
        .limit(5)
        .returns<RecentStudent[]>(),
      supabase
        .from("submissions")
        .select(
          "id, assignment_id, status, created_at, assignments!submissions_assignment_id_fkey(title), profiles!submissions_student_id_fkey(display_name)",
        )
        .in("status", ["pending", "queued", "grading", "pending_retry", "failed"])
        .order("created_at", { ascending: true })
        .limit(5)
        .returns<PendingRow[]>(),
      supabase.from("student_warnings").select("id", { count: "exact", head: true }),
      supabase
        .from("student_warnings")
        .select("id, reason, note, created_at")
        .order("created_at", { ascending: false })
        .limit(4)
        .returns<WarningRow[]>(),
    ]);

  const hasError = [
    students.error,
    sessions.error,
    assignments.error,
    pending.error,
    recent.error,
    pendingList.error,
    warningsCount.error,
    recentWarnings.error,
  ].some(Boolean);

  const pendingRows = pendingList.data ?? [];
  const warningRows = recentWarnings.data ?? [];
  const pendingTotal = pending.count ?? 0;

  const quickActions = [
    {
      href: "/admin/sessions",
      title: t("sessionsCardTitle"),
      body: t("sessionsCardBody"),
      icon: CalendarDays,
      tone: "text-teal-600 dark:text-teal-300 bg-teal-500/15 ring-teal-400/25",
    },
    {
      href: "/admin/assignments",
      title: t("assignmentsCardTitle"),
      body: t("assignmentsCardBody"),
      icon: ClipboardList,
      tone: "text-sky-600 dark:text-sky-300 bg-sky-500/15 ring-sky-400/25",
    },
    {
      href: "/admin/grading",
      title: t("pendingTitle"),
      body: t("pendingBody"),
      icon: BrainCircuit,
      tone: "text-violet-600 dark:text-violet-300 bg-violet-500/15 ring-violet-400/25",
    },
    {
      href: "/admin/announcements",
      title: t("announcementsCardTitle"),
      body: t("announcementsCardBody"),
      icon: Megaphone,
      tone: "text-bronze-700 dark:text-bronze-300 bg-bronze-500/15 ring-bronze-400/25",
    },
    ...(isAdmin
      ? [
          {
            href: "/admin/students",
            title: t("studentsCardTitle"),
            body: t("studentsCardBody"),
            icon: Users,
            tone: "text-amber-700 dark:text-amber-300 bg-amber-500/15 ring-amber-400/25",
          },
          {
            href: "/admin/points",
            title: t("pointsCardTitle"),
            body: t("pointsCardBody"),
            icon: Star,
            tone: "text-rose-600 dark:text-rose-300 bg-rose-500/15 ring-rose-400/25",
          },
        ]
      : []),
    {
      href: "/admin/analytics",
      title: t("analyticsCardTitle"),
      body: t("analyticsCardBody"),
      icon: BookOpenCheck,
      tone: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/15 ring-emerald-400/25",
    },
  ];

  return (
    <div className="space-y-5">
      {hasError ? <Alert>{t("loadError")}</Alert> : null}

      <PageHeader
        eyebrow="teacher.overview"
        title={t("title")}
        description={t("subtitle")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/grading" className={buttonSecondary}>
              <BrainCircuit className="size-4" aria-hidden="true" />
              {t("openGrading")}
            </Link>
            <Link href={isAdmin ? "/admin/students" : "/admin/sessions"} className={buttonPrimary}>
              {isAdmin ? t("manageStudents") : t("manageSessions")}
              <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            </Link>
          </div>
        }
      />

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <StatCard
            label={t("students")}
            value={students.count ?? 0}
            numericValue={students.count ?? 0}
            hint={isAdmin ? t("studentsCardBody") : undefined}
            tone="teal"
            icon={<Users className="size-5" aria-hidden="true" />}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label={t("sessions")}
            value={sessions.count ?? 0}
            numericValue={sessions.count ?? 0}
            tone="sky"
            icon={<CalendarDays className="size-5" aria-hidden="true" />}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label={t("assignments")}
            value={assignments.count ?? 0}
            numericValue={assignments.count ?? 0}
            tone="violet"
            icon={<ClipboardList className="size-5" aria-hidden="true" />}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label={t("pending")}
            value={pendingTotal}
            numericValue={pendingTotal}
            hint={pendingTotal > 0 ? t("pendingHint") : t("pendingEmpty")}
            tone={pendingTotal > 0 ? "rose" : "emerald"}
            icon={
              pendingTotal > 0 ? (
                <TriangleAlert className="size-5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-5" aria-hidden="true" />
              )
            }
          />
        </StaggerItem>

        {/* Grading queue */}
        <StaggerItem className="sm:col-span-2 lg:col-span-2 lg:row-span-2">
          <BentoTile className="flex h-full flex-col p-0">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
              <div>
                <p className="caption-code">{t("pendingTitle")}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                  {t("pendingCount", { count: pendingTotal })}
                </p>
              </div>
              <Link
                href="/admin/grading"
                className="text-[var(--ink-muted)] transition hover:text-bronze-600 dark:hover:text-bronze-300"
              >
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>

            {pendingRows.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <EmptyState
                  title={t("pendingEmpty")}
                  description={t("pendingBody")}
                  icon={<CheckCircle2 className="size-8 text-emerald-500" aria-hidden="true" />}
                />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {pendingRows.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/admin/assignments/${row.assignment_id}`}
                      className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[var(--glass-inset)]"
                    >
                      <Avatar name={row.profiles?.display_name ?? "?"} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--ink)]">
                          {row.profiles?.display_name ?? "—"}
                        </p>
                        <p className="truncate font-mono text-[10px] text-[var(--ink-muted)]">
                          {row.assignments?.title ?? "—"} · {formatDate(row.created_at, locale, { timeStyle: "short" })}
                        </p>
                      </div>
                      <span
                        className={
                          row.status === "failed"
                            ? "rounded-full bg-rose-500/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-rose-700 dark:text-rose-300"
                            : "rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-300"
                        }
                      >
                        {ts(row.status)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto border-t border-[var(--line)] px-5 py-3">
              <Link
                href="/admin/grading"
                className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)] transition hover:text-bronze-600 dark:hover:text-bronze-300"
              >
                {t("openGrading")}
                <ArrowUpRight className="size-3 rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            </div>
          </BentoTile>
        </StaggerItem>

        {/* Warnings */}
        <StaggerItem className="sm:col-span-2 lg:col-span-2">
          <BentoTile className="flex h-full flex-col">
            <div className="flex items-center justify-between">
              <div>
                <p className="caption-code">{t("warningsTitle")}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{t("warningsHint")}</p>
              </div>
              <span className="grid size-10 place-items-center rounded-xl bg-amber-500/15 text-amber-600 ring-1 ring-inset ring-amber-400/25 dark:text-amber-300">
                <TriangleAlert className="size-5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <span className="font-mono text-4xl font-bold text-[var(--ink)]">{warningsCount.count ?? 0}</span>
              <span className="pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                {t("warningsUnit")}
              </span>
            </div>
            {warningRows.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--ink-muted)]">{t("noWarnings")}</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {warningRows.map((warning) => (
                  <li key={warning.id} className="flex items-start gap-2 text-xs text-[var(--ink-soft)]">
                    <span className="mt-1 font-mono text-[9px] text-amber-500" aria-hidden="true">
                      !
                    </span>
                    <span className="line-clamp-1">
                      {warning.note ? `${warning.reason} — ${warning.note}` : warning.reason}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {isAdmin ? (
              <Link
                href="/hr/warnings"
                className="mt-auto inline-flex items-center gap-1 pt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)] transition hover:text-bronze-600 dark:hover:text-bronze-300"
              >
                {t("openWarnings")}
                <ArrowUpRight className="size-3 rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            ) : null}
          </BentoTile>
        </StaggerItem>

        {/* Recent students */}
        <StaggerItem className="sm:col-span-2 lg:col-span-2">
          <BentoTile className="flex h-full flex-col p-0">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <div>
                <p className="caption-code">{t("recentStudents")}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{t("recentStudentsHint")}</p>
              </div>
              {isAdmin ? (
                <Link
                  href="/admin/students"
                  className="text-[var(--ink-muted)] transition hover:text-bronze-600 dark:hover:text-bronze-300"
                >
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
            {recent.data && recent.data.length > 0 ? (
              <ul className="divide-y divide-[var(--line)]">
                {recent.data.map((student) => (
                  <li key={student.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 font-mono text-[10px] font-bold text-white ring-1 ring-inset ring-white/15">
                      {initials(student.display_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">{student.display_name}</p>
                      <p className="truncate font-mono text-[10px] text-[var(--ink-muted)]">@{student.username}</p>
                    </div>
                    <div className="text-end">
                      <p className="font-mono text-[10px] text-bronze-700 dark:text-bronze-300">
                        {student.student_code}
                      </p>
                      <p className="font-mono text-[9px] text-[var(--ink-muted)]">
                        {formatDate(student.created_at, locale)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState title={t("emptyStudents")} />
              </div>
            )}
            {isAdmin ? (
              <div className="mt-auto border-t border-[var(--line)] px-5 py-3">
                <Link
                  href="/admin/students"
                  className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)] transition hover:text-bronze-600 dark:hover:text-bronze-300"
                >
                  {t("viewAllStudents")}
                  <ArrowUpRight className="size-3 rtl:-scale-x-100" aria-hidden="true" />
                </Link>
              </div>
            ) : null}
          </BentoTile>
        </StaggerItem>

        {/* Quick actions */}
        <StaggerItem className="sm:col-span-2 lg:col-span-4">
          <BentoTile className="p-0">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <p className="caption-code">{t("quickActions")}</p>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">{t("quickActionsHint")}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="group flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--glass-inset)] p-3.5 transition hover:-translate-y-0.5 hover:border-bronze-400/45"
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${action.tone}`}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--ink)]">{action.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-[11px] leading-relaxed text-[var(--ink-muted)]">
                        {action.body}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </BentoTile>
        </StaggerItem>
      </Stagger>

      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
        <span className={`${badgeClass} uppercase`}>teacher.console</span>
        <span>
          {t("lastUpdated", { date: formatDate(new Date(), locale, { dateStyle: "medium", timeStyle: "short" }) })}
        </span>
      </div>
    </div>
  );
}
