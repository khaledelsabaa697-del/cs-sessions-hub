"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { MATERIAL_BUCKET, sanitizeMaterialFileName } from "@/lib/materials";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation";
import type { MaterialState } from "@/lib/types";

const ALLOWED_TYPES = ["text", "file", "image", "video", "notebook", "code"];

export type MaterialUploadUrlResult =
  | { status: "ok"; path: string }
  | { status: "error"; error: string };

/**
 * Creates a short-lived signed upload URL so the browser can send large files
 * straight to Supabase Storage. Server Actions are capped by Next.js
 * (2 MB here) and by Vercel (~4.5 MB), so routing file bytes through an action
 * makes normal PDF/PPTX uploads fail with a 413.
 */
export async function createMaterialUploadUrlAction(
  sessionId: string,
  fileName: string,
): Promise<MaterialUploadUrlResult> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "teacher")) {
    return { status: "error", error: "forbidden" };
  }

  const parsed = idSchema.safeParse(sessionId);
  if (!parsed.success) {
    return { status: "error", error: "invalid" };
  }

  // Path only — the browser uploads the bytes directly with supabase.storage.upload(),
  // which uses the standard multipart endpoint and returns a proper response.
  // (Signed-URL PUTs were observed to land the file but never return a response
  //  for larger payloads, leaving the form stuck on "Saving…".)
  const path = `${parsed.data}/${Date.now()}-${crypto
    .randomUUID()
    .slice(0, 8)}-${sanitizeMaterialFileName(fileName)}`;

  return { status: "ok", path };
}

export async function addMaterialAction(
  _previous: MaterialState,
  formData: FormData,
): Promise<MaterialState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.session" });

  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "teacher")) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const sessionId = idSchema.safeParse(formData.get("session_id"));
  if (!sessionId.success) {
    return { status: "error", error: t("errors.invalid") };
  }

  const type = String(formData.get("type") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return { status: "error", error: t("errors.invalid") };
  }
  if (!ALLOWED_TYPES.includes(type)) {
    return { status: "error", error: t("errors.invalid") };
  }

  const content = String(formData.get("content") ?? "").trim() || null;
  const language = String(formData.get("language") ?? "").trim() || null;
  const mimeType = String(formData.get("mime_type") ?? "").trim() || null;

  const uploadPath = String(formData.get("file_path") ?? "").trim();
  const filePath =
    uploadPath.startsWith(`${sessionId.data}/`) && !uploadPath.includes("..")
      ? uploadPath
      : null;

  if (type === "text" || type === "code") {
    if (!content) {
      return { status: "error", error: t("errors.invalid") };
    }
  } else if (!filePath) {
    return { status: "error", error: t("errors.fileMissing") };
  }

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("session_materials").insert({
    session_id: sessionId.data,
    type,
    title,
    content: type === "text" || type === "code" ? content : null,
    file_path: type === "text" || type === "code" ? null : filePath,
    mime_type: type === "text" || type === "code" ? null : mimeType,
    language,
    created_by: profile.id,
  });

  if (insertError) {
    console.error("addMaterial insert failed:", insertError.message);
    if (filePath) {
      await supabase.storage.from(MATERIAL_BUCKET).remove([filePath]);
    }
    return { status: "error", error: t("errors.saveFailed") };
  }

  revalidatePath(`/${locale}/admin/sessions/${sessionId.data}`);
  revalidatePath(`/${locale}/sessions`);
  return { status: "success", message: t("materialAdded") };
}

export async function deleteMaterialAction(formData: FormData): Promise<void> {
  const locale = toLocale(formData.get("locale"));
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const materialId = String(formData.get("material_id") ?? "").trim();
  const filePath = String(formData.get("file_path") ?? "").trim() || null;

  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "teacher")) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("session_materials").delete().eq("id", materialId);
  if (filePath) {
    await supabase.storage.from(MATERIAL_BUCKET).remove([filePath]);
  }
  if (sessionId) {
    revalidatePath(`/${locale}/admin/sessions/${sessionId}`);
    revalidatePath(`/${locale}/sessions`);
  }
}
