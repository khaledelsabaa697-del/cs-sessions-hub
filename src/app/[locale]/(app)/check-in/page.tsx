import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { CheckInForm } from "./check-in-form";

type ActiveSessionRow = {
  title: string;
  code_expires_at: string | null;
};

export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  if (profile.role !== "student") redirect(`/${locale}/admin`);

  const t = await getTranslations("checkIn");
  const { code: codeParam } = await searchParams;
  const defaultCode = Array.isArray(codeParam) ? codeParam[0] : codeParam;

  const supabase = await createClient();
  const { data: activeSession } = await supabase
    .from("sessions")
    .select("title, code_expires_at")
    .gt("code_expires_at", new Date().toISOString())
    .order("code_expires_at", { ascending: true })
    .limit(1)
    .maybeSingle()
    .returns<ActiveSessionRow | null>();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      {activeSession ? (
        <Alert tone="info">
          <span className="font-semibold">{t("openTitle")}</span>{" "}
          {activeSession.code_expires_at
            ? t("openBody", {
                time: formatDate(activeSession.code_expires_at, locale, {
                  timeStyle: "short",
                }),
              })
            : null}
        </Alert>
      ) : (
        <Alert tone="info">{t("noOpen")}</Alert>
      )}

      <Card>
        <CardHeader title={t("title")} description={t("subtitle")} />
        <div className="p-5">
          <CheckInForm locale={locale} defaultCode={defaultCode} />
        </div>
      </Card>

      <Card>
        <CardHeader title={t("howTitle")} />
        <p className="p-5 text-sm text-slate-600 dark:text-slate-300">
          {t("howBody")}
        </p>
      </Card>
    </div>
  );
}
