# HANDOFF — CS Sessions Hub (Teacher-Side Fixes)

Generated 2026-11-21, updated 2026-11-25. Branch `feature/self-signup`, working tree clean.  
Latest work: analytics null-array fix, direct-to-storage material uploads, hardened account deletion.  
`npx tsc --noEmit` passes; `npm run check:i18n` passes (924 keys, EN/AR parity); `npm run build` passes. **No secret values are included here.**

---

## 1. PROJECT

**CS Sessions Hub** — bilingual (EN/AR, full RTL) class hub for C++ fundamentals: attendance, assignments, AI feedback, points, badges, privacy-safe leaderboard.

**Stack**: Next.js 15.5.29 (App Router, React 19.3, TypeScript strict), Supabase (`@supabase/ssr` + Postgres/RLS/Storage), `next-intl` 4.15 (cookie locale, RTL), Tailwind 4, zod, Google Gemini → **now Kilo Code (OpenAI-compatible)** grading, qrcode, sharp.

**Layout**:
```
src/app/[locale]/login | signup | verify-email          # public auth screens
src/app/[locale]/(app)/...                              # authenticated shell + pages
src/app/api/auth/resend-otp/route.ts                    # only API route
src/actions/*                                           # server actions
src/components/                                         # UI, incl. turnstile-widget.tsx
src/lib/{auth,validation,rate-limit,turnstile,env,env-client,types}.ts
src/lib/supabase/{client,server,admin}.ts
src/lib/grading/{provider,service,schema,prompt,mock}.ts  # AI grading pipeline
src/middleware.ts                                       # locale + role + verification gate
messages/{en,ar}.json (859 keys each) · supabase/migrations/ (17 files)
```

**Run locally**:
```bash
npm run dev          # http://localhost:3000 (requires .env.local)
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run check:i18n   # node scripts/check-i18n-usage.mjs
npm run seed         # npm run seed (needs .env.local)
```

**Deploy**: Vercel (auto-deploy on push to `feature/self-signup`).  
Supabase: hosted project `bweewmzvwfpjkncygpez.supabase.co`.

---

## 2. DECISIONS MADE (Must Never Be Undone)

1. **Teachers/admins record attendance** by entering student IDs per session. Students cannot record attendance; they only see read-only attendance and points.
2. **Roles** come from `profiles.role` (`student`/`teacher`/`admin`) loaded on the server; nav differs per role; teacher routes are protected; teachers are excluded from the leaderboard.
3. **Theme**: Egypt navy `#0B3C6F` and bronze `#B58A5B`, dark and light. No purple.
4. **Logos**: `public/brand/logo-dark-*` in dark mode, `logo-light-*` in light mode.
5. **Assignments** accept file upload, pasted code text, or both; one shared grading function; student code is treated as data, never executed.
6. **Self-signup**: 8-digit email code; `student_code` (CS-XXXX) auto-generated; role always `student`; teachers/admins created only by admin; username login still works for legacy `@cshub.local` accounts.
7. **i18n**: no `.` inside key names (nested objects only); every key in BOTH `en.json` and `ar.json`.
8. **AI grading**: provider-agnostic, OpenAI-compatible (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`), server-side only, structured JSON output, clamps score 0..max_score.
9. **Teacher access**: teachers can grade, review, view analytics, manage sessions/assignments/announcements, record attendance. Admin-only: student management (`/admin/students`), points config (`/admin/points`).
10. **Storage**: text submissions have `file_path = NULL`; only file uploads get Storage signed URLs.

---

## 3. DONE (Files Changed & Migrations)

### Core Code Changes

| File | Change |
|------|--------|
| `src/lib/turnstile.ts` | Trim secret/site keys; log config presence; explicit `invalid-input-secret` handling |
| `src/app/[locale]/login/actions.ts` | Log token receipt + verification result |
| `src/lib/grading/provider.ts` | **New file** — OpenAI-compatible provider (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`); logs full URL, model, provider response body; explicit 404 handling; clamps score 0..max |
| `src/lib/grading/service.ts` | Switch from `gemini.ts` to `provider.ts`; `gradingStatus()` returns real model |
| `src/actions/grading.ts` | `isCurrentUserStaff()` (admin \| teacher); uses `createAdminClient` for grading |
| `src/actions/assignments.ts` | `reviewSubmissionAction` uses `isCurrentUserStaff()` + `createAdminClient` |
| `src/actions/similarity.ts` | `runSimilarityCheckAction` etc. use `isCurrentUserStaff()` |
| `src/actions/grading.ts` | `gradePendingAction`, `gradeSubmissionAction` use `isCurrentUserStaff()` |
| `src/lib/auth.ts` | Added `requireStaff` (alias for `requireTeacher`) |
| `src/app/[locale]/(app)/admin/page.tsx` | `requireStaff` |
| `src/app/[locale]/(app)/admin/analytics/page.tsx` | `requireStaff` + dev error display |
| `src/app/[locale]/(app)/admin/assignments/page.tsx` | `requireStaff` + dev error display |
| `src/app/[locale]/(app)/admin/assignments/[id]/page.tsx` | `requireStaff` + dev error display for similarity/overview |
| `src/app/[locale]/(app)/admin/assignments/[id]/submissions/[submissionId]/page.tsx` | **Guard `createSignedUrl` with `submission_type === 'file' && file_path`** |
| `src/app/[locale]/(app)/admin/assignments/[id]/page.tsx` | Error logging for RPCs |
| `src/app/[locale]/(app)/admin/attendance/page.tsx` | Only query attendance when session selected; dev error logging |
| `src/app/[locale]/(app)/admin/admin-attendance-client.tsx` | Accepts `errorMessage` prop; shows in dev |
| `src/app/[locale]/(app)/admin/announcements/page.tsx` | `requireStaff` |
| `src/app/[locale]/(app)/admin/announcements/[id]/page.tsx` | `requireStaff` |
| `src/app/[locale]/(app)/admin/sessions/page.tsx` | `requireStaff` |
| `src/app/[locale]/(app)/admin/sessions/[id]/page.tsx` | `requireStaff` |
| `src/lib/grading/gemini.ts` | **Deprecated** — kept for reference, no longer imported |
| `src/lib/grading/config.ts` | Removed (merged into `provider.ts`) |
| `.env.example` | Added `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_MOCK`; deprecated `GEMINI_*` |

### Migrations Created (Local)

| File | Purpose |
|------|---------|
| `20261120000001_teacher_attendance_access.sql` | Attendance RLS for teachers (`is_teacher_or_admin`) |
| `20261120000002_lookup_email_by_username.sql` | `get_email_by_username` RPC (anon + authenticated) |
| `20261121000001_fix_submission_insert.sql` | `file_path` nullable; `submission_type` in student insert grant |
| `20261121000002_fix_teacher_rpc_access.sql` | `admin_assignment_overview`, `admin_list_sessions` → `is_teacher_or_admin` |
| `20261121000002_fix_teacher_similarity_access.sql` | `admin_similarity_pairs` → `is_teacher_or_admin` |
| `20261121000003_fix_teacher_profile_access.sql` | Profiles SELECT policy → `is_teacher_or_admin` |
| `20261121000004_fix_remaining_admin_rpcs.sql` | `admin_session_overview`, `admin_student_metrics`, `admin_analytics`, `admin_points_overview` → `is_teacher_or_admin` (drop + create with unique delimiters) |
| `20261124000001_fix_staff_rls_and_rpcs.sql` | **New.** Corrects `admin_analytics` (`av.avg_percent`), corrects `admin_points_overview` ambiguity, teacher SELECT on `submissions`, staff policies on `submission_similarity` and storage, staff `generate_attendance_code`, announcements staff RLS. |
| *(renamed)* `20260615000000_text_submission.sql` → `20260615000001_text_submission.sql`; `20261121000002_fix_teacher_similarity_access.sql` → `20261121000005_...` | Duplicate migration version numbers fixed. |

### 2026-11-24 follow-up (UI-only)

| File | Change |
|------|--------|
| `src/actions/sessions.ts`, `assignments.ts`, `announcements.ts`, `similarity.ts`, `exports.ts` | Gate changed from admin-only to staff (admin \| teacher). |
| `src/actions/attendance.ts` | Bulk lookup splits UUIDs vs student codes (no uuid cast error). |
| `src/app/[locale]/(app)/admin/attendance/page.tsx` | Loads attendance for the default session. |
| `src/app/[locale]/(app)/admin/admin-attendance-client.tsx` | Textarea moved inside the record form. |
| `src/app/[locale]/(app)/check-in/page.tsx` + `check-in-form.tsx` | **New** check-in page + form using `checkInAction`. |
| `src/components/site-header.tsx` | Students/Points nav hidden from teachers; Check in link for students. |
| `src/app/[locale]/(app)/admin/page.tsx` | Admin-only cards hidden from teachers. |
| `src/app/[locale]/(app)/dashboard/page.tsx` | Check-in link in active-session card. |
| `messages/en.json`, `messages/ar.json` | Nav key `checkIn`; GEMINI wording → `AI_API_KEY`/`AI_BASE_URL`. |
| `README.md`, `src/lib/grading/mock.ts` | GEMINI wording → AI_* wording. |
| `src/app/[locale]/(app)/profile/*`, `src/app/[locale]/reset-password/*`, `src/middleware.ts` | Self-service password change via verification email (requestPasswordChangeAction + reset-password page). |

### 2026-11-25 fixes

| File | Change |
|------|--------|
| `src/actions/materials.ts` | **New** `createMaterialUploadUrlAction` (staff-gated signed upload URL). `addMaterialAction` no longer reads file bytes; it accepts `file_path` + `mime_type` and validates the path belongs to the session. |
| `src/components/admin/materials-panel.tsx` | Browser uploads via `supabase.storage.upload()` (standard multipart endpoint). Signed-URL PUTs were observed to land the file but never return a response for larger payloads, leaving the form stuck on "Saving…". |
| `src/lib/materials.ts` | **New** shared bucket name, 50 MB limit, filename sanitizer. |
| `src/actions/students.ts` | Delete now logs the full auth error (`message/status/name/code`), verifies the profile cascade ran, and cleans up a leftover profile. |
| `supabase/migrations/20261125000002_harden_handle_new_user.sql` | **New** `handle_new_user` requires `username` + `full_name` metadata. Stops silent `"Student"` placeholder profiles when `generateLink`/dashboard creates a user without metadata. |
| `src/app/[locale]/(app)/admin/analytics/page.tsx` | Null-safe `weeks`/`grades`/`at_risk`; Attendance/Average show `—` instead of `NaN%` when the RPC omits totals. |
| `messages/en.json`, `messages/ar.json` | `admin.session.errors.uploadUrlFailed`; `admin.students.role`. |

Note: `check-in` and `/reset-password` were removed earlier (OTP password change and manual attendance only).

---

## 4. IN PROGRESS / BROKEN — Root Causes & Evidence

### ERROR 1: Turnstile `invalid-input-secret` on every login
**Log**: `[Turnstile] Verification response: { success: false, errorCodes: ['invalid-input-secret'] }`  
**Root cause**: `TURNSTILE_SECRET_KEY` in Vercel Production scope has whitespace/newline, or secret/site key swapped, or keys from different Cloudflare widgets, or not redeployed after setting.  
**Evidence**: `src/lib/turnstile.ts:22-23` reads `process.env.TURNSTILE_SECRET_KEY` without `.trim()` (now fixed).  
**Status**: Code fix deployed; must verify Vercel env vars and redeploy.

### ERROR 2: AI Grading 404
**Log**: `AI grading failed with status 404 (attempt 1)`  
**Root cause**: Wrong `AI_BASE_URL` path or unknown model ID; no response body logged.  
**Evidence**: `src/lib/grading/provider.ts:197` builds `${config.baseUrl}/chat/completions`; line 225 only logged status.  
**Fix deployed**: Logs full URL, model, provider response body; explicit 404 handling.  
**Status**: Code fix deployed; must set Vercel env vars `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`.

### ERROR 3: Storage Crash on Text Submissions
**Log**: `TypeError: Cannot read properties of null (reading 'replace') at bb._getFinalPath`  
**Root cause**: `createSignedUrl(data.file_path)` called with `null` for text submissions (where `file_path` is NULL).  
**Evidence**: `src/app/[locale]/(app)/admin/assignments/[id]/submissions/[submissionId]/page.tsx:86-88` called `createSignedUrl(data.file_path)` unconditionally.  
**Fix deployed**: Guard with `submission_type === 'file' && file_path`.

### ERROR 4: Similarity Pairs "Could not load similarity pairs"
**Root cause**: RPC `admin_similarity_pairs` checks `is_admin()` only.  
**Evidence**: Migration `20261121000002_fix_teacher_similarity_access.sql` updates to `is_teacher_or_admin()` — **must be run in Supabase**.

### ERROR 5: Attendance / Review Pages for Teachers
**Root cause**: Multiple admin RPCs (`admin_session_overview`, `admin_student_metrics`, `admin_analytics`, `admin_points_overview`) and `profiles` SELECT policy check `is_admin()` only.  
**Evidence**: Migrations `20261121000003_fix_teacher_profile_access.sql` and `20261121000004_fix_remaining_admin_rpcs.sql` fix these — **must be run in Supabase**.

---

## 5. DATABASE STATE

### Migrations (Local, 19 files)
```
20260101000000_init.sql
20260101000100_reference_data.sql
20260201000000_phase2.sql
20260301000000_phase3.sql
20260401000000_phase4.sql
20260501000000_phase5.sql
20260601000000_phase6_attendance_teacher_role.sql
20260615000000_self_signup.sql
20260615000001_text_submission.sql
20261120000001_teacher_attendance_access.sql
20261120000002_lookup_email_by_username.sql
20261121000001_fix_submission_insert.sql
20261121000002_fix_teacher_rpc_access.sql
20261121000003_fix_teacher_profile_access.sql
20261121000004_fix_remaining_admin_rpcs.sql
20261121000005_fix_teacher_similarity_access.sql
20261124000001_fix_staff_rls_and_rpcs.sql
20261125000001_session_materials.sql
20261125000002_harden_handle_new_user.sql
```

### Hosted Supabase — verified 2026-11-25
- All migrations **through `20261125000001_session_materials.sql` are applied** (probed directly: `session_materials` table, `session-materials` bucket = private/50 MB/all MIME, staff upload, student SELECT + signed URLs, `admin_analytics`, `admin_points_overview`, `admin_list_sessions`, `admin_student_metrics`, `get_email_by_username`, text-submission columns, `announcements.pinned`, `profiles.email`).
- **Still to run**: `supabase/migrations/20261125000002_harden_handle_new_user.sql` (metadata guard). Run it in the Supabase SQL Editor.
- `admin_analytics` returns `null` for `grades`/`at_risk` when there is no data — the page now handles this.

---

## 6. ENV VARS (Names Only)

| Variable | Where | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Local + Vercel | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Local + Vercel | |
| `SUPABASE_SERVICE_ROLE_KEY` | Local + Vercel | **Secret** |
| `GEMINI_API_KEY` | Local + Vercel | Legacy (deprecated) |
| `GEMINI_MODEL` | Local + Vercel | Legacy |
| `GEMINI_MOCK` | Local + Vercel | Dev only |
| `AI_API_KEY` | Local + Vercel | **Secret** — Kilo/OpenAI key |
| `AI_BASE_URL` | Local + Vercel | e.g., `https://api.kilo.ai/v1` |
| `AI_MODEL` | Local + Vercel | e.g., `kilo-code-v1` |
| `AI_MOCK` | Local + Vercel | Dev only (`1` = mock) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Local + Vercel | Cloudflare site key |
| `TURNSTILE_SECRET_KEY` | Local + Vercel | **Secret** — Cloudflare secret |
| `NEXT_PUBLIC_SITE_URL` | Local + Vercel | e.g., `https://cs-sessions-hub.vercel.app` |
| `SEED_ADMIN_PASSWORD` | Local + Vercel | **Secret** — `npm run seed` only |
| `SEED_STUDENT_PASSWORD` | Local + Vercel | **Secret** — `npm run seed` only |

**Critical**: `TURNSTILE_SECRET_KEY` must be **trimmed** (no whitespace/newline). `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` must come from the **same Cloudflare Turnstile widget**. Domain in widget must include Vercel domain.

---

## 7. NEXT STEPS (Ordered)

1. **Run SQL in Supabase** (see section 5) — 5 separate executions.
2. **Set Vercel env vars** (Production scope): `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_MOCK=0`, verify `TURNSTILE_SECRET_KEY` (no whitespace), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_SITE_URL=https://cs-sessions-hub.vercel.app`.
3. **Redeploy on Vercel** (push or manual redeploy).
4. **Verify Cloudflare Turnstile**: Widget → Domains → add `cs-sessions-hub.vercel.app` (and `localhost` for dev).
5. **Test as teacher "mohamed"**:
   - [ ] Login → Turnstile works
   - [ ] `/admin/assignments` → list loads, overview stats show
   - [ ] "Grade N queued" → works, shows real provider error if fails
   - [ ] `/admin/assignments/[id]/submissions/[id]` → opens, code renders, AI feedback shows, teacher can override grade
   - [ ] `/admin/attendance` → sessions dropdown loads, student list loads, can record by IDs
   - [ ] Assignment detail → "Similarity" section loads pairs with student names
   - [ ] `/admin/analytics` → totals, weeks, grades, at-risk load
   - [ ] Student login → only own data visible
   - [ ] Set invalid `AI_API_KEY` → grading shows real provider error, submission stays pending

---

## 8. GOTCHAS

1. **RLS + Service Role**: Teacher pages use `createClient()` (user session) for reads, but **writes** (grading, review, attendance recording) must use `createAdminClient()` (service role) to bypass RLS. The code now does this for grading/review actions.

2. **Turnstile Secret Whitespace**: Vercel env var UI sometimes adds trailing newline. `.trim()` added in code, but fix in Vercel UI too.

3. **Turnstile Keys Must Match**: Site key and secret must come from **same Cloudflare Turnstile widget**. Domain in widget must include Vercel domain.

4. **Supabase RPCs & `is_teacher_or_admin()`**: The function `public.is_teacher_or_admin()` exists in `20260601000000_phase6_attendance_teacher_role.sql` and `20261120000001_teacher_attendance_access.sql`. If missing, create it.

4. **AI Provider Config**: `AI_BASE_URL` must end with `/v1` or not? Code does `${config.baseUrl.replace(/\/$/, "")}/chat/completions` — both work.

5. **AI Grading 404**: Usually wrong `AI_BASE_URL` path (missing `/v1`) or unknown `AI_MODEL`. Log now shows full URL + response body.

6. **Storage `file_path` NULL**: Text submissions have `file_path = NULL`. Code now guards `createSignedUrl` with `submission_type === 'file' && file_path`.

6. **PostgREST Schema Cache**: After running SQL, always run `notify pgrst, 'reload schema';`.

7. **i18n Parity**: Run `npm run check:i18n` after any message changes. 858 keys each locale, 0 mismatches.

8. **Role Checks**: `requireAdmin` = admin only; `requireTeacher` = admin + teacher; `requireStaff` = alias for `requireTeacher`. Use `requireStaff` for panel pages teachers should access.

9. **Migration Delimiters**: When running multiple `CREATE FUNCTION` in one batch, use unique dollar-quote delimiters (`$name$`) or run each separately.

10. **Vercel Redeploy**: After env var changes, **must redeploy** (Vercel Dashboard → Deployments → ⋯ → Redeploy → Production).

---

## UNCOMMITTED CHANGES

```
$ git status
On branch feature/self-signup
Your branch is up to date with 'origin/feature/self-signup'.

nothing to commit, working tree clean

$ git diff --stat
(no output)
```

All changes committed. Ready for next session.

---

**End of HANDOFF.md**