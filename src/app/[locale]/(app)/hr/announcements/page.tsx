import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireHr } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import type { Announcement } from "@/lib/types";

export default async function HrAnnouncementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireHr(locale);
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
      {error ? <div className="text-sm text-red-600">{error.message}</div> : null}
      <Card>
        <CardHeader title={t("listTitle")} />
        {announcements.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("empty")} description={t("emptyHint")} />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {announcements.map((a) => (
              <li key={a.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{a.title}</h3>
                  <span className="text-xs text-slate-400">{formatDate(a.created_at, locale)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {a.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
