import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireHr } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import type { Announcement } from "@/lib/types";

export default async function HrAnnouncementDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireHr(locale);
  const t = await getTranslations("admin.announcements");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, pinned, created_at, updated_at")
    .eq("id", id)
    .maybeSingle()
    .returns<Announcement | null>();

  if (error || !data) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/hr/announcements" className="text-sm font-medium text-primary-600 hover:text-primary-500">
          ← {t("title")}
        </Link>
      </div>
      <PageHeader title={data.title} />
      <Card className="p-5">
        <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--ink-soft)]">{data.body}</p>
        <p className="mt-4 text-xs text-[var(--ink-muted)]">
          {formatDate(data.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </Card>
    </div>
  );
}
