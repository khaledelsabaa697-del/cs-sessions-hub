import { getTranslations } from "next-intl/server";
import { CodeCountdown } from "@/components/code-countdown";
import { CopyButton } from "@/components/copy-button";
import { EndCodeForm, RotateCodeForm } from "@/components/admin/code-controls";
import { Card, CardHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

const liveBadge =
  "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20";
const closedBadge =
  "inline-flex items-center gap-1.5 rounded-full bg-[var(--glass-inset)] px-2.5 py-1 text-xs font-medium text-[var(--ink-soft)] ring-1 ring-inset ring-slate-500/10 dark:ring-slate-400/20";

export async function CodePanel({
  locale,
  sessionId,
  code,
  expiresAt,
  active,
  qrDataUrl,
  checkInUrl,
}: {
  locale: string;
  sessionId: string;
  code: string | null;
  expiresAt: string | null;
  active: boolean;
  qrDataUrl: string | null;
  checkInUrl: string | null;
}) {
  const t = await getTranslations("admin.session");

  return (
    <Card>
      <CardHeader title={t("codeTitle")} description={t("codeSubtitle")} />
      <div className="grid gap-6 p-5 md:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-4">
          {code ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span dir="ltr" className="font-mono text-3xl font-bold tracking-[0.2em] text-[var(--ink)]">
                  {code}
                </span>
                <CopyButton value={code} />
                <span className={active ? liveBadge : closedBadge}>{active ? t("active") : t("expired")}</span>
              </div>
              <p className="text-sm text-[var(--ink-muted)]">
                {active && expiresAt ? (
                  <>
                    {t("expiresLabel")} <CodeCountdown expiresAt={expiresAt} />
                  </>
                ) : expiresAt ? (
                  t("expiresAt", { time: formatDateTime(expiresAt, locale) })
                ) : null}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">{t("noCodeTitle")}</p>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">{t("noCodeBody")}</p>
            </div>
          )}

          <RotateCodeForm locale={locale} sessionId={sessionId} />

          {code ? <EndCodeForm locale={locale} sessionId={sessionId} /> : null}

          {active && checkInUrl ? (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--glass-inset)] p-3 ">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-[var(--ink-muted)]">{t("linkLabel")}</p>
                <CopyButton value={checkInUrl} />
              </div>
              <code className="mt-1 block break-all text-xs text-[var(--ink-soft)] " dir="ltr">
                {checkInUrl}
              </code>
            </div>
          ) : null}
        </div>

        {active && qrDataUrl ? (
          <figure className="justify-self-start md:justify-self-end">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt={t("qrAlt")}
              width={200}
              height={200}
              className="rounded-xl border border-[var(--line)] bg-white p-2 "
            />
            <figcaption className="mt-2 max-w-[12.5rem] text-xs text-[var(--ink-muted)]">{t("scanHint")}</figcaption>
          </figure>
        ) : null}
      </div>
    </Card>
  );
}
