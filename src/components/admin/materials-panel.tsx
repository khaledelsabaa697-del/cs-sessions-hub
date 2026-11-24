"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { addMaterialAction, deleteMaterialAction } from "@/actions/materials";
import type { MaterialState } from "@/lib/types";
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  buttonSecondary,
  inputClass,
  labelClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initialState: MaterialState = { status: "idle" };

type MaterialRow = {
  id: string;
  type: string;
  title: string;
  content: string | null;
  file_path: string | null;
  language: string | null;
};

const TYPES = ["text", "file", "image", "video", "notebook", "code"] as const;

export function MaterialsPanel({
  locale,
  sessionId,
  materials,
}: {
  locale: string;
  sessionId: string;
  materials: MaterialRow[];
}) {
  const t = useTranslations("admin.session");
  const [state, formAction] = useActionState(addMaterialAction, initialState);
  const [type, setType] = useState<string>("text");

  const needsFile = type !== "text" && type !== "code";
  const needsContent = type === "text" || type === "code";
  const needsLanguage = type === "code" || type === "notebook";

  return (
    <Card>
      <CardHeader title={t("materialsTitle")} description={t("materialsSubtitle")} />

      <div className="space-y-6 p-5">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="session_id" value={sessionId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="material_type" className={labelClass}>
                {t("materialType")}
              </label>
              <select
                id="material_type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={inputClass}
              >
                {TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="material_title" className={labelClass}>
                {t("materialTitle")}
              </label>
              <input
                id="material_title"
                name="title"
                type="text"
                required
                maxLength={120}
                className={inputClass}
              />
            </div>
          </div>

          {needsContent ? (
            <div>
              <label htmlFor="material_content" className={labelClass}>
                {t("materialContent")}
              </label>
              <textarea
                id="material_content"
                name="content"
                rows={6}
                className={inputClass}
              />
            </div>
          ) : null}

          {needsLanguage ? (
            <div>
              <label htmlFor="material_language" className={labelClass}>
                {t("materialLanguage")}
              </label>
              <input
                id="material_language"
                name="language"
                type="text"
                placeholder="python, cpp, …"
                className={inputClass}
              />
            </div>
          ) : null}

          {needsFile ? (
            <div>
              <label htmlFor="material_file" className={labelClass}>
                {t("materialFile")}
              </label>
              <input
                id="material_file"
                name="file"
                type="file"
                required
                className={inputClass}
              />
            </div>
          ) : null}

          {state.status === "error" ? <Alert>{state.error}</Alert> : null}
          {state.status === "success" ? (
            <Alert tone="success">{state.message}</Alert>
          ) : null}

          <SubmitButton idle={t("addMaterial")} pendingLabel={t("savingDetails")} />
        </form>

        <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
          {materials.length === 0 ? (
            <EmptyState title={t("noMaterials")} />
          ) : (
            <ul className="space-y-2">
              {materials.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-white">
                      {m.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {m.type}
                      {m.language ? ` · ${m.language}` : ""}
                    </p>
                  </div>
                  <form action={deleteMaterialAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="session_id" value={sessionId} />
                    <input type="hidden" name="material_id" value={m.id} />
                    <input type="hidden" name="file_path" value={m.file_path ?? ""} />
                    <button
                      type="submit"
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      {t("deleteMaterial")}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
