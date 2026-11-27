"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { refreshGradingModelsAction, saveGradingSettingsAction } from "@/actions/grading-settings";
import type { GradingSettingsState } from "@/lib/types";
import type { CatalogModel } from "@/lib/grading/catalog-core";
import type { ModelState } from "@/lib/grading/catalog";
import { Alert, buttonPrimary, buttonSecondary, Card, CardHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initial: GradingSettingsState = { status: "idle" };

function cooldownText(state: ModelState | undefined): string {
  if (!state || state.status === "ok") return "available";
  if (state.status === "rate_limited" && state.cooldownUntil) {
    const minutes = Math.max(1, Math.ceil((state.cooldownUntil - Date.now()) / 60_000));
    return `rate-limited (~${minutes}m)`;
  }
  return state.status;
}

export function GradingSettingsForm({
  locale,
  isAdmin,
  initialMode,
  initialPreferred,
  initialAllowPaid,
  initialMaxAttempts,
  models,
  states,
  catalogUpdatedAt,
}: {
  locale: string;
  isAdmin: boolean;
  initialMode: string;
  initialPreferred: string | null;
  initialAllowPaid: boolean;
  initialMaxAttempts: number;
  models: CatalogModel[];
  states: Record<string, ModelState>;
  catalogUpdatedAt: string | null;
}) {
  const t = useTranslations("admin.grading");
  const [mode, setMode] = useState(initialMode);
  const [allowPaid, setAllowPaid] = useState(initialAllowPaid);
  const [preferred, setPreferred] = useState(initialPreferred ?? "");
  const [state, formAction, pending] = useActionState(saveGradingSettingsAction, initial);
  const [refreshState, refreshAction, refreshPending] = useActionState(refreshGradingModelsAction, initial);

  const freeModels = useMemo(
    () => models.filter((model) => model.isFree).sort((a, b) => a.id.localeCompare(b.id)),
    [models],
  );
  const paidModels = useMemo(
    () => models.filter((model) => !model.isFree).sort((a, b) => a.id.localeCompare(b.id)),
    [models],
  );

  const selectedModel = models.find((model) => model.id === preferred) ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={t("title")} description={t("subtitle")} />
        <form action={formAction} className="space-y-5 p-5">
          <input type="hidden" name="locale" value={locale} />

          <div className="space-y-2">
            <p className={labelClass}>{t("modeLabel")}</p>
            <div className="space-y-2">
              {[
                ["auto_free", t("modeAutoFree"), t("modeAutoFreeHint")],
                ["manual_free", t("modeManualFree"), t("modeManualFreeHint")],
                ["manual_paid", t("modeManualPaid"), t("modeManualPaidHint")],
              ].map(([value, label, hint]) => (
                <label key={value} className="flex items-start gap-3 rounded-xl border border-[var(--line)] p-3 ">
                  <input
                    type="radio"
                    name="mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium text-[var(--ink)]">{label}</span>
                    <span className="block text-xs text-[var(--ink-muted)]">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {isAdmin ? (
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="allow_paid"
                checked={allowPaid}
                onChange={(event) => setAllowPaid(event.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-[var(--ink)]">{t("allowPaid")}</span>
                <span className="block text-xs text-[var(--ink-muted)]">{t("allowPaidHint")}</span>
              </span>
            </label>
          ) : null}

          <div>
            <label htmlFor="preferred_model" className={labelClass}>
              {t("preferredModel")}
            </label>
            <select
              id="preferred_model"
              name="preferred_model"
              value={preferred}
              onChange={(event) => setPreferred(event.target.value)}
              className={inputClass}
            >
              <option value="">{t("none")}</option>
              <optgroup label={t("freeModels")}>
                {freeModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName} — {model.provider} — {cooldownText(states[model.id])}
                  </option>
                ))}
              </optgroup>
              {isAdmin ? (
                <optgroup label={t("paidModels")}>
                  {paidModels.map((model) => (
                    <option key={model.id} value={model.id} disabled={!allowPaid}>
                      {model.displayName} — {model.provider} — ${(model.pricingPrompt ?? 0) * 1_000_000}
                      /1M · ${(model.pricingCompletion ?? 0) * 1_000_000}
                      /1M
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("preferredModelHint")}</p>
          </div>

          <div>
            <label htmlFor="max_attempts" className={labelClass}>
              {t("maxAttempts")}
            </label>
            <input
              id="max_attempts"
              name="max_attempts"
              type="number"
              min={1}
              max={10}
              defaultValue={initialMaxAttempts}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("maxAttemptsHint")}</p>
          </div>

          {selectedModel ? (
            <div className="rounded-xl bg-[var(--glass-inset)] p-3 text-xs text-[var(--ink-soft)] ">
              <p>
                {t("selectedSummary", {
                  model: selectedModel.displayName,
                  provider: selectedModel.provider,
                  status: cooldownText(states[selectedModel.id]),
                })}
              </p>
              {selectedModel.isFree ? null : (
                <p className="mt-1 text-amber-700 dark:text-amber-300">{t("paidWarning")}</p>
              )}
            </div>
          ) : null}

          {state.status === "error" ? <Alert>{state.error}</Alert> : null}
          {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

          <SubmitButton idle={t("save")} pendingLabel={t("saving")} disabled={pending} />
        </form>
      </Card>

      <Card>
        <CardHeader title={t("catalogTitle")} description={t("catalogSubtitle")} />
        <div className="space-y-3 p-5 text-sm text-[var(--ink-soft)]">
          <p>
            {t("catalogCount", {
              total: models.length,
              free: freeModels.length,
              paid: paidModels.length,
            })}
          </p>
          <p className="text-xs text-[var(--ink-muted)]">
            {t("catalogUpdated", {
              date: catalogUpdatedAt ? new Date(catalogUpdatedAt).toLocaleString() : t("never"),
            })}
          </p>
          <form action={refreshAction}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" disabled={refreshPending} className={buttonSecondary}>
              {refreshPending ? t("refreshing") : t("refresh")}
            </button>
          </form>
          {refreshState.status === "error" ? <Alert>{refreshState.error}</Alert> : null}
          {refreshState.status === "success" ? <Alert tone="success">{refreshState.message}</Alert> : null}
        </div>
      </Card>
    </div>
  );
}
