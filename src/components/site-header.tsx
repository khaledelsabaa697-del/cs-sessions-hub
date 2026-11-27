"use client";

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BellRing,
  BrainCircuit,
  CalendarDays,
  ChevronDown,
  FileCode2,
  Gauge,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Star,
  TrendingUp,
  TriangleAlert,
  Trophy,
  UserCheck,
  Users,
  UserRound,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { Profile } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/actions/auth";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

export function SiteHeader({ profile }: { profile: Profile }) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const tr = useTranslations("roles");

  const isTeacherOrAdmin = profile.role === "teacher" || profile.role === "admin";
  const isHr = profile.role === "hr";
  const isAdmin = profile.role === "admin";
  const home = isTeacherOrAdmin ? "/admin" : isHr ? "/hr" : "/dashboard";

  const links: NavItem[] = isHr
    ? [
        { href: "/hr", label: t("overview"), icon: Gauge, exact: true },
        { href: "/hr/attendance", label: t("attendance"), icon: UserCheck },
        { href: "/hr/students", label: t("students"), icon: Users },
        { href: "/hr/warnings", label: t("warnings"), icon: TriangleAlert },
        { href: "/hr/announcements", label: t("announcements"), icon: Megaphone },
      ]
    : isTeacherOrAdmin
      ? [
          { href: "/admin", label: t("overview"), icon: Gauge, exact: true },
          { href: "/admin/sessions", label: t("sessions"), icon: CalendarDays },
          { href: "/admin/assignments", label: t("assignments"), icon: FileCode2 },
          { href: "/admin/attendance", label: t("attendance"), icon: UserCheck },
          ...(isAdmin
            ? [
                { href: "/admin/students", label: t("students"), icon: Users },
                { href: "/admin/analytics", label: t("analytics"), icon: BarChart3 },
                { href: "/admin/points", label: t("points"), icon: Star },
              ]
            : [{ href: "/admin/analytics", label: t("analytics"), icon: BarChart3 }]),
          { href: "/admin/grading", label: t("grading"), icon: BrainCircuit },
          { href: "/admin/announcements", label: t("announcements"), icon: BellRing },
        ]
      : [
          { href: "/dashboard", label: t("dashboard"), icon: LayoutDashboard, exact: true },
          { href: "/sessions", label: t("sessions"), icon: CalendarDays },
          { href: "/assignments", label: t("assignments"), icon: FileCode2 },
          { href: "/attendance", label: t("attendance"), icon: UserCheck },
          { href: "/progress", label: t("progress"), icon: TrendingUp },
          { href: "/leaderboard", label: t("leaderboard"), icon: Trophy },
        ];

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--bg)_78%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <Link
            href={home}
            aria-label={tc("appName")}
            className="group flex items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze-400"
          >
            <span className="relative grid size-10 place-items-center overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--glass)] shadow-inner transition group-hover:border-bronze-400/50">
              <BrandMark className="size-8" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-bronze-600 dark:text-bronze-300">
                // SFE
              </span>
              <span className="block truncate text-sm font-semibold tracking-tight text-[var(--ink)]">
                {tc("appName")}
              </span>
            </span>
          </Link>

          <nav className="ms-3 hidden items-center gap-0.5 xl:flex" aria-label={tc("appName")}>
            {links.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                    active
                      ? "bg-bronze-500/12 text-bronze-700 ring-1 ring-inset ring-bronze-400/25 dark:text-bronze-200"
                      : "text-[var(--ink-soft)] hover:bg-[var(--glass-inset)] hover:text-[var(--ink)]",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "size-3.5 transition",
                      active
                        ? "text-bronze-600 dark:text-bronze-300"
                        : "text-[var(--ink-muted)] group-hover:text-[var(--ink-soft)]",
                    )}
                    aria-hidden="true"
                  />
                  {item.label}
                  {active ? (
                    <span className="absolute inset-x-2 -bottom-px h-px bg-gradient-to-r from-transparent via-bronze-400 to-transparent" />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-0.5 sm:gap-1">
            <LocaleSwitcher />
            <ThemeToggle />

            <details className="group relative">
              <summary
                aria-haspopup="menu"
                aria-label={t("accountMenu")}
                className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-transparent p-1 transition hover:border-[var(--line)] hover:bg-[var(--glass-inset)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze-400 [&::-webkit-details-marker]:hidden"
              >
                <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-bronze-500 to-bronze-700 font-mono text-[10px] font-bold text-white ring-1 ring-inset ring-white/20">
                  {initials(profile.display_name)}
                </span>
                <span className="hidden min-w-0 pe-1 text-start sm:block">
                  <span className="block max-w-32 truncate text-xs font-semibold text-[var(--ink)]">
                    {profile.display_name}
                  </span>
                  <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    {tr(profile.role)}
                  </span>
                </span>
                <ChevronDown
                  className="hidden size-3.5 text-[var(--ink-muted)] transition group-open:rotate-180 sm:block"
                  aria-hidden="true"
                />
              </summary>

              <div className="glass-card absolute end-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl p-1.5">
                <div className="border-b border-[var(--line)] px-3 pb-2.5 pt-1.5">
                  <p className="caption-code">{t("signedInAs")}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-[var(--ink)]">{profile.display_name}</p>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-[var(--ink-muted)]">
                    <span className="truncate">@{profile.username}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-bronze-600 dark:text-bronze-300">{profile.student_code}</span>
                  </div>
                </div>
                <Link
                  href="/profile"
                  className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--ink-soft)] transition hover:bg-[var(--glass-inset)] hover:text-[var(--ink)]"
                >
                  <UserRound className="size-4" aria-hidden="true" />
                  {t("profile")}
                </Link>
                <form action={logoutAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm font-medium text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-300"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    {t("signOut")}
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>

      {/* Mobile: bottom navigation, styled like a dock. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[color-mix(in_oklab,var(--bg)_86%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        aria-label={tc("appName")}
      >
        <div className="flex items-stretch gap-0.5 overflow-x-auto px-2 py-1.5">
          {links.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex min-w-14 shrink-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[9px] font-medium transition",
                  active ? "text-bronze-700 dark:text-bronze-200" : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                )}
                aria-current={active ? "page" : undefined}
              >
                {active ? (
                  <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gradient-to-r from-transparent via-bronze-400 to-transparent" />
                ) : null}
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-lg transition",
                    active ? "bg-bronze-500/15 ring-1 ring-inset ring-bronze-400/25" : "",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="max-w-16 truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
