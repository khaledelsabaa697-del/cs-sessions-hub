import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireHr } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { PageHeader, Card, CardHeader } from "@/components/ui";

export default async function HrOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);
  await requireHr(locale);
  const t = await getTranslations("hr");

  return (
    <div className="space-y-6">
      <PageHeader title={t("overviewTitle")} description={t("overviewSubtitle")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/hr/attendance" className="block">
          <Card className="p-5 transition hover:shadow-md">
            <CardHeader title={t("attendanceCard")} />
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("attendanceCardHint")}</p>
          </Card>
        </Link>
        <Link href="/hr/students" className="block">
          <Card className="p-5 transition hover:shadow-md">
            <CardHeader title={t("studentsCard")} />
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("studentsCardHint")}</p>
          </Card>
        </Link>
        <Link href="/hr/warnings" className="block">
          <Card className="p-5 transition hover:shadow-md">
            <CardHeader title={t("warningsCard")} />
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("warningsCardHint")}</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
