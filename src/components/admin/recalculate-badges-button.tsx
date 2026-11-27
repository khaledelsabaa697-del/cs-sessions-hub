"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recalculateBadgesAction } from "@/actions/points";
import type { PointsConfigState } from "@/lib/types";
import { Alert, buttonSecondary } from "@/components/ui";

const initialState: PointsConfigState = { status: "idle" };

export function RecalculateBadgesButton({ locale }: { locale: string }) {
  const t = useTranslations("admin.points");
  const [state, formAction, pending] = useActionState(recalculateBadgesAction, initialState);

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <input type="hidden" name="locale" value={locale} />
        <button type="submit" disabled={pending} aria-busy={pending} className={buttonSecondary}>
          {pending ? t("recalculating") : t("recalc")}
        </button>
      </form>
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
      {state.status === "error" ? <Alert>{state.error}</Alert> : null}
    </div>
  );
}
