import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Alert, Card, CardHeader, EmptyState, PageHeader, StatCard, buttonPrimary } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate, initials } from "@/lib/utils";

type RecentStudent = {
  id: string;
  display_name: string;
  username: string;
  student_code: string;
  created_at: string;
};

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireStaff(locale);
  const isAdmin = profile.role === "admin";
  const t = await getTranslations("admin.overview");

  const supabase = await createClient();
  const [students, sessions, assignments, pending, recent] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "student"),
    supabase.from("sessions").select("id", { count: "exact", head: true }),
    supabase.from("assignments").select("id", { count: "exact", head: true }),
    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("profiles")
      .select("id, display_name, username, student_code, created_at")
      .eq("role", "student")
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<RecentStudent[]>(),
  ]);

  const hasError = [students.error, sessions.error, assignments.error, pending.error, recent.error].some(
    Boolean,
  );

  return (
    <div className="space-y-6">
      {hasError ? <Alert>{t("loadError")}</Alert> : null}

      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <Link
            href={isAdmin ? "/admin/students" : "/admin/sessions"}
            className={buttonPrimary}
          >
            {isAdmin ? t("manageStudents") : t("manageSessions")}
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("students")}
          value={students.count ?? 0}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <StatCard
          label={t("sessions")}
          value={sessions.count ?? 0}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M8 3v4M16 3v4M3 10h18" />
            </svg>
          }
        />
        <StatCard
          label={t("assignments")}
          value={assignments.count ?? 0}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6M9 13h6M9 17h6" />
            </svg>
          }
        />
        <StatCard
          label={t("pending")}
          value={pending.count ?? 0}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("recentStudents")}
            action={
              isAdmin ? (
                <Link
                  href="/admin/students"
                  className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
                >
                  {t("viewAllStudents")}
                </Link>
              ) : undefined
            }
          />
          {recent.data && recent.data.length > 0 ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.data.map((student) => (
                <li key={student.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                    {initials(student.display_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {student.display_name}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      @{student.username}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {student.student_code}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
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
        </Card>

        <Card>
          <CardHeader title={t("teacherTools")} />
          <div className="space-y-3 p-5">
            {isAdmin ? (
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("studentsCardTitle")}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {t("studentsCardBody")}
                </p>
                <Link href="/admin/students" className={`${buttonPrimary} mt-4`}>
                  {t("manageStudents")}
                </Link>
              </div>
            ) : null}
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("sessionsCardTitle")}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t("sessionsCardBody")}
              </p>
              <Link href="/admin/sessions" className={`${buttonPrimary} mt-4`}>
                {t("manageSessions")}
              </Link>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("assignmentsCardTitle")}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t("assignmentsCardBody")}
              </p>
              <Link href="/admin/assignments" className={`${buttonPrimary} mt-4`}>
                {t("manageAssignments")}
              </Link>
            </div>
            {isAdmin ? (
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("pointsCardTitle")}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {t("pointsCardBody")}
                </p>
                <Link href="/admin/points" className={`${buttonPrimary} mt-4`}>
                  {t("managePoints")}
                </Link>
              </div>
            ) : null}
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("analyticsCardTitle")}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t("analyticsCardBody")}
              </p>
              <Link href="/admin/analytics" className={`${buttonPrimary} mt-4`}>
                {t("openAnalytics")}
              </Link>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("announcementsCardTitle")}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t("announcementsCardBody")}
              </p>
              <Link href="/admin/announcements" className={`${buttonPrimary} mt-4`}>
                {t("manageAnnouncements")}
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
