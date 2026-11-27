import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight, KeyRound, ShieldCheck, Trophy, UserRound } from "lucide-react";
import { Card, CardHeader, PageHeader, badgeClass } from "@/components/ui";
import { BentoTile } from "@/components/ui";
import { RankBadge } from "@/components/gamification/rank-badge";
import { XpBar } from "@/components/motion/xp-bar";
import { CountUp } from "@/components/motion/count-up";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, initials } from "@/lib/utils";
import { levelFor, rankTierFor, TIER_STYLES } from "@/lib/gamification";
import type { PointsBreakdown } from "@/lib/types";
import { ProfileForm } from "./profile-form";
import { PasswordChangeForm } from "./password-change-form";

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  const t = await getTranslations("profile");
  const tg = await getTranslations("gamification");
  const tr = await getTranslations("roles");

  let breakdown: PointsBreakdown | null = null;
  if (profile.role === "student") {
    const supabase = await createClient();
    const { data } = await supabase.rpc("my_breakdown");
    breakdown = ((data ?? [])[0] ?? null) as PointsBreakdown | null;
  }

  const points = Number(breakdown?.total_points ?? 0);
  const tier = rankTierFor(points);
  const level = levelFor(points);
  const tierStyle = TIER_STYLES[tier.key];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="profile.settings" title={t("title")} description={t("subtitle")} />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <BentoTile className="relative overflow-hidden p-6">
            <div
              className="pointer-events-none absolute -end-12 -top-12 size-52 rounded-full opacity-25 blur-2xl"
              style={{ background: tierStyle.glow }}
              aria-hidden="true"
            />
            <div className="relative flex flex-wrap items-center gap-5">
              <span className="grid size-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 font-mono text-2xl font-bold text-white ring-1 ring-inset ring-white/15">
                {initials(profile.display_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-bronze-600 dark:text-bronze-300">
                  // {tr(profile.role)}
                </p>
                <h2 className="mt-1 truncate text-2xl font-bold text-[var(--ink)]">{profile.display_name}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--ink-muted)]">
                  <span>@{profile.username}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-bronze-700 dark:text-bronze-300">{profile.student_code}</span>
                </div>
              </div>
              {profile.role === "student" ? (
                <div className="flex flex-col items-end gap-1.5">
                  <RankBadge tier={tier.key} label={tg(tier.key)} size="md" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    {tg("level", { level: level.level })}
                  </span>
                </div>
              ) : (
                <span className={badgeClass}>{tr(profile.role)}</span>
              )}
            </div>

            {profile.role === "student" ? (
              <div className="relative mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    <span>{tg("xpLabel")}</span>
                    <span>
                      {formatNumber(level.intoLevel, locale)} / {level.levelSize}
                    </span>
                  </div>
                  <XpBar progress={level.progress} label={tg("xpLabel")} />
                  <p className="mt-2 font-mono text-[10px] text-[var(--ink-muted)]">
                    {tier.pointsToNext !== null
                      ? tg("nextTier", {
                          points: formatNumber(tier.pointsToNext, locale),
                          tier: tg(rankTierFor(tier.nextMin ?? points).key),
                        })
                      : tg("maxTier")}
                  </p>
                </div>
                <div className="flex items-center gap-4 sm:border-s sm:border-[var(--line)] sm:ps-5">
                  <div>
                    <p className="caption-code">{tg("xp")}</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-[var(--ink)]">
                      <CountUp value={points} decimals={points % 1 === 0 ? 0 : 2} />
                    </p>
                  </div>
                  <Link
                    href="/leaderboard"
                    className="grid size-10 place-items-center rounded-xl bg-bronze-500/15 text-bronze-700 ring-1 ring-inset ring-bronze-400/25 transition hover:-translate-y-0.5 dark:text-bronze-300"
                    aria-label={t("leaderboard")}
                  >
                    <Trophy className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ) : null}
          </BentoTile>

          <Card>
            <CardHeader title={t("leaderboard")} description={t("displayNameHint")} eyebrow="profile.identity" />
            <ProfileForm
              locale={locale}
              fullName={profile.full_name}
              displayName={profile.display_name}
              optedOut={profile.opted_out_of_leaderboard}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t("account")} eyebrow="profile.account" />
            <dl className="divide-y divide-[var(--line)]">
              <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                <dt className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                  <UserRound className="size-3.5" aria-hidden="true" />
                  {t("username")}
                </dt>
                <dd className="font-mono text-sm text-[var(--ink)]">@{profile.username}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                <dt className="text-sm text-[var(--ink-muted)]">{t("studentCode")}</dt>
                <dd className={`${badgeClass} font-mono`}>{profile.student_code}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                <dt className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  {t("role")}
                </dt>
                <dd className="text-sm font-medium text-[var(--ink)]">{tr(profile.role)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                <dt className="text-sm text-[var(--ink-muted)]">{t("memberSince")}</dt>
                <dd className="font-mono text-xs text-[var(--ink)]">{formatDate(profile.created_at, locale)}</dd>
              </div>
            </dl>
            {profile.role === "student" ? (
              <div className="border-t border-[var(--line)] px-5 py-3">
                <Link
                  href="/progress"
                  className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)] transition hover:text-bronze-600 dark:hover:text-bronze-300"
                >
                  {t("viewProgress")}
                  <ArrowUpRight className="size-3 rtl:-scale-x-100" aria-hidden="true" />
                </Link>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title={t("changePassword")} eyebrow="profile.security" />
            <div className="p-5">
              <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                <KeyRound className="size-3.5" aria-hidden="true" />
                {t("changePasswordHint")}
              </div>
              <PasswordChangeForm locale={locale} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
