"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { iconButtonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({ showLabel = true }: { showLabel?: boolean }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");
  const [pending, startTransition] = useTransition();

  const nextLocale: AppLocale = locale === "ar" ? "en" : "ar";
  const label = locale === "ar" ? t("switchToEnglish") : t("switchToArabic");

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(() => router.replace(pathname, { locale: nextLocale }));
      }}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-[var(--ink-soft)] transition hover:bg-[var(--glass-inset)] hover:text-[var(--ink)] disabled:opacity-60",
        !showLabel && iconButtonClass,
      )}
      aria-label={t("language")}
      title={t("language")}
      lang={nextLocale}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="size-4"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3.6 9h16.8M3.6 15h16.8" />
        <path d="M12 3c2.2 2.4 3.3 5.4 3.3 9s-1.1 6.6-3.3 9c-2.2-2.4-3.3-5.4-3.3-9S9.8 5.4 12 3Z" />
      </svg>
      <span className={showLabel ? "hidden sm:inline" : "sr-only"}>{label}</span>
    </button>
  );
}
