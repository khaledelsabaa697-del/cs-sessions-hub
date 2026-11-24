# CS Sessions Hub

A bilingual (English / Arabic, full RTL) class hub for C++ fundamentals sessions:
attendance, assignments, AI feedback, points, badges and a privacy-safe leaderboard.

Built with **Next.js (App Router) + TypeScript + Tailwind CSS + Supabase**.

> **Status: feature-complete (Phases 1–6).** The teaching toolkit — announcements with
> pinned posts, CSV exports, a similarity review queue and an analytics page — is in,
> and the final polish pass covers accessibility, seed data for the analytics views and
> the launch checklist below.

---

## 1. What is included (Phases 1–6)

- Next.js 15 App Router project, TypeScript strict mode, Tailwind CSS v4, dark mode.
- Bilingual UI (`next-intl`) with Arabic RTL, navbar language switcher and a
  remembered locale (`NEXT_LOCALE` cookie).
- Supabase clients for browser, server (RLS-scoped) and admin (service role, server only).
- **Complete SQL schema for the whole product** (all tables, enums, functions, views,
  storage bucket, triggers, indexes, points configuration and badges).
- **RLS on every table**, explicit column grants, storage folder policies, and a
  leaderboard view that exposes only `rank`, `display_name`, `points`, `weekly_points`, `weekly_rank`.
- Username + password login (`<username>@cshub.local` internally).
- Teacher account management:
  - create a student (with generated student code like `CS-0001`)
  - bulk CSV import (up to 200 rows, per-row results, generated passwords)
  - reset a student password
- Student dashboard (attendance rate, average score, badges, deadlines, announcements),
  profile page (display name + leaderboard opt-out), admin overview and students table.
- **Sessions & attendance (Phase 2):**
  - create, edit and delete sessions with attendance counts
  - rotating 6-character check-in codes with a configurable expiry window
  - QR code + copyable link that opens the check-in page with the code prefilled
  - student self check-in with per-student rate limiting and a live "attendance is open" banner
  - manual attendance (present / late / absent / not marked) for the whole class
  - student attendance history and teacher class metrics (attendance %, average score, last attended)
- **Assignments & AI grading (Phase 3):**
  - teacher assignment CRUD with task, rubric, expected output, max score, deadline and resubmit policy
  - student assignment list + detail page; upload `.cpp` files (100 KB, UTF-8) with resubmit rules
  - automatic grading on upload through Gemini REST (`responseSchema`, bilingual feedback, issue list)
  - retries with backoff on 429/5xx/timeouts, strict zod re-validation, and a persisted error reason
  - pending queue: `submissions` rows double as the queue; teacher can grade up to 3 queued attempts per click
  - review page with syntax-neutral code view, English/Arabic AI feedback, issues, signed download link
  - teacher final score, status (`graded` / `flagged`), regrade, and a `graded_by` audit trail
  - per-student upload rate limit (5 per 10 minutes) and a deterministic mock grader for development
- **Points engine, leaderboard & badges (Phase 4):**
  - student **Progress** page: all-time and weekly points, rank and gap to the next rank,
    current/best attendance streak, an eight-week points chart, a per-component breakdown
    (assignments, attendance, on-time bonus, streak bonus) and a badge grid
  - **Leaderboard** for students and teachers with weekly/all-time tabs, medal ranks,
    `is_me` highlighting, a personal standing card and privacy-safe rows (name + points only)
  - weekly rollover via `weekly_reset_at`; all-time totals stay intact
  - automatic badges through database triggers on submissions and attendance
    (`first_submission`, `first_to_submit`, `attendance_streak_5`, `perfect_score`, `comeback`)
  - teacher **Points** console: editable weights/bonuses, leaderboard visibility toggle,
    start-a-new-week action, badge recalculation and a per-student component table
  - opt-out and “leaderboard hidden” states are respected everywhere (no rank leakage)
- **Teaching toolkit (Phase 5):**
  - **Announcements** CRUD at `/admin/announcements` with an optional pin; pinned posts
    sort first on the student dashboard
  - **CSV exports** for the student roster, one session's attendance and one assignment's
    grades — generated in admin-checked server actions, downloaded as a Blob, with a
    UTF-8 BOM and CRLF so Excel opens Arabic names correctly
  - **Similarity check** per assignment: normalizes C++ source (comments, strings and
    preprocessor lines dropped), compares 5-token shingles with Jaccard, stores pairs at
    or above a configurable threshold (30–100, default 70), and lets the teacher mark a
    pair reviewed or flag both attempts
  - reviewed pairs survive recomputation; unreviewed results are replaced on the next run
  - flagging a pair sets both attempts to `flagged`, so they leave points and class averages
  - **Analytics** at `/admin/analytics`: student/session/assignment/attempt totals,
    attendance and average score, eight weekly attendance bars, six grade buckets and a
    ranked at-risk table
  - admin navigation trimmed to seven items; **Profile** now lives only in the user menu
- **Final polish (Phase 6):**
  - accessibility pass: skip-to-content link, visible focus rings on every button,
    `scope="col"` on all 39 table headers, accessible names for the account menu and
    logo link (`aria-current`, `role="alert|status"`, `aria-label`s and `aria-hidden`
    icons were already in place)
  - seed enrichment: two extra past labs so the analytics weekly chart shows six weeks
    of data, and the welcome announcement is pinned (existing seeds get pinned backfilled)
  - launch checklist for going live (section 7)
- Middleware route protection (`/login`, role-gated `/admin/**`), security headers,
  server-side validation with zod, login rate limiting, loading/empty/error states.
- Seed script with a teacher, six students, sessions, attendance, assignments,
  three graded sample submissions and announcements.

---

## 2. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server only — never expose it)
3. Open **SQL Editor** and run, in order:
   1. `supabase/migrations/20260101000000_init.sql`
   2. `supabase/migrations/20260101000100_reference_data.sql`
   3. `supabase/migrations/20260201000000_phase2.sql`
   4. `supabase/migrations/20260301000000_phase3.sql`
   5. `supabase/migrations/20260401000000_phase4.sql`
   6. `supabase/migrations/20260501000000_phase5.sql`

   With the Supabase CLI you can instead run `supabase db push` (link the project first).
4. In **Storage**, confirm a private bucket named `submissions` exists with a
   100 KB file size limit (the migration creates it).
5. In **Authentication → Providers → Email**, turn **off** “Allow new users to sign up”.
   Accounts are created by the teacher through the service role only.
6. In **Authentication → URL Configuration**, set:
   - Site URL: your production URL (e.g. `https://cs-sessions-hub.vercel.app`)
   - Redirect URLs: `http://localhost:3000/**`, your Vercel preview URLs, and production.

### Seed data

```bash
cp .env.example .env.local     # fill in your project URL + service role key
npm install
npm run seed
```

The seed is idempotent. Default credentials (change them!):

| Role    | Username                     | Password        |
| ------- | ---------------------------- | --------------- |
| Teacher | `admin`                      | `ChangeMe123!`  |
| Student | `sara`, `omar`, `layla`, …   | `Student123!`   |

Today’s demo invitation code is `CPP101` (valid for 45 minutes after seeding).
The first seeded assignment also gets three graded example submissions (stored in
the private `submissions` bucket) so the review screens have data immediately.
Override passwords with `SEED_ADMIN_PASSWORD` / `SEED_STUDENT_PASSWORD`.

---

## 3. Run locally

```bash
npm install
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, and (for automatic grading) AI_API_KEY + AI_BASE_URL
npm run dev
```

Open <http://localhost:3000> → redirected to `/en` (or `/ar` if that locale was chosen).

Useful commands:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm run start       # run the production build
npm run seed        # demo data (requires .env.local)
```

### Test the auth flow

1. Sign in as `admin` / `ChangeMe123!`.
2. Go to **Students → Add a student**, create one. Copy the username, student code
   and the one-time password.
3. Sign out, sign in as the new student — the dashboard shows their own code,
   zeroed stats and the seeded announcements.
4. As the teacher, use **Reset password** on that student, then sign in with the
   new password.
5. Try `/en/admin` as the student → redirected to `/en/dashboard`.
6. Switch to العربية in the navbar → URL becomes `/ar/...`, layout flips to RTL,
   and the choice survives a reload.

### Test the attendance flow

1. Sign in as the teacher and open **Sessions**.
2. Create a session (today's date), open it, and click **Generate code** (15 min is
   the default). The code, live countdown, copyable check-in link and QR appear.
3. Open `/en/check-in` as a student (the dashboard shows an "Attendance is open"
   banner while the code is live). Enter the code, or scan the QR with a phone
   already signed in as that student.
4. The student's **Attendance** page shows the session as present. Re-entering the
   same code is harmless; an expired/wrong code shows a clear error.
5. Back on the session page, change a student to **Late** or **Absent** and save —
   the counts and the student dashboard update.
6. Try `admin_session_overview()` or `admin_student_metrics()` from a student
   session (SQL/RPC) → `forbidden`.

### Test the assignment and grading flow

1. Sign in as the teacher and open **Assignments**, then create one with a task,
   rubric and optional deadline (deadline input is UTC; the label says so).
2. Sign in as a student, open the assignment and upload a small `.cpp` file
   (`#include <iostream>` + `int main()` is enough to exercise the flow).
3. With `AI_API_KEY` and `AI_BASE_URL` set, the attempt is graded immediately: score, English
   and Arabic feedback and issues appear under **Your attempts**. Without a key,
   set `GEMINI_MOCK=1` in development for a deterministic structural grade.
4. Back as the teacher, open the assignment → **Submissions** → **Review**.
   Check the AI feedback, then set a final score and save; the student sees the
   new score immediately.
5. Set the status to **Flagged** to exclude an attempt from points/averages until
   it is reviewed again. **Regrade with AI** never overwrites a teacher score.
6. Upload more than 5 files in 10 minutes as one student → clear rate-limit message.

Grading behavior worth knowing:

- Only the server writes grading columns (service role, after an admin check).
  Students can insert their own attempt but cannot set any score.
- Automatic attempts stop after 3 tries; the teacher can always **Regrade**.
- A submission flagged by the teacher is never silently un-flagged by a regrade.
- Gemini is called with a strict `responseSchema` and the response is validated
  again with zod before saving.

### Test points, badges and the leaderboard

1. Apply `20260401000000_phase4.sql`. It backfills badges for existing submissions
   and attendance, so the demo students already have some.
2. As a student, open **Progress**. You should see total points, this week's points,
   rank (or “rank is hidden”), the eight-week chart, the component breakdown and badges.
3. As a teacher, grade a submission (or run **Recalculate** on the Points page) and
   reload the student page. Homework, on-time and streak components update immediately;
   `first_submission`, `first_to_submit` and `perfect_score` are awarded by triggers.
4. Open **Leaderboard** as both roles. Check the weekly/all-time tabs, medals, the
   “You” highlight and the standing card. Teacher rows are never marked as “You”.
5. As a student, open **Profile** → *Hide me from the leaderboard*. The student
   disappears from the board, their rank shows “—“ and no points change.
6. As the teacher, open **Points** and change `attendance_points`; the student's
   breakdown and totals follow. Toggle *Show the leaderboard to students* off and
   confirm both roles see the hidden state instead of a partial board.
7. Use **Start a new week** and confirm weekly points reset to zero while all-time
   totals stay the same. **Recalculate badges** is idempotent — it returns `0` new badges.

Notes:

- `leaderboard_page()` returns only `rank`, `display_name`, `points` and `is_me`;
  student ids and student codes are never exposed.
- `my_breakdown()` returns `null` ranks while the board is hidden or the student opted out,
  so the UI cannot leak relative standing.

### Test announcements, exports, similarity and analytics

1. Apply `20260501000000_phase5.sql`. It adds the `pinned` flag, the
   `similarity_checked_at` timestamp and the two read-only RPCs.
2. As the teacher, open **Announcements**, publish one post and check *Pin*. Sign in as a
   student: the pinned post is first on the dashboard, with a “Pinned” label. Edit the
   announcement, then delete it and confirm it disappears from both views.
3. On **Students**, click **Export CSV**. Open the file in Excel — Arabic names must be
   readable (UTF-8 BOM) and the columns must match the table. Repeat from a session page
   (**Export attendance**) and an assignment page (**Export grades (CSV)**).
4. Open an assignment with at least two students' submissions and run the similarity check
   at the default 70%. Identical or lightly edited files should appear; unrelated programs
   should not. Mark a pair **Reviewed** and confirm it stays after re-running the check,
   while unreviewed results are replaced.
5. Click **Flag both** on a pair. Both attempts become `flagged`, disappear from that
   student's points/average, and the analytics “Flagged” and “Unreviewed pairs” counts move.
6. Open **Analytics**. Compare the totals with the students/points tables, confirm eight
   weekly attendance bars, six grade buckets and that a student with low attendance appears
   under *Students to check in with*. Sign in as a student and open `/en/admin/analytics`
   directly — you must be redirected to the dashboard, not see the page.
7. Switch to Arabic (`/ar`) and re-check the analytics/announcements pages: layout mirrors,
   numbers localize, and no English strings remain.

Notes:

- Exports run in `"use server"` actions guarded by `is_admin()`; they are not public routes,
  so no query-string token or signed URL is involved.
- Similarity is a *review aid*: it compares each student's latest attempt only, ignores
  comments/whitespace, and requires at least 40 tokens per file. Flagging is the teacher's
  decision, done after looking at the pair.
- `admin_analytics()` and `admin_similarity_pairs()` re-check `is_admin()` inside the
  database, so calling them from a student session raises `forbidden`.

---

## 4. Environment variables

| Variable                        | Where                  | Purpose                                              |
| ------------------------------- | ---------------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | client + server        | Supabase project URL                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server        | Public key, RLS enforced                             |
| `SUPABASE_SERVICE_ROLE_KEY`     | **server only**        | Admin user creation/reset; bypasses RLS              |
| `AI_API_KEY`                    | **server only**        | OpenAI-compatible grading key; empty = grade manually |
| `AI_BASE_URL`                   | **server only**        | Provider base URL, e.g. `https://api.openai.com/v1`  |
| `AI_MODEL`                      | **server only**        | Model id, defaults to `gpt-4o-mini`                  |
| `AI_MOCK`                       | development only       | `1` = deterministic fake grader when no key is set   |
| `SEED_ADMIN_PASSWORD`           | seed script            | Teacher password for `npm run seed`                  |
| `SEED_STUDENT_PASSWORD`         | seed script            | Demo student password                                |

Never prefix secrets with `NEXT_PUBLIC_`. The service role and AI provider keys are
only read inside server-side code and server route handlers.

---

## 5. Security model (RLS)

`public.is_admin()` is a `SECURITY DEFINER` function that checks the caller’s
profile role. Every write policy uses it, so a student cannot become an admin or
write class data.

| Table / view               | Student                                        | Teacher                         |
| -------------------------- | ---------------------------------------------- | ------------------------------- |
| `profiles`                 | read own; update display name/opt-out only     | read all; update all (service role for role/username) |
| `sessions`                 | read (attendance code column is **not granted**) | full access; codes via RPC/service role |
| `attendance`               | read own; writes only through `mark_attendance()` | full access (manual marking)   |
| `assignments`              | read                                           | full access                     |
| `submissions`              | read own; insert own before deadline (grading columns must be empty) | read/write all |
| `submission_similarity`    | no access                                      | full access                     |
| `announcements`            | read                                           | full access                     |
| `badges` / `student_badges`| badges read; own awards read                   | full access                     |
| `points_config`            | read                                           | update                          |
| `leaderboard` (view)       | `rank`, `display_name`, `points`, `weekly_points`, `weekly_rank` only; opted-out students excluded | same |
| `storage.objects`          | upload/read only under `<auth.uid()>/…` and `.cpp` | read/delete all              |

Additional notes:

- `mark_attendance(code)` is a definer RPC: it only inserts the caller’s own row,
  only while the code is active, and never exposes other students’ attendance.
- `generate_attendance_code(session, minutes)` is definer + admin-only; a new code
  immediately replaces the previous one and expires after the chosen window (1–240 min).
- `admin_session_overview()` and `admin_student_metrics()` are definer RPCs that
  re-check `is_admin()`; students get `forbidden`, and the metrics include only
  aggregate attendance/score values.
- `admin_assignment_overview()` is a definer RPC that re-checks `is_admin()`;
  it returns per-assignment counts, class size and the class average. Students
  get `forbidden`.
- `admin_analytics()` and `admin_similarity_pairs(assignment)` are definer RPCs that
  re-check `is_admin()`; the first returns aggregates only, the second joins both
  students’ names/codes for a stored pair.
- CSV exports never expose a route: each one is a server action that checks the caller’s
  role, reads through the RLS-scoped client and returns the file body for a Blob download.
- `my_standing(period)` returns the caller’s own rank / gap to the next rank.
  Phase 4’s `my_breakdown()` supersedes it in the UI and additionally returns the
  points components, streaks and visibility flags (always just one row: the caller).
- `leaderboard_page(period)` is a definer RPC that returns only `rank`,
  `display_name`, `points` and `is_me`; it excludes opted-out students and returns
  no rows at all while the teacher has hidden the board.
- `my_progress_weeks(weeks)` and `admin_points_overview()` are read-only definer RPCs;
  the admin one re-checks `is_admin()` (students get `forbidden`).
- `points_config` is readable by all authenticated users and updatable by admins only.
  Badge awarding runs in definer triggers and is idempotent; the helper functions are
  revoked from `anon`/`authenticated`.
- AI grading writes only through the service-role client after an explicit admin
  check. The queue claim uses `grading_attempts` + `grading_locked_at`, so two
  workers cannot grade the same row; stale locks (2 min) are reclaimed.
- Teacher review may update `final_score`, `status`, `graded_by` and `reviewed_at`;
  `graded_by` is constrained to `ai` / `teacher`. Students have no UPDATE policy.
- Flagged submissions are excluded from points and class averages until graded.
- Students see file downloads through short-lived signed URLs; the bucket stays private.
- Students have no UPDATE/DELETE policy on `submissions`, so grades are immutable
  to them. Column grants also block writing `ai_score` / `final_score` on insert.
- `student_points()` is revoked from `authenticated`; only the leaderboard view
  and `my_standing()` (both definer-owned) can call it.
- The `submissions` bucket is private; use signed URLs in Phase 3.

### Known limits

- The login, upload and check-in rate limiters are in-memory (best-effort per
  serverless instance). Use Upstash Redis if you need hard limits.
- Gemini grading runs inline (one attempt per upload; up to 3 per teacher click)
  to fit the 60 s serverless limit. Very large classes should use a cron/queue
  worker instead of the "Grade queued" button.
- Attendance codes are short-lived by design. If a code leaks, generate a new one;
  the old code stops working immediately.
- Password reset by the teacher does not revoke existing sessions; Supabase refresh
  tokens expire normally. Add `signOut(userId, 'global')` if that becomes a requirement.
- CSV import creates users sequentially/concurrently (5 at a time); very large
  classes should be split into batches of 200.

---

## 6. Project structure

```
src/
  app/
    [locale]/
      layout.tsx            # <html lang/dir>, fonts, theme script, i18n provider
      page.tsx              # role-aware redirect
      login/                # login page + server action + form
      (app)/                # authenticated shell (navbar + guards)
        dashboard/          # student stats + live attendance banner
        progress/           # points, weekly chart, breakdown, badges
        leaderboard/        # weekly / all-time board (both roles)
        assignments/        # student list + detail, upload, feedback
        attendance/         # student session history
        check-in/           # code entry (QR links land here)
        profile/
        admin/
          page.tsx
          analytics/        # totals, weekly attendance, grades, at-risk list
          announcements/    # list + create; [id] = edit/delete
          points/           # points rules, weekly reset, badge recalc, table
          students/         # create, CSV import/export, search, reset password
          sessions/         # list + create; [id] = code/QR + manual attendance
          assignments/      # list + create; [id] = stats, edit, queue;
                            # [id]/submissions/[submissionId] = review/override
  components/
    code-countdown.tsx      # live expiry timer
    check-in-form.tsx
    upload-submission-form.tsx
    points/{weekly-chart,breakdown-bars,badge-grid}.tsx
    admin/{attendance-form,code-panel,code-controls,create-session-form,
           assignment-form,grade-pending-button,grade-submission-button,
           review-form,points-config-form,reset-week-button,
           recalculate-badges-button,announcement-form,
           delete-announcement-form,similarity-panel,
           csv-download-button,...}.tsx
  actions/{auth,students,sessions,attendance,assignments,submissions,grading,points,
           announcements,exports,similarity}.ts
  i18n/                     # next-intl routing / request / navigation
  lib/
    auth.ts                 # cached user/profile + requireProfile/requireAdmin
    supabase/{client,server,admin}.ts
    students.ts             # service-role account creation (admin-only callers)
    grading/
      gemini.ts             # REST client, strict JSON schema, retries/timeouts
      service.ts            # queue claim, grade one/batch, status
      prompt.ts             # bilingual grading prompt + injection guard
      schema.ts             # zod grading response
      mock.ts               # deterministic dev grader
    validation.ts           # zod schemas
    rate-limit.ts
    csv.ts
    csv-export.ts            # RFC-4180 CSV with BOM + CRLF
    similarity.ts            # token shingles + Jaccard (pure, testable)
  middleware.ts             # locale + session refresh + role route protection
supabase/migrations/        # full schema, RLS, storage, phase 2/3/4/5 RPCs
scripts/seed.mjs            # demo teacher/students/sessions
messages/{en,ar}.json
```

---

## 7. Deploy to Vercel

1. Push the repository to GitHub/GitLab.
2. Import it in Vercel; the framework preset is detected automatically.
3. Add the environment variables from section 4 (mark service role + Gemini as
   sensitive; do not use `NEXT_PUBLIC_` for them). Node 20+ is required.
4. Deploy, then add the deployment URL to Supabase **Authentication → URL
   Configuration** (Site URL + redirect URLs).
5. Run the seed only if you want demo data in production:
   `npm run seed` locally with the production keys, or keep production clean and
   create the teacher account manually.

No `vercel.json` is needed. The app uses the Node.js runtime for server actions and
dynamic rendering everywhere (all pages depend on auth cookies).

### Launch checklist

1. **Supabase**: all six migrations applied; “Allow new users to sign up” **off**;
   Site URL + redirect URLs point at the production domain; storage bucket `submissions`
   exists (private, 100 KB limit).
2. **Secrets**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (server-only) and `AI_API_KEY` + `AI_BASE_URL` set in Vercel; no
   secrets in the client bundle (`NEXT_PUBLIC_` prefix only for the first two).
3. **First login**: create the teacher account (seed or manually through Supabase
   Auth), sign in, and change the demo password immediately from **Profile**.
4. **Smoke test in production**: log in as teacher and student; create a session,
   check in with the code, upload a `.cpp`, grade it, run a similarity check, export
   one CSV, open `/en` and `/ar` once each.
5. **Backups**: enable Supabase daily backups (paid tiers) or schedule `pg_dump`;
   the submissions bucket is the only file store — include it in any backup plan.

---

## 8. Roadmap

- **Phase 1:** foundation, SQL + RLS, auth, admin students, profiles, dashboards, i18n.
- **Phase 2:** sessions, rotating attendance codes + QR, self check-in UI, manual attendance, students table metrics.
- **Phase 3:** assignments, `.cpp` uploads, Gemini grading (strict JSON, retries, queue),
  admin review/override, per-student rate limits.
- **Phase 5:** similarity checking, announcements CRUD, CSV exports, analytics, i18n polish.
- **Phase 6 (this):** accessibility pass, seed enrichment for the analytics views, launch checklist.
