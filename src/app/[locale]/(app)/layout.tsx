import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { AmbientBackground } from "@/components/ambient-background";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  const t = await getTranslations({ locale, namespace: "common" });

  return (
    <div className="relative flex min-h-dvh flex-col">
      <AmbientBackground />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-primary-600 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
        {t("skipToContent")}
      </a>
      <SiteHeader profile={profile} />
      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-8">
        {children}
      </main>
      <footer className="mt-auto hidden border-t border-[var(--line)] px-4 py-5 lg:block">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          <span>// cs_sessions_hub</span>
          <span dir="ltr">SFE · CS Fundamentals · C++</span>
        </div>
      </footer>
    </div>
  );
}
