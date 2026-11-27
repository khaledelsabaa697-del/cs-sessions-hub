import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { ensureModelCatalog, getGradingSettings, getModelStateMap, getCatalogUpdatedAt } from "@/lib/grading/catalog";
import { GradingSettingsForm } from "@/components/admin/grading-settings-form";
import { PageHeader } from "@/components/ui";

export const maxDuration = 60;

export default async function AdminGradingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);

  const profile = await requireStaff(locale);
  const t = await getTranslations("admin.grading");

  const [models, settings, states, catalogUpdatedAt] = await Promise.all([
    ensureModelCatalog(false),
    getGradingSettings(),
    getModelStateMap(),
    getCatalogUpdatedAt(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <GradingSettingsForm
        locale={locale}
        isAdmin={profile.role === "admin"}
        initialMode={settings.mode}
        initialPreferred={settings.preferredModel}
        initialAllowPaid={settings.allowPaid}
        initialMaxAttempts={settings.maxAttempts}
        models={models}
        states={states}
        catalogUpdatedAt={catalogUpdatedAt}
      />
    </div>
  );
}
