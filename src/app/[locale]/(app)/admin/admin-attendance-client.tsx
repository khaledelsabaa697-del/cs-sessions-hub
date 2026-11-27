"use client";

import { useState, useActionState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { formatDate, initials } from "@/lib/utils";
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  buttonPrimary,
  buttonSecondary,
  inputClass,
  labelClass,
} from "@/components/ui";
import { recordAttendanceAction, removeAttendanceAction } from "@/actions/attendance";

type SessionRow = {
  id: string;
  title: string;
  session_date: string;
};

type StudentRow = {
  id: string;
  full_name: string;
  username?: string;
  student_code: string;
};

type AttendanceStatus = "present" | "absent" | "late";

type MarkedStudent = StudentRow & { status: AttendanceStatus };

const statusClasses: Record<AttendanceStatus | "none", string> = {
  present:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  late: "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  absent: "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
  none: "bg-[var(--glass-inset)] text-[var(--ink-soft)] ring-slate-500/10 dark:ring-slate-400/20",
};

export function AdminAttendanceClient({
  locale,
  sessions,
  markedStudents,
  selectedSession,
  hasError,
  errorMessage,
}: {
  locale: string;
  sessions: SessionRow[];
  markedStudents: MarkedStudent[];
  selectedSession: SessionRow | null;
  hasError: boolean;
  errorMessage?: string;
}) {
  const t = useTranslations("admin.attendance");
  const ts = useTranslations("attendanceStatus");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [recordState, recordAction] = useActionState(recordAttendanceAction, { status: "idle" });
  const [removeState, removeAction] = useActionState(removeAttendanceAction, { status: "idle" });
  const [studentIds, setStudentIds] = useState("");

  function handleSessionChange(sessionId: string) {
    const params = new URLSearchParams(searchParams);
    if (sessionId) params.set("session", sessionId);
    else params.delete("session");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <Link href="/admin" className={buttonSecondary}>
            {t("backToAdmin")}
          </Link>
        }
      />

      {hasError ? (
        <Alert>
          {t("loadError")}
          {errorMessage && process.env.NODE_ENV !== "production" && (
            <pre className="mt-2 text-xs bg-[var(--glass-inset)] p-2 rounded overflow-auto max-h-24">
              {errorMessage}
            </pre>
          )}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[28rem_1fr]">
        <Card>
          <CardHeader title={t("recordTitle")} description={t("recordSubtitle")} />
          <div className="p-5 space-y-4">
            <div>
              <label htmlFor="session-select" className={labelClass}>
                {t("sessionLabel")}
              </label>
              <select
                id="session-select"
                name="session_id"
                className={inputClass}
                onChange={(e) => handleSessionChange(e.target.value)}
                value={selectedSession?.id ?? ""}
              >
                <option value="">{t("selectSession")}</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} — {formatDate(session.session_date, locale)}
                  </option>
                ))}
              </select>
            </div>

            {selectedSession ? (
              <>
                <form action={recordAction} className="space-y-4">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="session_id" value={selectedSession.id} />

                  <div>
                    <label htmlFor="student-ids" className={labelClass}>
                      {t("idsLabel")}
                    </label>
                    <textarea
                      id="student-ids"
                      name="student_ids"
                      rows={6}
                      placeholder={t("idsPlaceholder")}
                      className={inputClass}
                      value={studentIds}
                      onChange={(e) => setStudentIds(e.target.value)}
                    />
                    <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{t("idsHint")}</p>
                  </div>

                  <button type="submit" disabled={recordState.status === "success"} className={buttonPrimary}>
                    {t("recordBtn")}
                  </button>
                  {recordState.status === "error" ? <Alert>{recordState.error}</Alert> : null}
                  {recordState.status === "success" ? <Alert tone="success">{recordState.message}</Alert> : null}
                </form>

                <div className="pt-4 border-t border-[var(--line)]">
                  <h4 className="text-sm font-medium text-[var(--ink)] mb-2">{t("markedTitle")}</h4>
                  {markedStudents.length === 0 ? (
                    <p className="text-sm text-[var(--ink-muted)]">{t("noMarked")}</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {markedStudents.map((student) => (
                        <form
                          key={student.id}
                          action={removeAction}
                          className="flex items-center justify-between gap-3 p-2 rounded-lg bg-[var(--glass-inset)] "
                        >
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="session_id" value={selectedSession.id} />
                          <input type="hidden" name="student_id" value={student.id} />
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                              {initials(student.full_name)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[var(--ink)]">{student.full_name}</p>
                              <p className="truncate text-xs text-[var(--ink-muted)]">
                                {student.username ? `@${student.username} · ` : ""}
                                {student.student_code}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClasses[student.status]}`}
                            >
                              {ts(student.status)}
                            </span>
                            <button
                              type="submit"
                              disabled={removeState.status === "success"}
                              className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 text-sm font-medium"
                            >
                              {t("remove")}
                            </button>
                          </div>
                          {removeState.status === "error" ? <Alert>{removeState.error}</Alert> : null}
                          {removeState.status === "success" ? (
                            <Alert tone="success">{removeState.message}</Alert>
                          ) : null}
                        </form>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--ink-muted)]">{t("selectSessionFirst")}</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={selectedSession ? `${t("markedTitle")} — ${selectedSession.title}` : t("markedTitle")}
            description={
              selectedSession ? formatDate(selectedSession.session_date, locale, { dateStyle: "full" }) : undefined
            }
          />
          {markedStudents.length === 0 ? (
            <div className="p-5">
              <EmptyState title={t("noMarked")} description={t("noMarkedHint")} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead className="bg-[var(--glass-inset)] text-xs uppercase tracking-wide text-[var(--ink-muted)] ">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colStudent")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colCode")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-start font-medium">
                      {t("colStatus")}
                    </th>
                    <th scope="col" className="px-5 py-3 text-end font-medium">
                      {t("colActions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {markedStudents.map((student) => (
                    <form key={student.id} action={removeAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="session_id" value={selectedSession!.id} />
                      <input type="hidden" name="student_id" value={student.id} />
                      <tr>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                              {initials(student.full_name)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[var(--ink)]">{student.full_name}</p>
                              {student.username ? (
                                <p className="truncate text-xs text-[var(--ink-muted)]">@{student.username}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <span className="font-mono text-xs text-[var(--ink-muted)]">{student.student_code}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClasses[student.status]}`}
                          >
                            {ts(student.status)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-end">
                          <button
                            type="submit"
                            className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 text-sm font-medium"
                          >
                            {t("remove")}
                          </button>
                        </td>
                      </tr>
                    </form>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
