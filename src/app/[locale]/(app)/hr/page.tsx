import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowUpRight, CalendarCheck2, CheckCircle2, Megaphone, TriangleAlert, UserCheck, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { BentoTile, EmptyState, PageHeader, ScoreRing, StatCard, buttonSecondary } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { requireHr } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/utils";

type OverviewRow = {
  student_id: string;
  full_name: string;
  student_code: string;
  attendance_percent: number | null;
  absences: number;
  warnings_count: number;
  needs_warning: boolean;
};

type SessionRow = {
  id: string;
  title: string;
  session_date: string;
};

export default async function HrOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);
  await requireHr(locale);
  const t = await getTranslations("hr");

  const supabase = await createClient();
  const [overviewResult, sessionsResult] = await Promise.all([
    supabase.rpc("hr_students_overview", { p_search: null }),
    supabase
      .from("sessions")
      .select("id, title, session_date")
      .order("session_date", { ascending: false })
      .limit(1)
      .returns<SessionRow[]>(),
  ]);

  const rows = (overviewResult.data ?? []) as OverviewRow[];
  const latestSession = (sessionsResult.data ?? [])[0] ?? null;

  let present = 0;
  let late = 0;
  let marked = 0;
  if (latestSession) {
    const attendanceResult = await supabase.from("attendance").select("status").eq("session_id", latestSession.id);
    const attendance = (attendanceResult.data ?? []) as { status: string }[];
    present = attendance.filter((row) => row.status === "present").length;
    late = attendance.filter((row) => row.status === "late").length;
    marked = attendance.length;
  }

  const totalStudents = rows.length;
  const needsAttention = rows.filter((row) => row.needs_warning);
  const totalWarnings = rows.reduce((sum, row) => sum + Number(row.warnings_count || 0), 0);
  const rates = rows.map((row) => Number(row.attendance_percent)).filter((value) => Number.isFinite(value));
  const averageAttendance =
    rates.length > 0 ? Math.round(rates.reduce((sum, value) => sum + value, 0) / rates.length) : 0;

  const links = [
    {
      href: "/hr/attendance",
      title: t("attendanceCard"),
      body: t("attendanceCardHint"),
      icon: UserCheck,
      tone: "bg-teal-500/15 text-teal-600 ring-teal-400/25 dark:text-teal-300",
    },
    {
      href: "/hr/students",
      title: t("studentsCard"),
      body: t("studentsCardHint"),
      icon: Users,
      tone: "bg-sky-500/15 text-sky-600 ring-sky-400/25 dark:text-sky-300",
    },
    {
      href: "/hr/warnings",
      title: t("warningsCard"),
      body: t("warningsCardHint"),
      icon: TriangleAlert,
      tone: "bg-amber-500/15 text-amber-600 ring-amber-400/25 dark:text-amber-300",
    },
    {
      href: "/hr/announcements",
      title: t("overviewTitle"),
      body: t("overviewSubtitle"),
      icon: Megaphone,
      tone: "bg-bronze-500/15 text-bronze-700 ring-bronze-400/25 dark:text-bronze-300",
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="hr.overview"
        title={t("overviewTitle")}
        description={t("overviewSubtitle")}
        action={
          <Link href="/hr/attendance" className={buttonSecondary}>
            <CalendarCheck2 className="size-4" aria-hidden="true" />
            {t("attendanceCard")}
          </Link>
        }
      />

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <StatCard
            label={t("studentsCount")}
            value={totalStudents}
            numericValue={totalStudents}
            hint={t("studentsCardHint")}
            tone="teal"
            icon={<Users className="size-5" aria-hidden="true" />}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label={t("averageAttendance")}
            value={`${formatNumber(averageAttendance, locale)}%`}
            numericValue={averageAttendance}
            suffix="%"
            hint={t("attendanceCardHint")}
            tone="sky"
            icon={<CalendarCheck2 className="size-5" aria-hidden="true" />}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label={t("needsAttention")}
            value={needsAttention.length}
            numericValue={needsAttention.length}
            hint={t("needsAttentionHint")}
            tone={needsAttention.length > 0 ? "rose" : "emerald"}
            icon={
              needsAttention.length > 0 ? (
                <TriangleAlert className="size-5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-5" aria-hidden="true" />
              )
            }
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label={t("warningsCard")}
            value={totalWarnings}
            numericValue={totalWarnings}
            hint={t("warningsCardHint")}
            tone="bronze"
            icon={<TriangleAlert className="size-5" aria-hidden="true" />}
          />
        </StaggerItem>

        <StaggerItem className="sm:col-span-2 lg:col-span-2 lg:row-span-2">
          <BentoTile className="flex h-full flex-col p-0">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <div>
                <p className="caption-code">{t("needsAttention")}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{t("needsAttentionHint")}</p>
              </div>
              <Link
                href="/hr/students"
                className="text-[var(--ink-muted)] transition hover:text-bronze-600 dark:hover:text-bronze-300"
              >
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            {needsAttention.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <EmptyState
                  title={t("allClear")}
                  description={t("warningsCardHint")}
                  icon={<CheckCircle2 className="size-8 text-emerald-500" aria-hidden="true" />}
                />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {needsAttention.slice(0, 6).map((student) => (
                  <li key={student.student_id}>
                    <Link
                      href={`/hr/students/${student.student_id}`}
                      className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[var(--glass-inset)]"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-rose-500/80 to-amber-500/70 font-mono text-[10px] font-bold text-white ring-1 ring-inset ring-white/20">
                        {formatNumber(Number(student.absences), locale)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--ink)]">{student.full_name}</p>
                        <p className="truncate font-mono text-[10px] text-[var(--ink-muted)]">
                          {student.student_code} · {t("colAbsent")}: {formatNumber(Number(student.absences), locale)}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-300">
                        {t("needsWarning")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto border-t border-[var(--line)] px-5 py-3">
              <Link
                href="/hr/warnings"
                className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)] transition hover:text-bronze-600 dark:hover:text-bronze-300"
              >
                {t("warningsCard")}
                <ArrowUpRight className="size-3 rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            </div>
          </BentoTile>
        </StaggerItem>

        {/* Latest session */}
        <StaggerItem className="sm:col-span-2 lg:col-span-2">
          <BentoTile className="flex h-full flex-col">
            <div className="flex items-center justify-between">
              <div>
                <p className="caption-code">{t("latestSession")}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                  {latestSession ? latestSession.title : t("noSession")}
                </p>
                {latestSession ? (
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--ink-muted)]">
                    {formatDate(latestSession.session_date, locale)}
                  </p>
                ) : null}
              </div>
              <ScoreRing
                value={marked > 0 ? Math.round(((present + late) / marked) * 100) : 0}
                size={64}
                label={t("attendanceCard")}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="glass-inset rounded-xl px-3 py-2.5 text-center">
                <p className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-300">
                  {formatNumber(present, locale)}
                </p>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  {t("presentCount")}
                </p>
              </div>
              <div className="glass-inset rounded-xl px-3 py-2.5 text-center">
                <p className="font-mono text-lg font-bold text-amber-600 dark:text-amber-300">
                  {formatNumber(late, locale)}
                </p>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  {t("lateCount")}
                </p>
              </div>
              <div className="glass-inset rounded-xl px-3 py-2.5 text-center">
                <p className="font-mono text-lg font-bold text-[var(--ink)]">{formatNumber(marked, locale)}</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  {t("markedCount")}
                </p>
              </div>
            </div>
            <Link
              href="/hr/attendance"
              className="mt-auto inline-flex items-center gap-1 pt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)] transition hover:text-bronze-600 dark:hover:text-bronze-300"
            >
              {t("openAttendance")}
              <ArrowUpRight className="size-3 rtl:-scale-x-100" aria-hidden="true" />
            </Link>
          </BentoTile>
        </StaggerItem>

        <StaggerItem className="sm:col-span-2 lg:col-span-2">
          <BentoTile className="flex h-full flex-col">
            <p className="caption-code">{t("quickActions")}</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {links.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group flex items-start gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--glass-inset)] p-3 transition hover:-translate-y-0.5 hover:border-bronze-400/45"
                  >
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${link.tone}`}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-[var(--ink)]">{link.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-[10px] leading-relaxed text-[var(--ink-muted)]">
                        {link.body}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </BentoTile>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
