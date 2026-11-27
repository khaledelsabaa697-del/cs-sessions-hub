import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CreateSessionForm } from "@/components/admin/create-session-form";
import { Alert, Card, CardHeader, EmptyState, PageHeader, buttonSecondary } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate, cairoToday } from "@/lib/utils";
import type { SessionSummary } from "@/lib/types";

const liveBadge =
  "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20";
const mutedBadge =
  "inline-flex items-center rounded-full bg-[var(--glass-inset)] px-2.5 py-1 text-xs font-medium text-[var(--ink-soft)] ring-1 ring-inset ring-slate-500/10 dark:ring-slate-400/20";

export default async function AdminSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireStaff(locale);
  const t = await getTranslations("admin.sessions");
  const tn = await getTranslations("nav");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_session_overview");
  const sessions = (data ?? []) as SessionSummary[];

  const today = cairoToday();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <Link href="/admin" className={buttonSecondary}>
            {tn("overview")}
          </Link>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_1fr]">
        <CreateSessionForm locale={locale} today={today} />

        <Card>
          <CardHeader title={t("listTitle")} />
          {error ? (
            <div className="p-5">
              <Alert>{t("loadError")}</Alert>
            </div>
          ) : !sessions || sessions.length === 0 ? (
            <div className="p-5">
              <EmptyState title={t("empty")} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[38rem] text-sm">
                <thead className="bg-[var(--glass-inset)] text-xs uppercase tracking-wide text-[var(--ink-muted)] ">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colSession")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colDate")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colAttendance")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colCode")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-end font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {sessions.map((session) => (
                    <tr key={session.id}>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/sessions/${session.id}`}
                          className="font-medium text-[var(--ink)] hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                        >
                          {session.title}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-[var(--ink-muted)]">
                        {formatDate(session.session_date, locale)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span className="font-medium text-[var(--ink)]">{session.checked_in_count}</span>
                        <span className="text-[var(--ink-muted)]">
                          {" / "}
                          {session.class_size}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {session.code_active ? (
                          <span className={liveBadge}>{t("codeActive")}</span>
                        ) : session.code_expires_at ? (
                          <span className={mutedBadge}>{t("codeExpired")}</span>
                        ) : (
                          <span className={mutedBadge}>{t("noCode")}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-end">
                        <Link
                          href={`/admin/sessions/${session.id}`}
                          className={`${buttonSecondary} px-3 py-1.5 text-xs`}
                        >
                          {t("open")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
