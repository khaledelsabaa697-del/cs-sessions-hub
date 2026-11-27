"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { addMaterialAction, createMaterialUploadUrlAction, deleteMaterialAction } from "@/actions/materials";
import { MATERIAL_BUCKET, MAX_MATERIAL_FILE_BYTES } from "@/lib/materials";
import { createClient } from "@/lib/supabase/client";
import type { MaterialState } from "@/lib/types";
import { Alert, Card, CardHeader, EmptyState, buttonSecondary, inputClass, labelClass } from "@/components/ui";
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
  const [state, formAction] = useActionState(submitMaterial, initialState);
  const [type, setType] = useState<string>("text");

  const needsFile = type !== "text" && type !== "code";
  const needsContent = type === "text" || type === "code";
  const needsLanguage = type === "code" || type === "notebook";

  async function submitMaterial(previous: MaterialState, formData: FormData): Promise<MaterialState> {
    const selectedType = String(formData.get("type") ?? "");
    const file = formData.get("file");

    if (selectedType !== "text" && selectedType !== "code" && file instanceof File && file.size > 0) {
      if (file.size > MAX_MATERIAL_FILE_BYTES) {
        return { status: "error", error: t("errors.fileSize") };
      }

      const upload = await createMaterialUploadUrlAction(sessionId, file.name);
      if (upload.status !== "ok") {
        return {
          status: "error",
          error: t(upload.error === "forbidden" ? "errors.forbidden" : "errors.invalid"),
        };
      }

      // Upload via the standard multipart endpoint, which returns a proper
      // response (signed-URL PUTs were observed to land the file but never
      // return a response for larger payloads, leaving the form stuck).
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from(MATERIAL_BUCKET).upload(upload.path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

      if (uploadError) {
        console.error("material upload failed:", {
          message: uploadError.message,
          name: uploadError.name,
          path: upload.path,
        });
        return { status: "error", error: t("errors.uploadFailed") };
      }

      formData.set("file_path", upload.path);
      formData.set("mime_type", file.type || "");
      formData.delete("file");
    }

    return addMaterialAction(previous, formData);
  }

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
              <input id="material_title" name="title" type="text" required maxLength={120} className={inputClass} />
            </div>
          </div>

          {needsContent ? (
            <div>
              <label htmlFor="material_content" className={labelClass}>
                {t("materialContent")}
              </label>
              <textarea id="material_content" name="content" rows={6} className={inputClass} />
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
              <input id="material_file" name="file" type="file" required className={inputClass} />
            </div>
          ) : null}

          {state.status === "error" ? <Alert>{state.error}</Alert> : null}
          {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

          <SubmitButton idle={t("addMaterial")} pendingLabel={t("savingDetails")} />
        </form>

        <div className="border-t border-[var(--line)] pt-4 ">
          {materials.length === 0 ? (
            <EmptyState title={t("noMaterials")} />
          ) : (
            <ul className="space-y-2">
              {materials.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3 "
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--ink)]">{m.title}</p>
                    <p className="text-xs text-[var(--ink-muted)]">
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
