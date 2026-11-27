"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { importStudentsAction } from "@/actions/students";
import { parseCsv } from "@/lib/csv";
import { toCsv } from "@/lib/csv-export";
import { csvStudentSchema, normalizeUsername } from "@/lib/validation";
import type { CsvImportState, CsvRowResult } from "@/lib/types";
import { Alert, Card, CardHeader, buttonPrimary, buttonSecondary, inputClass, labelClass } from "@/components/ui";

const MAX_FILE_BYTES = 1024 * 1024; // 1 MB
const BATCH_SIZE = 200; // matches the server-side per-request limit
const PREVIEW_LIMIT = 200;

type TableError = "emptyCsv" | "badHeader";

type ParsedTable =
  | { ok: false; error: TableError }
  | {
      ok: true;
      header: string[];
      body: string[][];
      usernameIndex: number;
      fullNameIndex: number;
      passwordIndex: number;
    };

type PreviewRow = {
  line: number;
  username: string;
  full_name: string;
  issue: "invalid" | "duplicate" | null;
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseTable(text: string): ParsedTable {
  if (!text.trim()) return { ok: false, error: "emptyCsv" };

  const rows = parseCsv(text);
  if (rows.length === 0) return { ok: false, error: "emptyCsv" };

  const header = rows[0].map(normalizeHeader);
  const usernameIndex = header.indexOf("username");
  const fullNameIndex = header.indexOf("full_name") >= 0 ? header.indexOf("full_name") : header.indexOf("name");
  const passwordIndex = header.indexOf("password");

  if (usernameIndex === -1 || fullNameIndex === -1) {
    return { ok: false, error: "badHeader" };
  }

  return {
    ok: true,
    header: rows[0],
    body: rows.slice(1),
    usernameIndex,
    fullNameIndex,
    passwordIndex,
  };
}

/** Decode a CSV upload as UTF-8, falling back to Windows-1256 (Arabic Excel). */
async function readCsvFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buffer);

  if (text.includes("\uFFFD")) {
    try {
      text = new TextDecoder("windows-1256").decode(buffer);
    } catch {
      // Browser without windows-1256 support: keep the UTF-8 result.
    }
  }

  return text.replace(/^\uFEFF/, "");
}

function saveCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function CsvImportForm({ locale }: { locale: string }) {
  const t = useTranslations("admin.students");
  const tc = useTranslations("common");

  const [csv, setCsv] = useState("");
  const [state, setState] = useState<CsvImportState>({ status: "idle" });
  const [fileError, setFileError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const deferredCsv = useDeferredValue(csv);
  const table = useMemo(() => parseTable(deferredCsv), [deferredCsv]);

  const preview = useMemo<Array<PreviewRow> | null>(() => {
    if (!table.ok) return null;

    const seen = new Set<string>();
    return table.body.map((cells, index) => {
      const rawUsername = cells[table.usernameIndex] ?? "";
      const rawFullName = cells[table.fullNameIndex] ?? "";
      const rawPassword = table.passwordIndex >= 0 ? (cells[table.passwordIndex] ?? "") : "";
      const username = normalizeUsername(rawUsername);

      let issue: PreviewRow["issue"] = null;
      const parsed = csvStudentSchema.safeParse({
        username,
        full_name: rawFullName.trim(),
        // Password may be blank; the server generates one.
        ...(rawPassword ? { password: rawPassword } : {}),
      });

      if (!parsed.success) {
        issue = "invalid";
      } else if (seen.has(parsed.data.username)) {
        issue = "duplicate";
      } else {
        seen.add(parsed.data.username);
      }

      return { line: index + 2, username, full_name: rawFullName, issue };
    });
  }, [table]);

  const previewValid = preview ? preview.filter((row) => !row.issue).length : 0;
  const previewInvalid = preview ? preview.length - previewValid : 0;

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // Allow re-selecting the same file later.
    event.target.value = "";

    setFileError(null);
    setState({ status: "idle" });
    setProgress(null);
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError(t("errors.fileType"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError(t("errors.fileTooLarge"));
      return;
    }

    try {
      const text = await readCsvFile(file);
      setCsv(text);
    } catch {
      setFileError(t("errors.fileRead"));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setFileError(null);

    const parsed = parseTable(csv);
    if (!parsed.ok) {
      setState({ status: "error", error: t(`errors.${parsed.error}`) });
      return;
    }
    if (parsed.body.length === 0) {
      setState({ status: "error", error: t("errors.emptyCsv") });
      return;
    }

    const batches: string[][][] = [];
    for (let index = 0; index < parsed.body.length; index += BATCH_SIZE) {
      batches.push(parsed.body.slice(index, index + BATCH_SIZE));
    }

    setPending(true);
    setProgress({ done: 0, total: batches.length });
    setState({ status: "idle" });

    const merged: CsvRowResult[] = [];

    try {
      for (let index = 0; index < batches.length; index += 1) {
        const formData = new FormData();
        formData.set("locale", locale);
        formData.set("csv", toCsv(parsed.header, batches[index], { bom: false }));

        const result = await importStudentsAction({ status: "idle" }, formData);

        if (result.status === "done") {
          const offset = index * BATCH_SIZE;
          merged.push(...result.rows.map((row) => ({ ...row, line: row.line + offset })));
        } else if (result.status === "error") {
          setState({ status: "error", error: result.error });
          return;
        }

        setProgress({ done: index + 1, total: batches.length });
      }

      const created = merged.filter((row) => row.ok).length;
      setState({
        status: "done",
        rows: merged,
        created,
        failed: merged.length - created,
      });
    } catch {
      setState({ status: "error", error: t("errors.importFailed") });
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  function downloadTemplate() {
    saveCsv(
      "students-template.csv",
      toCsv(
        ["username", "full_name", "password"],
        [
          ["sara", "Sara Ahmed", "StrongPass123"],
          ["omar", "Omar Hassan", ""],
        ],
      ),
    );
  }

  function downloadResults() {
    if (state.status !== "done") return;
    saveCsv(
      `student-import-results-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        ["username", "student_code", "password", "status"],
        state.rows.map((row) => [
          row.username,
          row.student_code ?? "",
          row.password ?? "",
          row.ok ? t("rowCreated") : t("rowFailed"),
        ]),
      ),
    );
  }

  const successfulRows = state.status === "done" ? state.rows.filter((row) => row.ok) : [];
  const previewRows = preview ? preview.slice(0, PREVIEW_LIMIT) : [];

  return (
    <Card>
      <CardHeader title={t("importTitle")} description={t("importSubtitle")} />
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        <input type="hidden" name="locale" value={locale} />

        <div>
          <label htmlFor="csv-file" className={labelClass}>
            {t("uploadLabel")}
          </label>
          <input id="csv-file" type="file" accept=".csv,text/csv" onChange={handleFile} className={inputClass} />
          <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{t("uploadHint")}</p>
        </div>

        <div>
          <label htmlFor="csv" className={labelClass}>
            CSV
          </label>
          <textarea
            id="csv"
            name="csv"
            rows={7}
            spellCheck={false}
            dir="ltr"
            value={csv}
            onChange={(event) => {
              setCsv(event.target.value);
              setState({ status: "idle" });
            }}
            placeholder={t("importPlaceholder")}
            className={`${inputClass} font-mono text-xs leading-relaxed`}
          />
          <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{t("importHint")}</p>
        </div>

        {fileError ? <Alert>{fileError}</Alert> : null}
        {state.status === "error" ? <Alert>{state.error}</Alert> : null}

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className={buttonPrimary}>
            {pending
              ? progress
                ? t("importProgress", { done: progress.done, total: progress.total })
                : t("importing")
              : t("importRun")}
          </button>
          <button type="button" onClick={downloadTemplate} className={buttonSecondary}>
            {t("downloadTemplate")}
          </button>
        </div>
      </form>

      {deferredCsv.trim() ? (
        <div className="border-t border-[var(--line)] p-5 ">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--ink)]">{t("previewTitle")}</h3>
            {table.ok ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {t("previewValid", { count: previewValid })}
                </span>
                {previewInvalid > 0 ? (
                  <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                    {t("previewInvalid", { count: previewInvalid })}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {!table.ok ? (
            <div className="mt-3">
              <Alert>{t(`errors.${table.error}`)}</Alert>
            </div>
          ) : previewRows.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ink-muted)]">{t("previewEmpty")}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-start text-xs uppercase tracking-wide text-[var(--ink-muted)] ">
                    <th scope="col" className="py-2 pe-3 text-start font-medium">
                      {t("line")}
                    </th>
                    <th scope="col" className="py-2 pe-3 text-start font-medium">
                      {t("colUsername")}
                    </th>
                    <th scope="col" className="py-2 pe-3 text-start font-medium">
                      {t("colFullName")}
                    </th>
                    <th scope="col" className="py-2 text-start font-medium">
                      {tc("status")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {previewRows.map((row) => (
                    <tr key={`${row.line}-${row.username}`}>
                      <td className="py-2 pe-3 font-mono text-xs text-[var(--ink-muted)]">{row.line}</td>
                      <td className="py-2 pe-3 font-mono text-xs text-[var(--ink-soft)] ">{row.username || "—"}</td>
                      <td className="py-2 pe-3 text-xs text-[var(--ink-soft)]">{row.full_name || "—"}</td>
                      <td className="py-2 text-xs">
                        {row.issue === null ? (
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            {t("previewReady")}
                          </span>
                        ) : (
                          <span className="font-medium text-rose-600 dark:text-rose-400">
                            {row.issue === "duplicate" ? t("previewDuplicate") : t("previewInvalidRow")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview && preview.length > PREVIEW_LIMIT ? (
                <p className="mt-2 text-xs text-[var(--ink-muted)]">{t("previewLimit", { count: PREVIEW_LIMIT })}</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {state.status === "done" ? (
        <div className="border-t border-[var(--line)] p-5 ">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                {t("createdCount", { count: state.created })}
              </span>
              {state.failed > 0 ? (
                <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                  {t("failedCount", { count: state.failed })}
                </span>
              ) : null}
            </div>
            <button type="button" onClick={downloadResults} className={buttonSecondary}>
              {t("downloadResults")}
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-start text-xs uppercase tracking-wide text-[var(--ink-muted)] ">
                  <th scope="col" className="py-2 pe-3 text-start font-medium">
                    {t("line")}
                  </th>
                  <th scope="col" className="py-2 pe-3 text-start font-medium">
                    {t("colUsername")}
                  </th>
                  <th scope="col" className="py-2 pe-3 text-start font-medium">
                    {tc("status")}
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    {t("studentCode")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {state.rows.map((row) => (
                  <tr key={`${row.line}-${row.username}`}>
                    <td className="py-2 pe-3 font-mono text-xs text-[var(--ink-muted)]">{row.line}</td>
                    <td className="py-2 pe-3 font-mono text-xs text-[var(--ink-soft)] ">{row.username || "—"}</td>
                    <td className="py-2 pe-3">
                      {row.ok ? (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {t("rowCreated")}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-rose-600 dark:text-rose-400">{t("rowFailed")}</span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-[var(--ink-muted)]">{row.ok ? row.student_code : row.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {successfulRows.length > 0 ? (
            <p className="mt-3 text-xs text-[var(--ink-muted)]">{t("resultsHint")}</p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
