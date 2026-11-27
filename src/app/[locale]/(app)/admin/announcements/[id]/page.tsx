import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AnnouncementForm } from "@/components/admin/announcement-form";
import { DeleteAnnouncementForm } from "@/components/admin/delete-announcement-form";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation";
import type { Announcement } from "@/lib/types";

export default async function EditAnnouncementPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireStaff(locale);
  const t = await getTranslations("admin.announcements");

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, pinned, created_at, updated_at")
    .eq("id", parsedId.data)
    .maybeSingle()
    .returns<Announcement | null>();

  if (!data) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/announcements"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-soft)] transition hover:text-[var(--ink)] dark:hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 rtl:-scale-x-100"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          {t("back")}
        </Link>
      </div>

      <PageHeader title={t("editTitle")} description={t("editSubtitle")} />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AnnouncementForm
            locale={locale}
            mode="edit"
            announcement={{
              id: data.id,
              title: data.title,
              body: data.body,
              pinned: data.pinned,
            }}
          />
        </div>

        <Card>
          <CardHeader title={t("dangerTitle")} description={t("dangerSubtitle")} />
          <div className="p-5">
            <DeleteAnnouncementForm locale={locale} announcementId={data.id} />
          </div>
        </Card>
      </div>
    </div>
  );
}
