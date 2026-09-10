# NAOT Digital Leave Management System — Backend API

Django REST Framework backend. Base URL in dev: `http://localhost:8000/api/`.
Auth: JWT (djangorestframework-simplejwt), `Authorization: Bearer <access>`.

All list endpoints are paginated (`PageNumberPagination`, `page_size=25`):
`{"count", "next", "previous", "results": [...]}`.

## Interactive API docs (Swagger / OpenAPI)

Generated automatically from the actual DRF views/serializers via
[drf-spectacular](https://drf-spectacular.readthedocs.io/), so it can't drift
from this hand-written document the way a manually maintained spec can:

- **`GET /api/docs/`** — Swagger UI (try-it-out console; "Authorize" button
  accepts a JWT access token, scheme `Bearer`).
- **`GET /api/redoc/`** — ReDoc, a read-only reference layout some prefer for
  browsing.
- **`GET /api/schema/`** — the raw OpenAPI 3 schema (YAML), importable into
  Postman/Insomnia or any OpenAPI-based tooling.

All three are intentionally public (`AllowAny`) even though the rest of the
API defaults to `IsAuthenticated` — they describe endpoint shapes, not data,
and requiring a login just to read docs is poor DX. `apps/leave/tests/
test_openapi_schema.py` guards against the schema silently losing endpoints
or failing OpenAPI validation as the API evolves.

## Auth

### POST /api/auth/login/
Body: `{"username": "...", "password": "..."}`
Response: `{"access": "...", "refresh": "...", "user": {UserSerializer}}`
Throttled (default 5/min per client, env `THROTTLE_RATE_LOGIN`) — brute-force
protection. Returns `429` once exceeded, regardless of credential validity.

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

### POST /api/leave-types/reorder/
SYSTEM_ADMIN only. Bulk-updates `sort_order` for multiple leave types in one
atomic request (replaces sequential per-row `PATCH` calls from the frontend
drag-reorder UI).

Body: a non-empty JSON array of `{"id": <int>, "sort_order": <int>}` objects,
e.g.:
```json
[{"id": 3, "sort_order": 0}, {"id": 1, "sort_order": 1}, {"id": 2, "sort_order": 2}]
```
Response `200`: the reordered `LeaveTypeSerializer` list (ordered by the new
`sort_order`, ties by name), e.g.:
```json
[
  {"id": 3, "name": "Sick Leave", "code": "SICK", "is_active": true, "sort_order": 0},
  {"id": 1, "name": "Annual Leave", "code": "ANNUAL", "is_active": true, "sort_order": 1},
  {"id": 2, "name": "Maternity Leave", "code": "MATERNITY", "is_active": true, "sort_order": 2}
]
```
Validation (all `400`, nothing written on failure — atomic, all-or-nothing):
empty/non-list body, an entry missing `id`/`sort_order` or with non-integer
values, a duplicate `id` within the request, or an `id` that doesn't match
an existing (non-deleted) `LeaveType`. `403` for any role other than
SYSTEM_ADMIN.

## Working-days preview

### POST /api/working-days-preview/
Body: `{"start_date": "2026-09-10", "end_date": "2026-09-20"}`
Response: `{"working_days": 8}`

Server-authoritative: excludes Saturdays/Sundays and `Holiday` dates
(including recurring holidays applied to every year in range). This is the
exact same calculation used when an application is created/updated
(`total_working_days` on the application).

## Leave Policies (annual entitlement rules)

`GET|POST /api/leave-policies/`, `GET|PUT|PATCH|DELETE
/api/leave-policies/{id}/` — SYSTEM_ADMIN only (read and write; 403 for
everyone else, including HR_ADMIN). Filter: `?leave_type=&is_active=`.

`LeavePolicySerializer` fields: `id, leave_type, leave_type_name,
designation, min_years_of_service, max_years_of_service, annual_entitlement,
is_active, sort_order, description, created_at, updated_at`.

Admin-configurable rules that drive the entitlement engine (spec section 9's
"leave types are configurable" requirement): each rule maps a `leave_type` +
optional `designation` (job grade/title, matched case-insensitively/exactly
against `accounts.User.designation`; blank applies to all designations) +
optional tenure band (`min_years_of_service`/`max_years_of_service`,
inclusive; leave both blank for a flat rule that applies regardless of
tenure) to an `annual_entitlement` in days. For a given employee +
leave_type, every active rule whose designation (if set) and tenure band (if
set) both match is a candidate; the **most specific** candidate wins — one
matching both designation and tenure band beats one matching only tenure or
only designation, which beats a flat/all-designations rule. `sort_order`
(ties by `id`) is only the tiebreaker between equally-specific candidates —
it is no longer sufficient on its own to determine which rule wins when
rules of different specificity overlap. Tenure is computed from
`accounts.User.date_of_first_appointment`; an employee with no
`date_of_first_appointment` only matches flat (un-banded) rules regardless
of designation. If nothing matches, the system falls back to
`LEAVE_DEFAULT_ENTITLEMENT_DAYS` (env-configurable, default `28`) — this
never errors, even with zero policies configured. Implementation:
`apps/leave/entitlement.py`. `POST`/`PUT`/`PATCH` reject
`max_years_of_service < min_years_of_service` with `400`.

## Leave Balances

`GET /api/leave-balances/` — employees see only their own; HR_ADMIN,
AUTHORIZING_OFFICER, SYSTEM_ADMIN see all. Filter: `?employee=&leave_type=&period=`.

Balances are real, computed values (spec section 40), not hand-maintained
numbers: `taken` = sum of `total_working_days` across this employee's
applications whose Section C decision (`approval.approved`) is `True`;
`pending` = sum of `total_working_days` across applications currently
in-flight (`PENDING_HOD_REVIEW` through `PENDING_AUTHORIZATION`, plus
`HOD_RECOMMENDED`/`RETURNED_TO_HOD`); `remaining = opening_balance +
entitlement - taken - pending`. Recomputed automatically after every
workflow transition on the touched employee/leave_type/period
(`apps/leave/workflow.py` calls
`apps/leave/balances.py:recalculate_for_application`), so reads are always
current — no cron/background job needed.

`opening_balance`/`entitlement` are now auto-populated from the
`LeavePolicy` engine the first time a `LeaveBalance` row is created for an
employee/leave_type/period (`entitlement` from the matched policy or the
system default; `opening_balance` defaults to `0`, since there's no
prior-period carry-over yet). HR/admin may still hand-edit either field
(e.g. via Django admin or a direct update) after creation — recalculation
only ever touches `taken`/`pending`/`remaining` on an existing row, so a
manual override is never clobbered. The list response additionally
includes two read-only fields for comparison: `computed_entitlement` (what
the policy engine would currently compute, live) and
`is_entitlement_overridden` (`entitlement != computed_entitlement`).

### POST /api/leave-balances/recalculate/
Body: `{employee?, leave_type?, period?}` (all optional). Force-recomputes
from `LeaveApplication` history.
- Employees may only recalculate their own (server ignores a client-supplied
  `employee` for non-privileged callers).
- HR_ADMIN / AUTHORIZING_OFFICER / SYSTEM_ADMIN may target any employee, or
  omit `employee` to recompute every balance row that currently exists.
- If `employee`+`leave_type`+`period` are all given, returns the single
  updated `LeaveBalanceSerializer` object; otherwise returns a list.

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
| `.../resubmit-to-hr/` | RETURNED_TO_HOD | routed HOD/HOS/HOU | HOD resubmits after correcting Section B1, -> PENDING_HR_REVIEW |
| `.../complete/` | PDF_GENERATED | HR_ADMIN, AUTHORIZING_OFFICER | -> COMPLETED (terminal, successful) |
| `.../archive/` | DENIED, COMPLETED | HR_ADMIN | -> ARCHIVED (terminal, housekeeping) |

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
created_at}, ...]` — generated PDFs and supporting attachments for this
application. `file` is a path under `MEDIA_URL`, only actually served by
Django when `DEBUG=True`; in production, fetch the bytes via the download
endpoint below instead.

### POST /api/leave-applications/{id}/upload-document/
Multipart, field name `file`. Applicant-only, own application only, only
while status is `DRAFT` or `RETURNED_TO_EMPLOYEE`. One file per call
(creates a `SUPPORTING_ATTACHMENT` `LeaveDocument`; call again to attach
more). Validates file extension (`.pdf/.jpg/.jpeg/.png`), file-signature
(magic bytes, to catch a mislabeled file), and size (`FILE_SIZE_LIMIT` env
var, default 5MB) — see SECURITY.md. `400` on any validation failure,
`403` if the application isn't the caller's own.
Throttled (default 20/min, `THROTTLE_RATE_DOCUMENT_UPLOAD`).

### GET /api/leave-applications/{id}/documents/{document_id}/download/
Streams the file's bytes (`Content-Disposition: attachment`). Re-checks the
same object-level permission as every other application endpoint — the only
supported way to fetch a document; there is no direct/public file URL in
production.

### GET /api/leave-applications/{id}/audit-trail/
Returns `[{id, application, user, user_name, role, action,
previous_status, new_status, timestamp, comments}, ...]`, newest first.

## Notifications

- `GET /api/notifications/` — current user's notifications (`?is_read=`)
- `POST /api/notifications/{id}/read/` — mark one read
- `POST /api/notifications/mark-all-read/`

`Notification` fields: `id, message, is_read, related_application, created_at`.

## Dashboard stats

### GET /api/dashboard-stats/
Role-scoped counts (same row-level visibility rules as the leave-applications
list — an HOD only ever sees counts for applications routed to them, etc.).
Shape depends on the caller's role:

- **EMPLOYEE**: `{draft, pending, approved, denied, returned}` — own
  applications only. `pending` bundles every in-flight status
  (`PENDING_HOD_REVIEW` … `PENDING_AUTHORIZATION`); `approved` bundles
  `APPROVED`/`PDF_GENERATED`/`COMPLETED`.
- **HOD/HOS/HOU**: `{pending_recommendation, recommended, returned,
  completed}` — applications routed to this HOD (`employee__manager=you`).
- **HR_ADMIN**: `{pending_verification, verified, returned, approved,
  denied}` — org-wide.
- **AUTHORIZING_OFFICER**: `{pending_authorization, approved, denied,
  returned}` — org-wide.
- **SYSTEM_ADMIN**: `{draft, in_progress, approved, denied, archived,
  total_applications, applications_by_leave_type: [{leave_type, count}],
  applications_by_department: [{department, count}],
  applications_by_station: [{station, count}],
  average_processing_time_hours}` — org-wide aggregates.
  `average_processing_time_hours` is the mean `updated_at - submitted_at`
  (hours) across applications that reached a terminal status
  (APPROVED/DENIED/PDF_GENERATED/COMPLETED/ARCHIVED); `null` if none have.

Implementation: `apps/leave/dashboard.py` — plain `.count()`/`.aggregate()`
queries per status bucket (no N+1; a handful of aggregate queries per call).

## Reports / exports

### GET /api/reports/leave-applications/?format=csv|xlsx|pdf&...filters
HR_ADMIN, AUTHORIZING_OFFICER, SYSTEM_ADMIN only (403 for everyone else).
Streams a CSV, Excel (`.xlsx`, via `openpyxl`) or PDF (via `reportlab`)
export of leave applications.

- `csv`/`xlsx`: one row per application — application number, employee,
  check number, department, section, unit, station, leave type, status,
  start/last date, working days, submitted/created/updated timestamps.
- `pdf`: a landscape A4 tabular report — title, the applied filters (as
  `key=value` pairs, or "None"), a generation timestamp, then one row per
  matching application (application number, employee name, leave type,
  start/last date, working days, status) and a total count footer. An empty
  result set still produces a valid single-page PDF with a "No matching
  applications." message instead of a table.

Query filters (all optional, combinable): `start_date` (`start_date>=`),
`end_date` (`last_date<=`), `department`, `station`, `leave_type`, `status`,
`employee` (all four as id). `format` defaults to `csv`.

Note: `format` here is our own filter, not DRF's URL-format-suffix
convention — the view pins `content_negotiation_class` to ignore the
built-in renderer-suffix lookup so the two don't collide.

## Status enum (`LeaveApplication.status`)

`DRAFT, SUBMITTED, PENDING_HOD_REVIEW, HOD_RECOMMENDED,
RETURNED_TO_EMPLOYEE, PENDING_HR_REVIEW, HR_VERIFIED, RETURNED_TO_HOD,
PENDING_AUTHORIZATION, APPROVED, DENIED, PDF_GENERATED, COMPLETED, ARCHIVED`

Note: `SUBMITTED` is transient — `/submit/` moves straight to
`PENDING_HOD_REVIEW` in the same transaction (the "SUBMITTED" audit
action is still logged separately for traceability).

## Deferred to a later phase (do not assume these exist)

- Real SMTP email sending — notifications are in-app only; email sending
  is stubbed behind a function point in `apps/notifications` for later
  wiring to Django's email backend.
- Real Government emblem / NAOT logo artwork — PDF uses placeholder
  images at `backend/apps/documents/assets/*.png`.
- Digital signatures / DSMS / cryptographic signing — explicitly out of
  scope; PDF signature areas are blank lines only.
- Bulk operations (e.g. bulk-approve, bulk-archive) beyond the single-row
  workflow actions. (`POST /api/leave-types/reorder/` is the one exception —
  see "Leave types & holidays" above.)
- `opening_balance`/`entitlement` on `LeaveBalance` are now auto-derived on
  first creation via the `LeavePolicy` engine (tenure-band or flat rules per
  leave type, admin-managed via `/api/leave-policies/`), with a
  system-default fallback — see "Leave Policies" / "Leave Balances" above.
  HR/admin may still override afterwards. `LeavePolicy` now also supports an
  optional `designation` (job grade/title) match in addition to tenure
  bands, ranked by specificity — see "Leave Policies" above — and has an
  admin UI at `frontend/src/app/admin/leave-policies/page.tsx`.
