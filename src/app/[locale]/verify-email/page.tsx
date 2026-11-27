import { getTranslations, setRequestLocale } from "next-intl/server";
import { VerifyEmailForm } from "./verify-email-form";
import { AuthShell } from "@/components/auth-shell";
import { toLocale } from "@/lib/locale";

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const { email: emailParam } = await searchParams;
  const email = emailParam ?? "";

  const t = await getTranslations({ locale, namespace: "auth" });

  return (
    <AuthShell
      locale={locale}
      title={t("verifyTitle")}
      subtitle={t("verifySubtitle", { email })}
      footer={t("verifyNote")}
    >
      <VerifyEmailForm locale={locale} email={email} />
    </AuthShell>
  );
}
