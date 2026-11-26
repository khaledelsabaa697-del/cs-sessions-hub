"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { safeRedirectPath, toLocale } from "@/lib/locale";
import { loginSchema, normalizeUsername } from "@/lib/validation";
import { verifyTurnstile } from "@/lib/turnstile";

export async function loginAction(
  _previous: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const locale = toLocale(formData.get("locale"));
  const t = await getTranslations({ locale, namespace: "auth" });

  const parsed = loginSchema.safeParse({
    username: String(formData.get("username") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { error: t("invalidCredentials") };
  }

  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for") ?? "local";
  const ip = forwarded.split(",")[0]?.trim() || "local";

  const limit = rateLimit(`login:${ip}:${parsed.data.username}`, 10, 60_000);
  if (!limit.ok) {
    return { error: t("tooManyAttempts") };
  }

  // Verify Turnstile token if configured
  const turnstileToken = formData.get("turnstile_token") as string | null;
  console.log("[Login] Turnstile token received:", turnstileToken ? `${turnstileToken.substring(0, 20)}...` : "empty");
  const turnstileResult = await verifyTurnstile(turnstileToken);
  if (!turnstileResult.ok) {
    console.warn("[Login] Turnstile verification failed:", turnstileResult);
    return {
      error:
        turnstileResult.code === "not_configured"
          ? t("errors.captchaNotConfigured")
          : t("errors.turnstileFailed"),
    };
  }

  const supabase = await createClient();

  const identifier = parsed.data.username.trim();
  const isEmail = identifier.includes("@");

  // Look up email by username if not an email
  let email = isEmail ? identifier.toLowerCase() : `${identifier.toLowerCase()}@cshub.local`;

  if (!isEmail) {
    const { data: profileEmail, error: lookupError } = await supabase
      .rpc("get_email_by_username", { p_username: identifier.toLowerCase() });

    if (!lookupError && profileEmail) {
      email = profileEmail;
    }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { error: t("invalidCredentials") };
  }

  // Check if email is confirmed (except for @cshub.local legacy accounts)
  if (!data.user.email_confirmed_at && !email.endsWith("@cshub.local")) {
    return { error: t("emailNotVerified") };
  }

  // Role comes from profiles (authoritative), not app_metadata.
  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profileRow) {
    // Orphan auth user: sign out and show the incomplete-account message.
    await supabase.auth.signOut();
    return { error: t("accountIncomplete") };
  }

  const role = profileRow.role as "student" | "teacher" | "admin" | "hr";
  const requested = safeRedirectPath(formData.get("next"), locale);
  const fallback =
    role === "hr"
      ? `/${locale}/hr`
      : role === "admin" || role === "teacher"
        ? `/${locale}/admin`
        : `/${locale}/dashboard`;

  redirect(requested ?? fallback);
}
