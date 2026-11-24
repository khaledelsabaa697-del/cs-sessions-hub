"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { Profile } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/actions/auth";

type NavItem = { href: string; label: string; exact?: boolean };

export function SiteHeader({ profile }: { profile: Profile }) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const tr = useTranslations("roles");

  const isTeacherOrAdmin = profile.role === "teacher" || profile.role === "admin";
  const isAdmin = profile.role === "admin";
  const home = isTeacherOrAdmin ? "/admin" : "/dashboard";

  const links: NavItem[] = isTeacherOrAdmin
    ? [
        { href: "/admin", label: t("overview"), exact: true },
        { href: "/admin/sessions", label: t("sessions") },
        { href: "/admin/assignments", label: t("assignments") },
        { href: "/admin/attendance", label: t("attendance") },
        // Students and points are admin-only pages; hide them for teachers so
        // the nav never sends them to a redirect.
        ...(isAdmin
          ? [
              { href: "/admin/students", label: t("students") },
              { href: "/admin/analytics", label: t("analytics") },
              { href: "/admin/points", label: t("points") },
            ]
          : [{ href: "/admin/analytics", label: t("analytics") }]),
        { href: "/admin/announcements", label: t("announcements") },
      ]
    : [
        { href: "/dashboard", label: t("dashboard"), exact: true },
        { href: "/check-in", label: t("checkIn") },
        { href: "/sessions", label: t("sessions") },
        { href: "/assignments", label: t("assignments") },
        { href: "/attendance", label: t("attendance") },
        { href: "/progress", label: t("progress") },
        { href: "/leaderboard", label: t("leaderboard") },
      ];

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link
          href={home}
          aria-label={tc("appName")}
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          <BrandMark className="size-9" />
          <span className="hidden text-sm font-semibold tracking-tight text-slate-900 sm:block dark:text-white">
            {tc("appName")}
          </span>
        </Link>

        <nav className="ms-2 hidden items-center gap-1 lg:flex" aria-label={tc("appName")}>
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive(item)
                  ? "bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
              )}
              aria-current={isActive(item) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-0.5 sm:gap-1">
          <LocaleSwitcher />
          <ThemeToggle />

          <details className="group relative">
            <summary
              aria-haspopup="menu"
              aria-label={t("accountMenu")}
              className="flex cursor-pointer list-none items-center gap-2 rounded-full p-1 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden"
            >
              <span className="grid size-8 place-items-center rounded-full bg-linear-to-br from-primary-500 to-primary-600 text-[11px] font-bold text-white">
                {initials(profile.display_name)}
              </span>
              <span className="hidden min-w-0 pe-1 text-start sm:block">
                <span className="block max-w-32 truncate text-xs font-semibold text-slate-900 dark:text-white">
                  {profile.display_name}
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  {tr(profile.role)}
                </span>
              </span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="hidden size-3.5 text-slate-400 sm:block"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>

            <div className="absolute end-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-3 pb-2 pt-1.5 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t("signedInAs")}
                </p>
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  @{profile.username}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {profile.student_code}
                </p>
              </div>
              <Link
                href="/profile"
                className="mt-1 block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t("profile")}
              </Link>
              <form action={logoutAction}>
                <input type="hidden" name="locale" value={locale} />
                <button
                  type="submit"
                  className="w-full rounded-lg px-3 py-2 text-start text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                >
                  {t("signOut")}
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>

      <nav
        className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 px-3 py-1.5 lg:hidden dark:border-slate-800"
        aria-label={tc("appName")}
      >
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition",
              isActive(item)
                ? "bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
            aria-current={isActive(item) ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
