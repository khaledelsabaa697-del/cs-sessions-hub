"use server";

import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { csvDateStamp, csvPercent, toCsv, type CsvCell } from "@/lib/csv-export";
import { toLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation";
import type {
  AdminPointsRow,
  AttendanceStatus,
  CsvExportResult,
  StudentMetric,
} from "@/lib/types";

const MAX_ROWS = 2000;

type StudentExportRow = {
  id: string;
  student_code: string;
  username: string;
  full_name: string;
  opted_out_of_leaderboard: boolean;
};

type SessionExportRow = {
  id: string;
  title: string;
  session_date: string;
};

type AttendanceExportRow = {
  student_id: string;
  status: AttendanceStatus;
};

type SubmissionExportRow = {
  id: string;
  student_id: string;
  created_at: string;
  final_score: number | string | null;
  ai_score: number | string | null;
  status: string;
  similarity_score: number | string | null;
};

async function isCurrentUserStaff(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === "admin" || profile?.role === "teacher";
}

function failed(error: string): CsvExportResult {
  return { ok: false, error };
}

export async function exportStudentsCsvAction(
  localeRaw: string,
): Promise<CsvExportResult> {
  const locale = toLocale(localeRaw);
  const t = await getTranslations({ locale, namespace: "csv" });

  if (!(await isCurrentUserStaff())) return failed(t("forbidden"));

  const supabase = await createClient();
  const [studentsResult, metricsResult, pointsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, student_code, username, full_name, opted_out_of_leaderboard")
      .eq("role", "student")
      .order("full_name", { ascending: true })
      .limit(MAX_ROWS)
      .returns<StudentExportRow[]>(),
    supabase.rpc("admin_student_metrics"),
    supabase.rpc("admin_points_overview"),
  ]);

  if (studentsResult.error || metricsResult.error || pointsResult.error) {
    console.error(
      "exportStudentsCsvAction failed:",
      studentsResult.error?.message ??
        metricsResult.error?.message ??
        pointsResult.error?.message,
    );
    return failed(t("failed"));
  }

  const metricById = new Map(
    ((metricsResult.data ?? []) as StudentMetric[]).map((row) => [row.student_id, row]),
  );
  const pointsById = new Map(
    ((pointsResult.data ?? []) as AdminPointsRow[]).map((row) => [row.student_id, row]),
  );

  const rows: CsvCell[][] = (studentsResult.data ?? []).map((student) => {
    const metric = metricById.get(student.id);
    const points = pointsById.get(student.id);
    return [
      student.student_code,
      student.username,
      student.full_name,
      csvPercent(metric?.attendance_percent),
      metric?.attended ?? "",
      metric?.sessions_total ?? "",
      csvPercent(metric?.average_percent),
      points ? Number(points.total_points).toFixed(2) : "",
      points?.badge_count ?? "",
      student.opted_out_of_leaderboard ? "hidden" : "visible",
    ];
  });

  return {
    ok: true,
    filename: `students-${csvDateStamp()}.csv`,
    csv: toCsv(
      [
        "student_code",
        "username",
        "full_name",
        "attendance_percent",
        "sessions_attended",
        "sessions_total",
        "average_percent",
        "points",
        "badges",
        "leaderboard",
      ],
      rows,
    ),
  };
}

export async function exportSessionCsvAction(
  localeRaw: string,
  sessionIdRaw: string,
): Promise<CsvExportResult> {
  const locale = toLocale(localeRaw);
  const t = await getTranslations({ locale, namespace: "csv" });

  if (!(await isCurrentUserStaff())) return failed(t("forbidden"));

  const sessionId = idSchema.safeParse(sessionIdRaw);
  if (!sessionId.success) return failed(t("failed"));

  const supabase = await createClient();
  const [sessionsResult, studentsResult, attendanceResult] = await Promise.all([
    supabase.rpc("admin_list_sessions"),
    supabase
      .from("profiles")
      .select("id, student_code, username, full_name, opted_out_of_leaderboard")
      .eq("role", "student")
      .order("full_name", { ascending: true })
      .limit(MAX_ROWS)
      .returns<StudentExportRow[]>(),
    supabase
      .from("attendance")
      .select("student_id, status")
      .eq("session_id", sessionId.data)
      .returns<AttendanceExportRow[]>(),
  ]);

  const session = ((sessionsResult.data ?? []) as SessionExportRow[]).find(
    (row) => row.id === sessionId.data,
  );

  if (!session || sessionsResult.error || studentsResult.error || attendanceResult.error) {
    return failed(t("failed"));
  }

  const statusByStudent = new Map(
    (attendanceResult.data ?? []).map((row) => [row.student_id, row.status]),
  );

  const rows: CsvCell[][] = (studentsResult.data ?? []).map((student) => [
    student.student_code,
    student.username,
    student.full_name,
    statusByStudent.get(student.id) ?? "not_marked",
  ]);

  return {
    ok: true,
    filename: `attendance-${session.session_date}-${session.id.slice(0, 8)}.csv`,
    csv: toCsv(["student_code", "username", "full_name", "status"], rows),
  };
}

export async function exportAssignmentCsvAction(
  localeRaw: string,
  assignmentIdRaw: string,
): Promise<CsvExportResult> {
  const locale = toLocale(localeRaw);
  const t = await getTranslations({ locale, namespace: "csv" });

  if (!(await isCurrentUserStaff())) return failed(t("forbidden"));

  const assignmentId = idSchema.safeParse(assignmentIdRaw);
  if (!assignmentId.success) return failed(t("failed"));

  const supabase = await createClient();
  const [assignmentResult, studentsResult, submissionsResult] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, title, max_score, deadline")
      .eq("id", assignmentId.data)
      .maybeSingle()
      .returns<{ id: string; title: string; max_score: number | string; deadline: string | null } | null>(),
    supabase
      .from("profiles")
      .select("id, student_code, username, full_name, opted_out_of_leaderboard")
      .eq("role", "student")
      .order("full_name", { ascending: true })
      .limit(MAX_ROWS)
      .returns<StudentExportRow[]>(),
    supabase
      .from("submissions")
      .select("id, student_id, created_at, final_score, ai_score, status, similarity_score")
      .eq("assignment_id", assignmentId.data)
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS * 5)
      .returns<SubmissionExportRow[]>(),
  ]);

  const assignment = assignmentResult.data;
  if (
    !assignment ||
    assignmentResult.error ||
    studentsResult.error ||
    submissionsResult.error
  ) {
    return failed(t("failed"));
  }

  const maxScore = Number(assignment.max_score) || 100;
  const byStudent = new Map<string, SubmissionExportRow[]>();
  for (const row of submissionsResult.data ?? []) {
    const list = byStudent.get(row.student_id) ?? [];
    list.push(row);
    byStudent.set(row.student_id, list);
  }

  const deadlineMs = assignment.deadline ? Date.parse(assignment.deadline) : null;

  const rows: CsvCell[][] = (studentsResult.data ?? []).map((student) => {
    const attempts = (byStudent.get(student.id) ?? [])
      .slice()
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const graded = attempts
      .map((row) => (row.final_score === null ? null : Number(row.final_score)))
      .filter((score): score is number => score !== null);
    const bestScore = graded.length > 0 ? Math.max(...graded) : null;
    const last = attempts.length > 0 ? attempts[attempts.length - 1] : null;
    const similarities = attempts
      .map((row) => (row.similarity_score === null ? null : Number(row.similarity_score)))
      .filter((score): score is number => score !== null);

    const onTime =
      deadlineMs === null || last === null
        ? "yes"
        : Date.parse(last.created_at) <= deadlineMs
          ? "yes"
          : "no";
    const lateByMinutes =
      deadlineMs === null || last === null
        ? 0
        : Math.max(0, Math.round((Date.parse(last.created_at) - deadlineMs) / 60000));

    return [
      student.student_code,
      student.username,
      student.full_name,
      attempts.length,
      bestScore === null ? "" : bestScore.toFixed(2),
      bestScore === null ? "" : ((bestScore / maxScore) * 100).toFixed(1),
      last?.status ?? "not_submitted",
      similarities.length > 0 ? Math.max(...similarities).toFixed(2) : "",
      onTime,
      String(lateByMinutes),
    ];
  });

  return {
    ok: true,
    filename: `grades-${csvDateStamp()}-${assignment.id.slice(0, 8)}.csv`,
    csv: toCsv(
      [
        "student_code",
        "username",
        "full_name",
        "attempts",
        "best_score",
        "best_percent",
        "last_status",
        "similarity_percent",
        "on_time",
        "late_by_minutes",
      ],
      rows,
    ),
  };
}
