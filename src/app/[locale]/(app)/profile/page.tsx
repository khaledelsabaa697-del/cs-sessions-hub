import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardHeader, PageHeader, badgeClass } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { formatDate } from "@/lib/utils";
import { ProfileForm } from "./profile-form";
import { PasswordChangeForm } from "./password-change-form";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireProfile(locale);
  const t = await getTranslations("profile");
  const tr = await getTranslations("roles");

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("leaderboard")} description={t("displayNameHint")} />
          <ProfileForm
            locale={locale}
            fullName={profile.full_name}
            displayName={profile.display_name}
            optedOut={profile.opted_out_of_leaderboard}
          />
        </Card>

        <Card>
          <CardHeader title={t("account")} />
          <dl className="divide-y divide-slate-100 dark:divide-slate-800">
            <div className="flex items-center justify-between gap-3 px-5 py-3.5">
              <dt className="text-sm text-slate-500 dark:text-slate-400">{t("username")}</dt>
              <dd className="font-mono text-sm text-slate-900 dark:text-white">
                @{profile.username}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3.5">
              <dt className="text-sm text-slate-500 dark:text-slate-400">{t("studentCode")}</dt>
              <dd className={`${badgeClass} font-mono`}>{profile.student_code}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3.5">
              <dt className="text-sm text-slate-500 dark:text-slate-400">{t("role")}</dt>
              <dd className="text-sm font-medium text-slate-900 dark:text-white">
                {tr(profile.role)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3.5">
              <dt className="text-sm text-slate-500 dark:text-slate-400">{t("memberSince")}</dt>
              <dd className="text-sm text-slate-900 dark:text-white">
                {formatDate(profile.created_at, locale)}
              </dd>
            </div>
          </dl>
          <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
              {t("changePassword")}
            </h3>
            <PasswordChangeForm locale={locale} />
          </div>
        </Card>
      </div>
    </div>
  );
}
