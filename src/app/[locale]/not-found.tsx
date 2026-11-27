import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonPrimary } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations("common");

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="glass-card w-full max-w-md rounded-2xl p-8 text-center">
        <p className="font-mono text-5xl font-bold tracking-tight text-[var(--ink-muted)]">404</p>
        <h1 className="mt-3 text-lg font-semibold text-[var(--ink)]">{t("notFoundTitle")}</h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">{t("notFoundBody")}</p>
        <Link href="/" className={`${buttonPrimary} mt-6 w-full`}>
          {t("backHome")}
        </Link>
      </div>
    </main>
  );
}
