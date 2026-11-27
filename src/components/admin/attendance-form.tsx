"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { saveAttendanceAction } from "@/actions/sessions";
import type { AttendanceSaveState, AttendanceStatus } from "@/lib/types";
import { Alert, Card, CardHeader, EmptyState, buttonSecondary, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { initials } from "@/lib/utils";

type Student = {
  id: string;
  full_name: string;
  username: string;
  student_code: string;
};

const initialState: AttendanceSaveState = { status: "idle" };
const STATUSES = ["present", "late", "absent"] as const;

export function AttendanceForm({
  locale,
  sessionId,
  students,
  existing,
}: {
  locale: string;
  sessionId: string;
  students: Student[];
  existing: Record<string, AttendanceStatus>;
}) {
  const t = useTranslations("admin.session");
  const ts = useTranslations("attendanceStatus");
  const [state, formAction] = useActionState(saveAttendanceAction, initialState);
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map((student) => [student.id, existing[student.id] ?? "none"])),
  );

  const counts = students.reduce(
    (totals, student) => {
      const value = statuses[student.id] ?? "none";
      if (value === "present") totals.present += 1;
      else if (value === "late") totals.late += 1;
      else if (value === "absent") totals.absent += 1;
      else totals.unmarked += 1;
      return totals;
    },
    { present: 0, late: 0, absent: 0, unmarked: 0 },
  );
  const marked = students.length - counts.unmarked;

  return (
    <Card>
      <CardHeader
        title={t("attendanceTitle")}
        description={t("attendanceSubtitle")}
        action={
          <span className="text-xs font-medium text-[var(--ink-muted)]">
            {t("summary", { checked: marked, total: students.length })}
          </span>
        }
      />

      {students.length === 0 ? (
        <div className="p-5">
          <EmptyState title={t("noStudents")} />
        </div>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="session_id" value={sessionId} />

          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-5 py-3 text-xs ">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              {ts("present")}: {counts.present}
            </span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              {ts("late")}: {counts.late}
            </span>
            <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              {ts("absent")}: {counts.absent}
            </span>
            <span className="rounded-full bg-[var(--glass-inset)] px-2.5 py-1 font-medium text-[var(--ink-soft)] ">
              {t("notMarked")}: {counts.unmarked}
            </span>
            <button
              type="button"
              onClick={() => setStatuses(Object.fromEntries(students.map((student) => [student.id, "present"])))}
              className={`${buttonSecondary} ms-auto px-3 py-1.5 text-xs`}
            >
              {t("markAllPresent")}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--line)]">
                {students.map((student) => (
                  <tr key={student.id}>
                    <td className="px-3 py-3 sm:px-5">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                          {initials(student.full_name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--ink)]">{student.full_name}</p>
                          <p className="truncate text-xs text-[var(--ink-muted)]">@{student.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-5 py-3 sm:table-cell">
                      <span className="font-mono text-xs text-[var(--ink-muted)]">{student.student_code}</span>
                    </td>
                    <td className="px-3 py-3 text-end sm:px-5">
                      <label className="sr-only" htmlFor={`status-${student.id}`}>
                        {student.full_name}
                      </label>
                      <select
                        id={`status-${student.id}`}
                        name={`status:${student.id}`}
                        value={statuses[student.id] ?? "none"}
                        onChange={(event) =>
                          setStatuses((current) => ({
                            ...current,
                            [student.id]: event.target.value,
                          }))
                        }
                        className={`${inputClass} w-28 py-1.5 text-sm sm:w-36`}
                      >
                        <option value="none">{t("notMarked")}</option>
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {ts(status)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line)] px-5 py-4 ">
            {state.status === "error" ? <Alert>{state.error}</Alert> : null}
            {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
            <SubmitButton idle={t("saveAttendance")} pendingLabel={t("savingAttendance")} />
          </div>
        </form>
      )}
    </Card>
  );
}
