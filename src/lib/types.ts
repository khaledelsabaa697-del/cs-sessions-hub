export type UserRole = "student" | "teacher" | "admin" | "hr";
export type AttendanceStatus = "present" | "absent" | "late";
export type SubmissionStatus =
  | "pending"
  | "queued"
  | "grading"
  | "graded"
  | "pending_retry"
  | "failed"
  | "flagged";
export type SubmissionType = "file" | "text";
export type AllowedSubmissionTypes = "file" | "text" | "both";

export type Profile = {
  id: string;
  username: string;
  student_code: string;
  full_name: string;
  display_name: string;
  role: UserRole;
  opted_out_of_leaderboard: boolean;
  created_at: string;
};

export type StudentAccountSummary = {
  id: string;
  username: string;
  full_name: string;
  student_code: string;
};

export type CreateStudentState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | {
      status: "success";
      message: string;
      password: string;
      student: StudentAccountSummary;
    };

export type CsvRowResult = {
  line: number;
  username: string;
  full_name: string;
  ok: boolean;
  student_code?: string;
  password?: string;
  error?: string;
};

export type CsvImportState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "done"; rows: CsvRowResult[]; created: number; failed: number };

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };

export type WarningFormState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };

export type SessionSummary = {
  id: string;
  title: string;
  session_date: string;
  code_active: boolean;
  code_expires_at: string | null;
  present_count: number;
  late_count: number;
  absent_count: number;
  checked_in_count: number;
  class_size: number;
};

export type StudentMetric = {
  student_id: string;
  attended: number;
  sessions_total: number;
  attendance_percent: number | null;
  average_percent: number | null;
  last_attended_at: string | null;
};

export type SessionFormState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };

export type AttendanceSaveState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };

export type CodeState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };

export type CheckInState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | {
      status: "success";
      message: string;
      sessionTitle: string;
      attendanceStatus: AttendanceStatus;
    };

/* -------------------------------------------------------------------------- */
/* Self-signup & email verification                                           */
/* -------------------------------------------------------------------------- */

export type SignupState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };

export type VerifyOtpState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };

/** Per-assignment counts returned by admin_assignment_overview(). */
export type AssignmentOverview = {
  assignment_id: string;
  attempt_count: number;
  student_count: number;
  pending_count: number;
  graded_count: number;
  flagged_count: number;
  average_percent: number | null;
  last_submission_at: string | null;
  class_size: number;
};

export type AssignmentFormState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };

export type MaterialState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };

export type SubmissionReviewState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string; finalScore: number | null };

export type GradeState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };

export type GradingSettingsState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };

export type SubmitAssignmentState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | {
      status: "success";
      message: string;
      grading: "graded" | "queued" | "failed";
      score: number | null;
    };

/* -------------------------------------------------------------------------- */
/* Phase 4: points, leaderboard, badges                                       */
/* -------------------------------------------------------------------------- */

export type PointsBreakdown = {
  homework_points: number;
  attendance_points: number;
  on_time_points: number;
  streak_points: number;
  total_points: number;
  attended_count: number;
  late_count: number;
  longest_streak: number;
  current_streak: number;
  all_rank: number | null;
  all_gap: number | null;
  weekly_points: number;
  weekly_rank: number | null;
  weekly_gap: number | null;
  leaderboard_visible: boolean;
  opted_out: boolean;
};

export type WeeklyProgress = {
  week_start: string;
  points: number;
  cumulative_points: number;
  attended_count: number;
  graded_count: number;
};

export type LeaderboardEntry = {
  rank: number;
  display_name: string;
  points: number;
  is_me: boolean;
};

export type Standing = {
  rank: number;
  points: number;
  points_to_next: number;
};

export type AdminPointsRow = {
  student_id: string;
  username: string;
  full_name: string;
  student_code: string;
  total_points: number;
  weekly_points: number;
  homework_points: number;
  attendance_points: number;
  on_time_points: number;
  streak_points: number;
  attended_count: number;
  late_count: number;
  longest_streak: number;
  badge_count: number;
  opted_out: boolean;
};

export type PointsConfig = {
  homework_weight: number;
  attendance_points: number;
  on_time_bonus: number;
  streak_bonus: number;
  leaderboard_visible: boolean;
  weekly_reset_at: string;
};

export type PointsConfigState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };

/* -------------------------------------------------------------------------- */
/* Phase 5: announcements, analytics, similarity, CSV exports                 */
/* -------------------------------------------------------------------------- */

export type Announcement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type AnnouncementFormState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };

export type AnalyticsTotals = {
  students: number;
  sessions: number;
  assignments: number;
  submissions: number;
  graded: number;
  pending: number;
  flagged: number;
  attendance_percent: number;
  average_percent: number;
  unreviewed_pairs: number;
};

export type AnalyticsWeek = {
  week_start: string;
  sessions: number;
  attended: number;
  late: number;
  attendance_percent: number | null;
};

export type AnalyticsGradeBucket = {
  bucket: number;
  count: number;
};

export type AnalyticsAtRisk = {
  full_name: string;
  username: string;
  student_code: string;
  attendance_percent: number | null;
  average_percent: number | null;
};

export type AdminAnalytics = {
  totals: AnalyticsTotals;
  weeks: AnalyticsWeek[];
  grades: AnalyticsGradeBucket[];
  at_risk: AnalyticsAtRisk[];
};

export type SimilarityPair = {
  pair_id: string;
  similarity: number;
  reviewed: boolean;
  created_at: string;
  submission_a: string;
  submission_b: string;
  student_a_name: string;
  student_a_username: string;
  student_a_code: string;
  student_a_status: SubmissionStatus;
  student_b_name: string;
  student_b_username: string;
  student_b_code: string;
  student_b_status: SubmissionStatus;
};

export type SimilarityRunState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | {
      status: "success";
      scanned: number;
      pairs: number;
      flagged: number;
      threshold: number;
    };

export type SimilarityActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type CsvExportResult =
  | { ok: true; filename: string; csv: string }
  | { ok: false; error: string };

