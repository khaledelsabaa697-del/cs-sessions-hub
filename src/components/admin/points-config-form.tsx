"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updatePointsConfigAction } from "@/actions/points";
import type { PointsConfigState } from "@/lib/types";
import { Alert, Card, CardHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: PointsConfigState = { status: "idle" };

export type PointsConfigValues = {
  homework_weight: number;
  attendance_points: number;
  on_time_bonus: number;
  streak_bonus: number;
  leaderboard_visible: boolean;
  weekly_reset_at: string;
};

export function PointsConfigForm({
  locale,
  config,
  weeklyResetLabel,
}: {
  locale: string;
  config: PointsConfigValues;
  weeklyResetLabel: string;
}) {
  const t = useTranslations("admin.points");
  const [state, formAction] = useActionState(updatePointsConfigAction, initialState);

  return (
    <Card>
      <CardHeader title={t("configTitle")} description={t("configSubtitle")} />
      <form action={formAction} className="space-y-5 p-5">
        <input type="hidden" name="locale" value={locale} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="homework_weight" className={labelClass}>
              {t("homeworkWeight")}
            </label>
            <input
              id="homework_weight"
              name="homework_weight"
              type="number"
              min={0}
              max={10}
              step="0.25"
              required
              defaultValue={config.homework_weight}
              className={inputClass}
              dir="ltr"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("homeworkWeightHint")}</p>
          </div>

          <div>
            <label htmlFor="attendance_points" className={labelClass}>
              {t("attendancePoints")}
            </label>
            <input
              id="attendance_points"
              name="attendance_points"
              type="number"
              min={0}
              max={1000}
              step="1"
              required
              defaultValue={config.attendance_points}
              className={inputClass}
              dir="ltr"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("attendancePointsHint")}</p>
          </div>

          <div>
            <label htmlFor="on_time_bonus" className={labelClass}>
              {t("onTimeBonus")}
            </label>
            <input
              id="on_time_bonus"
              name="on_time_bonus"
              type="number"
              min={0}
              max={1000}
              step="1"
              required
              defaultValue={config.on_time_bonus}
              className={inputClass}
              dir="ltr"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("onTimeBonusHint")}</p>
          </div>

          <div>
            <label htmlFor="streak_bonus" className={labelClass}>
              {t("streakBonus")}
            </label>
            <input
              id="streak_bonus"
              name="streak_bonus"
              type="number"
              min={0}
              max={1000}
              step="1"
              required
              defaultValue={config.streak_bonus}
              className={inputClass}
              dir="ltr"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("streakBonusHint")}</p>
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] p-3 text-sm ">
          <input
            type="checkbox"
            name="leaderboard_visible"
            defaultChecked={config.leaderboard_visible}
            className="mt-0.5 size-4 rounded border-[var(--line-strong)] text-primary-600 focus:ring-primary-500 "
          />
          <span>
            <span className="block font-medium text-[var(--ink)] ">{t("leaderboardVisible")}</span>
            <span className="block text-xs text-[var(--ink-muted)]">{t("leaderboardVisibleHint")}</span>
          </span>
        </label>

        {state.status === "error" ? <Alert>{state.error}</Alert> : null}
        {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--ink-muted)]">{t("weekStarted", { date: weeklyResetLabel })}</p>
          <SubmitButton idle={t("save")} pendingLabel={t("saving")} />
        </div>
      </form>
    </Card>
  );
}
