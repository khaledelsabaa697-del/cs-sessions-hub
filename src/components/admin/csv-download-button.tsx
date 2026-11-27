"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { exportAssignmentCsvAction, exportSessionCsvAction, exportStudentsCsvAction } from "@/actions/exports";
import { buttonSecondary } from "@/components/ui";

type CsvKind = "students" | "session" | "assignment";

/**
 * Generates the CSV on the server (admin-checked), then hands it to the browser
 * as a download. No export route or query-string auth is needed.
 */
export function CsvDownloadButton({
  locale,
  kind,
  id,
  label,
}: {
  locale: string;
  kind: CsvKind;
  id?: string;
  label: string;
}) {
  const t = useTranslations("csv");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);

    const result =
      kind === "students"
        ? await exportStudentsCsvAction(locale)
        : kind === "session" && id
          ? await exportSessionCsvAction(locale, id)
          : kind === "assignment" && id
            ? await exportAssignmentCsvAction(locale, id)
            : { ok: false as const, error: t("error") };

    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setPending(false);
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={handleClick} disabled={pending} aria-busy={pending} className={buttonSecondary}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        {pending ? t("preparing") : label}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </span>
      ) : null}
    </span>
  );
}
