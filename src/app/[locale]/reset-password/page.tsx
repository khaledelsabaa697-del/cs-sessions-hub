import { getTranslations, setRequestLocale } from "next-intl/server";
import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { toLocale } from "@/lib/locale";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const { code } = await searchParams;
  const t = await getTranslations({ locale, namespace: "auth" });
  const tc = await getTranslations({ locale, namespace: "common" });

  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-primary-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-accent-500/20 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <BrandMark className="size-12" />
          <span className="text-sm font-semibold tracking-tight">{tc("appName")}</span>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-semibold tracking-tight text-balance">
            {t("brandTitle")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-300">{t("brandSubtitle")}</p>
        </div>

        <p dir="ltr" className="relative z-10 text-end text-xs text-slate-500">
          CS Fundamentals · C++
        </p>
      </aside>

      <section className="flex min-h-dvh flex-col">
        <div className="flex items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5 lg:invisible">
            <BrandMark className="size-8" />
            <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
              {tc("appName")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
          <div className="w-full max-w-sm animate-rise">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              {t("resetPasswordTitle")}
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {t("resetPasswordSubtitle")}
            </p>

            <ResetPasswordForm locale={locale} code={code ?? ""} />
          </div>
        </div>
      </section>
    </main>
  );
}
