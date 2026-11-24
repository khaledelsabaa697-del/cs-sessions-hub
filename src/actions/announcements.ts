"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { announcementSchema, idSchema } from "@/lib/validation";
import type { AnnouncementFormState } from "@/lib/types";

async function isCurrentUserStaff(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === "admin" || profile?.role === "teacher";
}

function revalidateAnnouncements(locale: string) {
  revalidatePath(`/${locale}/admin/announcements`);
  revalidatePath(`/${locale}/admin`);
  revalidatePath(`/${locale}/dashboard`);
}

function parseAnnouncement(formData: FormData) {
  return announcementSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    pinned: formData.get("pinned") === "on",
  });
}

export async function createAnnouncementAction(
  _previous: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.announcements" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const parsed = parseAnnouncement(formData);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0];
    return {
      status: "error",
      error: t(field === "title" ? "errors.title" : field === "body" ? "errors.body" : "errors.invalid"),
    };
  }

  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({
    title: parsed.data.title,
    body: parsed.data.body,
    pinned: parsed.data.pinned,
    created_by: profile?.id ?? null,
  });

  if (error) {
    console.error("createAnnouncementAction failed:", error.message);
    return { status: "error", error: t("errors.createFailed") };
  }

  revalidateAnnouncements(locale);
  redirect(`/${locale}/admin/announcements`);
}

export async function updateAnnouncementAction(
  _previous: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.announcements" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) {
    return { status: "error", error: t("errors.invalid") };
  }

  const parsed = parseAnnouncement(formData);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0];
    return {
      status: "error",
      error: t(field === "title" ? "errors.title" : field === "body" ? "errors.body" : "errors.invalid"),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("announcements")
    .update({
      title: parsed.data.title,
      body: parsed.data.body,
      pinned: parsed.data.pinned,
    })
    .eq("id", id.data);

  if (error) {
    console.error("updateAnnouncementAction failed:", error.message);
    return { status: "error", error: t("errors.updateFailed") };
  }

  revalidateAnnouncements(locale);
  redirect(`/${locale}/admin/announcements`);
}

export async function deleteAnnouncementAction(
  _previous: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "admin.announcements" });

  if (!(await isCurrentUserStaff())) {
    return { status: "error", error: t("errors.forbidden") };
  }

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) {
    return { status: "error", error: t("errors.invalid") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", id.data);

  if (error) {
    console.error("deleteAnnouncementAction failed:", error.message);
    return { status: "error", error: t("errors.deleteFailed") };
  }

  revalidateAnnouncements(locale);
  redirect(`/${locale}/admin/announcements`);
}
