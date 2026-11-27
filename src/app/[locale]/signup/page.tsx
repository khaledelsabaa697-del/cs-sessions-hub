import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignupForm } from "./signup-form";
import { AuthShell } from "@/components/auth-shell";
import { toLocale } from "@/lib/locale";

export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "auth" });

  return (
    <AuthShell locale={locale} title={t("signUpTitle")} subtitle={t("signUpSubtitle")}>
      <SignupForm locale={locale} />
    </AuthShell>
  );
}
