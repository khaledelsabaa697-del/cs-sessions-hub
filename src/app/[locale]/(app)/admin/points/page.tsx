import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Alert, Card, CardHeader, EmptyState, PageHeader, StatCard, buttonSecondary } from "@/components/ui";
import { PointsConfigForm } from "@/components/admin/points-config-form";
import { RecalculateBadgesButton } from "@/components/admin/recalculate-badges-button";
import { ResetWeekButton } from "@/components/admin/reset-week-button";
import { requireAdmin } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, initials } from "@/lib/utils";
import type { AdminPointsRow, PointsConfig } from "@/lib/types";

export default async function AdminPointsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  await requireAdmin(locale);
  const t = await getTranslations("admin.points");
  const tp = await getTranslations("progress");

  const supabase = await createClient();
  const [overviewResult, configResult] = await Promise.all([
    supabase.rpc("admin_points_overview"),
    supabase
      .from("points_config")
      .select("homework_weight, attendance_points, on_time_bonus, streak_bonus, leaderboard_visible, weekly_reset_at")
      .eq("id", 1)
      .single<PointsConfig>(),
  ]);

  const hasError = [overviewResult.error, configResult.error].some(Boolean);
  const rows = (overviewResult.data ?? []) as AdminPointsRow[];
  const config = configResult.data;

  const points = (value: number | null | undefined) => formatNumber(Number(value ?? 0), locale, 2);

  const totals = rows.map((row) => Number(row.total_points));
  const classTotal = totals.reduce((sum, value) => sum + value, 0);
  const classAverage = rows.length > 0 ? classTotal / rows.length : 0;
  const topScore = rows.length > 0 ? Math.max(...totals) : 0;
  const hiddenCount = rows.filter((row) => row.opted_out).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <Link href="/leaderboard?period=all" className={buttonSecondary}>
            {t("openLeaderboard")}
          </Link>
        }
      />

      {hasError ? <Alert>{t("loadError")}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("statStudents")} value={formatNumber(rows.length, locale)} />
        <StatCard label={t("statAverage")} value={points(classAverage)} hint={t("statAverageHint")} />
        <StatCard label={t("statTop")} value={points(topScore)} hint={t("statTopHint")} />
        <StatCard label={t("statHidden")} value={formatNumber(hiddenCount, locale)} hint={t("statHiddenHint")} />
      </div>

      {config ? (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PointsConfigForm
              locale={locale}
              config={{
                homework_weight: Number(config.homework_weight),
                attendance_points: Number(config.attendance_points),
                on_time_bonus: Number(config.on_time_bonus),
                streak_bonus: Number(config.streak_bonus),
                leaderboard_visible: config.leaderboard_visible,
                weekly_reset_at: config.weekly_reset_at,
              }}
              weeklyResetLabel={formatDateTimeSafe(config.weekly_reset_at, locale)}
            />
          </div>

          <Card>
            <CardHeader title={t("maintenanceTitle")} description={t("maintenanceSubtitle")} />
            <div className="space-y-5 p-5">
              <div>
                <p className="text-sm font-medium text-[var(--ink)]">{t("resetWeekTitle")}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("resetWeekHint")}</p>
                <div className="mt-3">
                  <ResetWeekButton locale={locale} />
                </div>
              </div>

              <div className="border-t border-[var(--line)] pt-5 ">
                <p className="text-sm font-medium text-[var(--ink)]">{t("recalcTitle")}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("recalcHint")}</p>
                <div className="mt-3">
                  <RecalculateBadgesButton locale={locale} />
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader title={t("tableTitle")} description={t("tableSubtitle")} />
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("tableEmpty")} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--ink-muted)] ">
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    {t("colStudent")}
                  </th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">
                    {t("colTotal")}
                  </th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">
                    {t("colWeekly")}
                  </th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">
                    {tp("components.homework")}
                  </th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">
                    {tp("components.attendance")}
                  </th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">
                    {tp("components.onTime")}
                  </th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">
                    {tp("components.streak")}
                  </th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">
                    {t("colBadges")}
                  </th>
                  <th scope="col" className="px-5 py-3 text-end font-medium">
                    {t("colVisibility")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map((row) => (
                  <tr key={row.student_id} className="transition hover:bg-[var(--glass-inset)] ">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                          {initials(row.full_name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--ink)]">{row.full_name}</p>
                          <p className="truncate text-xs text-[var(--ink-muted)]">
                            @{row.username} · <span className="font-mono">{row.student_code}</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-end font-semibold tabular-nums text-[var(--ink)]">
                      {points(row.total_points)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-end tabular-nums text-[var(--ink-soft)]">
                      {points(row.weekly_points)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-end tabular-nums text-[var(--ink-soft)]">
                      {points(row.homework_points)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-end tabular-nums text-[var(--ink-soft)]">
                      {points(row.attendance_points)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-end tabular-nums text-[var(--ink-soft)]">
                      {points(row.on_time_points)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-end tabular-nums text-[var(--ink-soft)]">
                      {points(row.streak_points)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-end tabular-nums text-[var(--ink-soft)]">
                      {formatNumber(Number(row.badge_count), locale)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-end">
                      <span
                        className={
                          row.opted_out
                            ? "rounded-full bg-[var(--glass-inset)] px-2.5 py-1 text-xs font-medium text-[var(--ink-soft)] "
                            : "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                        }
                      >
                        {row.opted_out ? t("visibilityHidden") : t("visibilityVisible")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function formatDateTimeSafe(value: string, locale: string): string {
  return formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
}
