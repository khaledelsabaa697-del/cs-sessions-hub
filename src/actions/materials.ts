"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation";
import type { MaterialState } from "@/lib/types";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

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
  const allowedTypes = ["text", "file", "image", "video", "notebook", "code"];
  if (!allowedTypes.includes(type)) {
    return { status: "error", error: t("errors.invalid") };
  }

  const supabase = await createClient();
  const content = String(formData.get("content") ?? "").trim() || null;
  const language = String(formData.get("language") ?? "").trim() || null;

  let filePath: string | null = null;
  let mimeType: string | null = null;

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) {
      return { status: "error", error: t("errors.fileSize") };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    filePath = `${sessionId.data}/${Date.now()}-${crypto
      .randomUUID()
      .slice(0, 8)}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    mimeType = file.type || null;

    const { error: uploadError } = await supabase.storage
      .from("session-materials")
      .upload(filePath, bytes, {
        contentType: mimeType || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("addMaterial upload failed:", uploadError.message);
      return { status: "error", error: t("errors.uploadFailed") };
    }
  }

  if (type === "text" || type === "code") {
    if (!content) {
      return { status: "error", error: t("errors.invalid") };
    }
  } else if (!filePath) {
    return { status: "error", error: t("errors.fileMissing") };
  }

  const { error: insertError } = await supabase.from("session_materials").insert({
    session_id: sessionId.data,
    type,
    title,
    content,
    file_path: filePath,
    mime_type: mimeType,
    language,
    created_by: profile.id,
  });

  if (insertError) {
    console.error("addMaterial insert failed:", insertError.message);
    if (filePath) {
      await supabase.storage.from("session-materials").remove([filePath]);
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
    await supabase.storage.from("session-materials").remove([filePath]);
  }
  if (sessionId) {
    revalidatePath(`/${locale}/admin/sessions/${sessionId}`);
    revalidatePath(`/${locale}/sessions`);
  }
}
