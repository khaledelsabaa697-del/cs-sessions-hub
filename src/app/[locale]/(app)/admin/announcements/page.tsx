import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AnnouncementForm } from "@/components/admin/announcement-form";
import { DeleteAnnouncementForm } from "@/components/admin/delete-announcement-form";
import { Alert, Card, CardHeader, EmptyState, PageHeader, buttonSecondary } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import type { Announcement } from "@/lib/types";

export default async function AdminAnnouncementsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireStaff(locale);
  const t = await getTranslations("admin.announcements");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, pinned, created_at, updated_at")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Announcement[]>();

  const announcements = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      {error ? <Alert>{t("loadError")}</Alert> : null}

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <AnnouncementForm locale={locale} mode="create" />
        </div>

        <Card className="lg:col-span-3">
          <CardHeader
            title={t("listTitle")}
            action={
              <span className="text-xs text-[var(--ink-muted)]">{t("count", { count: announcements.length })}</span>
            }
          />
          {announcements.length === 0 ? (
            <div className="p-5">
              <EmptyState title={t("empty")} description={t("emptyHint")} />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {announcements.map((announcement) => (
                <li key={announcement.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--ink)]">{announcement.title}</h3>
                        {announcement.pinned ? (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20">
                            {t("pinned")}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                        {formatDate(announcement.created_at, locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/announcements/${announcement.id}`}
                        className={`${buttonSecondary} px-3 py-1.5 text-xs`}
                      >
                        {t("edit")}
                      </Link>
                      <DeleteAnnouncementForm locale={locale} announcementId={announcement.id} />
                    </div>
                  </div>
                  {announcement.body ? (
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--ink-soft)]">
                      {announcement.body}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
