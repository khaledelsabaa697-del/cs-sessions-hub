import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { logoutAction } from "@/actions/auth";
import { LoginForm } from "./login-form";
import { AuthShell } from "@/components/auth-shell";
import { Alert, buttonSecondary } from "@/components/ui";
import { getCurrentProfile, getCurrentUser, homePath } from "@/lib/auth";
import { safeRedirectPath, toLocale } from "@/lib/locale";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const t = await getTranslations("auth");
  const tn = await getTranslations("nav");

  const user = await getCurrentUser();
  const profile = user ? await getCurrentProfile() : null;
  if (profile) redirect(homePath(locale, profile.role));

  const query = await searchParams;
  const safeNext = safeRedirectPath(query.next, locale) ?? undefined;

  return (
    <AuthShell locale={locale} title={t("signInTitle")} subtitle={t("signInSubtitle")}>
      {user && !profile ? (
        <div className="mt-8 space-y-4">
          <Alert>{t("accountIncomplete")}</Alert>
          <form action={logoutAction} className="space-y-3">
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className={`${buttonSecondary} w-full`}>
              {tn("signOut")}
            </button>
          </form>
        </div>
      ) : (
        <LoginForm locale={locale} next={safeNext} />
      )}
    </AuthShell>
  );
}
