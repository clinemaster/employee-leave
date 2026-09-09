# NAOT Digital Leave Management System — Backend API

Django REST Framework backend. Base URL in dev: `http://localhost:8000/api/`.
Auth: JWT (djangorestframework-simplejwt), `Authorization: Bearer <access>`.

All list endpoints are paginated (`PageNumberPagination`, `page_size=25`):
`{"count", "next", "previous", "results": [...]}`.

## Auth

### POST /api/auth/login/
Body: `{"username": "...", "password": "..."}`
Response: `{"access": "...", "refresh": "...", "user": {UserSerializer}}`

### POST /api/auth/refresh/
Body: `{"refresh": "..."}` -> `{"access": "..."}`

### GET /api/users/me/
Returns the current authenticated user's profile (`UserSerializer`).

## Users (SYSTEM_ADMIN write, self-read via /me/)

`GET|POST /api/users/`, `GET|PUT|PATCH|DELETE /api/users/{id}/`

`UserSerializer` fields: `id, username, full_name, email, official_email, role,
check_number, personnel_file_number, designation, station, department,
section, unit, manager, phone_number, date_of_first_appointment, is_active`.

`role` choices: `EMPLOYEE, HEAD_OF_DEPARTMENT, HEAD_OF_SECTION, HEAD_OF_UNIT,
HR_ADMIN, AUTHORIZING_OFFICER, SYSTEM_ADMIN`.

`manager` is the FK used for HOD routing (an employee's `manager` is the HOD
whose queue their applications land in).

## Organization (read: any authenticated user; write: SYSTEM_ADMIN)

- `GET|POST /api/departments/`, `.../{id}/` — `{id, name, code, is_active}`
- `GET|POST /api/sections/`, `.../{id}/` — `{id, name, code, department, is_active}`
- `GET|POST /api/units/`, `.../{id}/` — `{id, name, code, section, is_active}`
- `GET|POST /api/stations/`, `.../{id}/` — `{id, name, code, address, is_active}`

## Leave types & holidays (read: any; write: SYSTEM_ADMIN)

- `GET|POST /api/leave-types/`, `.../{id}/` — `{id, name, code, is_active, sort_order}`
- `GET|POST /api/holidays/`, `.../{id}/` — `{id, date, name, is_recurring}`

## Working-days preview

### POST /api/working-days-preview/
Body: `{"start_date": "2026-09-10", "end_date": "2026-09-20"}`
Response: `{"working_days": 8}`

Server-authoritative: excludes Saturdays/Sundays and `Holiday` dates
(including recurring holidays applied to every year in range). This is the
exact same calculation used when an application is created/updated
(`total_working_days` on the application).

## Leave Balances (read-only via API)

`GET /api/leave-balances/` — employees see only their own; HR_ADMIN,
AUTHORIZING_OFFICER, SYSTEM_ADMIN see all. Filter: `?employee=&leave_type=&period=`.

## Leave Applications

Base: `/api/leave-applications/`

Row-level access (IDOR protection) — a user only ever sees applications
where: they are the applicant, OR (if HOD/HOS/HOU) the applicant's
`manager` is them, OR they hold HR_ADMIN/AUTHORIZING_OFFICER/SYSTEM_ADMIN
(org-wide visibility). Fetching an application outside this set returns 404.

### GET /api/leave-applications/
List, filtered to the above. Query params: `?status=&leave_type=&employee=`.

### POST /api/leave-applications/
Employee-only. Creates a `DRAFT` application. Body = Section A fields (see
below) + optional `dependants: [{name, relationship, date_of_birth}]`.
`employee` is always set server-side to the requesting user — never trust
a client-supplied employee id.

### GET /api/leave-applications/{id}/
Full nested read: Section A fields + `recommendation` (B1) + `hr_review`
(B2) + `approval` (C) + `dependants` + `working_days_preview` (live
recompute) + `total_working_days` (persisted value as of last save).

### PUT/PATCH /api/leave-applications/{id}/
Section-scoped edit, enforced server-side regardless of what the frontend
sends:
- **EMPLOYEE** (application owner): may edit Section A fields only, and
  only while status is `DRAFT` or `RETURNED_TO_EMPLOYEE`.
- **HOD/HOS/HOU**: not handled by this endpoint — use `/recommend/` or
  `/return/` (Section B1 is written as part of those actions).
- **HR_ADMIN** / **AUTHORIZING_OFFICER**: not handled by this endpoint —
  use `/verify/` / `/return/` and `/approve/` / `/deny/`.

Section A fields: `vote_code, sub_vote, check_number, personnel_file,
full_name, designation, station, division_department, phone_number, email,
contact_address, leave_type, leave_number, travel_assistance, start_date,
last_date, dependants`.

Sending a field outside your authorized section returns
`403 {"detail": "You may only edit Section A fields. Disallowed: [...]"}`
(or the equivalent for B1/B2/C).

### Workflow actions (all `POST`, body `{comments?, decision?, signature_name?, signature_designation?}`)

| Endpoint | Allowed from status | Allowed role | Effect |
|---|---|---|---|
| `.../submit/` | DRAFT, RETURNED_TO_EMPLOYEE | applicant | -> PENDING_HOD_REVIEW |
| `.../recommend/` | PENDING_HOD_REVIEW | routed HOD/HOS/HOU | writes Section B1 (`recommendation`), -> HOD_RECOMMENDED -> (auto) PENDING_HR_REVIEW |
| `.../return/` | PENDING_HOD_REVIEW | routed HOD/HOS/HOU | -> RETURNED_TO_EMPLOYEE |
| `.../verify/` | PENDING_HR_REVIEW | HR_ADMIN | writes Section B2 (`hr_review`), -> HR_VERIFIED -> (auto) PENDING_AUTHORIZATION |
| `.../approve/` | PENDING_AUTHORIZATION | AUTHORIZING_OFFICER | writes Section C (`approval`, approved=true), -> APPROVED |
| `.../deny/` | PENDING_AUTHORIZATION | AUTHORIZING_OFFICER | writes Section C (`approval`, approved=false), -> DENIED |
| `.../generate-pdf/` | APPROVED | applicant, HR_ADMIN, AUTHORIZING_OFFICER | renders 2-page PDF, stores `LeaveDocument`, -> PDF_GENERATED |

`decision` in the body is a boolean used by `/recommend/` (recommended?)
and `/verify/` (verified?); `/approve/` and `/deny/` set it automatically.
Every transition writes one `AuditLog` row (previous/new status, user,
role, timestamp, comments) and creates `Notification` row(s) for the
relevant user(s) — see `apps/leave/workflow.py`.

Invalid transitions (wrong status, wrong role/routing) return
`400`/`403` and nothing is written (whole transition runs in one DB
transaction).

### GET /api/leave-applications/{id}/documents/
Returns `[{id, application, document_type, file, generated_by, is_active,
created_at}, ...]` — generated PDFs (and any future supporting
attachments) for this application.

### GET /api/leave-applications/{id}/audit-trail/
Returns `[{id, application, user, user_name, role, action,
previous_status, new_status, timestamp, comments}, ...]`, newest first.

## Notifications

- `GET /api/notifications/` — current user's notifications (`?is_read=`)
- `POST /api/notifications/{id}/read/` — mark one read
- `POST /api/notifications/mark-all-read/`

`Notification` fields: `id, message, is_read, related_application, created_at`.

## Status enum (`LeaveApplication.status`)

`DRAFT, SUBMITTED, PENDING_HOD_REVIEW, HOD_RECOMMENDED,
RETURNED_TO_EMPLOYEE, PENDING_HR_REVIEW, HR_VERIFIED, RETURNED_TO_HOD,
PENDING_AUTHORIZATION, APPROVED, DENIED, PDF_GENERATED, COMPLETED, ARCHIVED`

Note: `SUBMITTED` is transient — `/submit/` moves straight to
`PENDING_HOD_REVIEW` in the same transaction (the "SUBMITTED" audit
action is still logged separately for traceability). `RETURNED_TO_HOD`
and `COMPLETED`/`ARCHIVED` transitions exist in the state machine
(`apps/leave/workflow.py`) but do not yet have dedicated REST actions
wired up in phase 1 — see "Deferred" below.

## Deferred to a later phase (do not assume these exist)

- Real SMTP email sending — notifications are in-app only; email sending
  is stubbed behind a function point in `apps/notifications` for later
  wiring to Django's email backend.
- Real Government emblem / NAOT logo artwork — PDF uses placeholder
  images at `backend/apps/documents/assets/*.png`.
- Digital signatures / DSMS / cryptographic signing — explicitly out of
  scope; PDF signature areas are blank lines only.
- Dedicated REST actions for `RETURNED_TO_HOD -> PENDING_HR_REVIEW`
  (HOD resubmit-to-HR) and `PDF_GENERATED -> COMPLETED -> ARCHIVED` —
  the state machine supports these transitions but they aren't yet
  exposed as endpoints.
- Full reporting/export endpoints, bulk operations, extensive automated
  test suite.
