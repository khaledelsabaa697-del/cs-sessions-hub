import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireHr } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { AnnouncementList } from "@/components/announcement-list";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import type { Announcement } from "@/lib/types";

export default async function HrAnnouncementsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireHr(locale);
  const t = await getTranslations("admin.announcements");

  // The SELECT policy on announcements is `using (true)` for authenticated
  // users, so HR can read them without any write access.
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
        <AnnouncementList
          announcements={announcements}
          locale={locale}
          pinnedLabel={t("pinned")}
          emptyTitle={t("empty")}
          hrefBase="/hr/announcements"
        />
      </Card>
    </div>
  );
}
