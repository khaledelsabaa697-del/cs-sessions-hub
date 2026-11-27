import { redirect } from "next/navigation";
import { getCurrentProfile, homePath } from "@/lib/auth";
import { toLocale } from "@/lib/locale";

export default async function IndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  const profile = await getCurrentProfile();

  redirect(profile ? homePath(locale, profile.role) : `/${locale}/login`);
}
