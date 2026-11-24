"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toLocale } from "@/lib/locale";
import { fieldFromZodError, profileSchema } from "@/lib/validation";
import type { ProfileState } from "./types";

export async function updateProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "profile" });

  const profile = await getCurrentProfile();
  if (!profile) {
    return { status: "error", error: t("errors.generic") };
  }

  const parsed = profileSchema.safeParse({
    full_name: String(formData.get("full_name") ?? "").trim(),
    display_name: String(formData.get("display_name") ?? "").trim(),
    opted_out_of_leaderboard:
      formData.get("opted_out_of_leaderboard") === "on",
  });

  if (!parsed.success) {
    const field = fieldFromZodError(parsed.error);
    return {
      status: "error",
      error: t(
        field === "full_name"
          ? "errors.full_name"
          : field === "display_name"
            ? "errors.display_name"
            : "errors.generic",
      ),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      display_name: parsed.data.display_name,
      opted_out_of_leaderboard: parsed.data.opted_out_of_leaderboard,
    })
    .eq("id", profile.id);

  if (error) {
    console.error("updateProfileAction failed:", error.message);
    return { status: "error", error: t("errors.generic") };
  }

  revalidatePath(`/${locale}/profile`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/admin`);
  revalidatePath(`/${locale}/admin/students`);

  return { status: "success", message: t("saved") };
}

