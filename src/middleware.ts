import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing, type AppLocale } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

function copyCookies(target: NextResponse, source: NextResponse): NextResponse {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

async function getUserRole(supabaseUrl: string, supabaseAnonKey: string, cookies: NextRequest["cookies"]): Promise<"student" | "teacher" | "admin" | null> {
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookies.getAll();
      },
      setAll() {
        // no-op in middleware read
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  // Fetch role from profiles table
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return (profile?.role as "student" | "teacher" | "admin") ?? "student";
}

async function isEmailVerified(supabaseUrl: string, supabaseAnonKey: string, cookies: NextRequest["cookies"]): Promise<boolean> {
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookies.getAll();
      },
      setAll() {
        // no-op in middleware read
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return false;

  // @cshub.local accounts are legacy and don't require email verification
  if (user.email?.endsWith("@cshub.local")) return true;

  return !!user.email_confirmed_at;
}

export async function middleware(request: NextRequest) {
  // Handles locale detection, the NEXT_LOCALE cookie and /en|/ar prefixing.
  const response = intlMiddleware(request);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Misconfigured deployment: let the page-level guards surface the error.
    return response;
  }

  const { pathname, search } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const maybeLocale = segments[0];

  // Unprefixed paths are redirected by next-intl on this pass; auth checks run
  // again on the localized request.
  if (!maybeLocale || !(routing.locales as readonly string[]).includes(maybeLocale)) {
    return response;
  }

  const locale = maybeLocale as AppLocale;
  const path = `/${segments.slice(1).join("/")}`;
  const isLogin = path === "/login";
  const isSignup = path === "/signup";
  const isVerifyEmail = path === "/verify-email";
  const isResetPassword = path === "/reset-password";

  // Determine role from profiles table
  const role = await getUserRole(supabaseUrl, supabaseAnonKey, request.cookies);

  // Redirect unauthenticated users to login
  if (!role && !isLogin && !isSignup && !isVerifyEmail && !isResetPassword) {
    const url = new URL(`/${locale}/login`, request.url);
    if (path !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return copyCookies(NextResponse.redirect(url), response);
  }

  // Redirect authenticated users away from login/signup/verify
  if (role && (isLogin || isSignup || isVerifyEmail)) {
    const target = role === "admin" || role === "teacher" ? `/${locale}/admin` : `/${locale}/dashboard`;
    return copyCookies(NextResponse.redirect(new URL(target, request.url)), response);
  }

  // Protect admin/teacher routes
  const isAdminArea = path === "/admin" || path.startsWith("/admin/");
  if (role && isAdminArea && role === "student") {
    return copyCookies(
      NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url)),
      response,
    );
  }

  // Require email verification for student pages (except @cshub.local legacy accounts)
  if (role === "student" && !isLogin && !isSignup && !isVerifyEmail) {
    const verified = await isEmailVerified(supabaseUrl, supabaseAnonKey, request.cookies);
    if (!verified) {
      const url = new URL(`/${locale}/verify-email`, request.url);
      url.searchParams.set("next", `${pathname}${search}`);
      return copyCookies(NextResponse.redirect(url), response);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};