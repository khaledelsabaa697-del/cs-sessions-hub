import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types";
import type { AppLocale } from "@/i18n/routing";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, student_code, full_name, display_name, role, opted_out_of_leaderboard, created_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as Profile;
});

export async function requireProfile(locale: AppLocale): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/${locale}/login`);
  return profile;
}

export async function requireAdmin(locale: AppLocale): Promise<Profile> {
  const profile = await requireProfile(locale);
  if (profile.role !== "admin") redirect(`/${locale}/dashboard`);
  return profile;
}

export async function requireTeacher(locale: AppLocale): Promise<Profile> {
  const profile = await requireProfile(locale);
  if (profile.role === "student" || profile.role === "hr") redirect(`/${locale}/dashboard`);
  return profile;
}

export async function requireHr(locale: AppLocale): Promise<Profile> {
  const profile = await requireProfile(locale);
  if (profile.role !== "hr" && profile.role !== "admin") redirect(`/${locale}/dashboard`);
  return profile;
}

/**
 * Alias for requireTeacher - allows both admin and teacher (staff roles).
 * Use for panel pages that both roles should access.
 */
export const requireStaff = requireTeacher;

export function homePath(locale: AppLocale, role: UserRole): string {
  if (role === "admin") return `/${locale}/admin`;
  if (role === "teacher") return `/${locale}/admin`;
  if (role === "hr") return `/${locale}/hr`;
  return `/${locale}/dashboard`;
}
