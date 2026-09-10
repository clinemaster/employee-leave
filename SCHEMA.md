# NAOT Digital Leave Management System — Database Schema

Owner: DB agent. Django project `naot_leave` lives in `backend/`, apps live in
`backend/apps/<app_name>/`. Models are the source of truth for schema; the
backend agent builds serializers/views/urls on top of them.

Run locally (no live Postgres needed for migrations):

```
cd backend
DATABASE_URL=sqlite:///db.sqlite3 python manage.py migrate
```

Against real Postgres, set `DATABASE_URL=postgres://user:pass@host:5432/dbname`
(same env var, parsed via `dj_database_url`). Default in `settings.py` points
at `postgres://naot_leave:naot_leave@localhost:5432/naot_leave`.

## App layout

| App | Purpose |
|---|---|
| `apps.accounts` | Custom `User` model (roles, employee master data) |
| `apps.organization` | `Department`, `Section`, `Unit`, `Station` |
| `apps.leave` | `LeaveType`, `Holiday`, `LeaveApplication` (+ B1/B2/C sub-records), `LeaveDependant`, `LeaveBalance` |
| `apps.documents` | `DocumentTemplate`, `LeaveDocument`, `DocumentVersion` (models only — PDF rendering is the backend agent's job) |
| `apps.notifications` | `Notification` |
| `apps.audit` | `AuditLog` (immutable — no `updated_at`, admin blocks change/delete) |

`AUTH_USER_MODEL = 'accounts.User'`.

## accounts.User (extends AbstractUser)

Keeps `username`, `password`, `email`, `is_staff`, `is_superuser`,
`is_active`, `last_login`, `date_joined` from `AbstractUser`, plus:

- `role` — one of `EMPLOYEE`, `HEAD_OF_DEPARTMENT`, `HEAD_OF_SECTION`, `HEAD_OF_UNIT`, `HR_ADMIN`, `AUTHORIZING_OFFICER`, `SYSTEM_ADMIN`
- `full_name`, `check_number` (unique), `personnel_file_number`, `designation`
- `station` FK -> organization.Station, `department` FK -> organization.Department, `section` FK -> organization.Section, `unit` FK -> organization.Unit
- `official_email`, `date_of_first_appointment`, `phone_number`
- `manager` FK -> self (supervisor used to route applications to the correct HOD/HOS/HOU)
- `deleted_at` (soft-delete; `is_active` inherited from AbstractUser doubles as the active flag)

## organization app

`Department`, `Section` (FK department), `Unit` (FK section), `Station` — each
has `name`, `code`, `is_active`, `deleted_at`, `created_at`, `updated_at`.
Section/Unit codes are unique per parent (`uniq_section_code_per_department`,
`uniq_unit_code_per_section`).

## leave app

**LeaveType**: `name`, `code` (unique), `is_active`, `sort_order`, `deleted_at`. Admin-manageable.

**Holiday**: `date`, `name`, `is_recurring`. Admin-manageable, not hardcoded.

**ApplicationStatus** (state machine, `leave.models.ApplicationStatus`):

```
DRAFT -> SUBMITTED -> PENDING_HOD_REVIEW -> HOD_RECOMMENDED -> PENDING_HR_REVIEW
                            |                                        |
                            v                                        v
                  RETURNED_TO_EMPLOYEE (-> SUBMITTED)      HR_VERIFIED / RETURNED_TO_HOD (-> PENDING_HR_REVIEW)
                                                                       |
                                                                       v
                                                          PENDING_AUTHORIZATION -> APPROVED / DENIED
                                                                       |
                                                          APPROVED -> PDF_GENERATED -> COMPLETED -> ARCHIVED
                                                          DENIED -> ARCHIVED
```

Full 14 values: `DRAFT, SUBMITTED, PENDING_HOD_REVIEW, HOD_RECOMMENDED,
RETURNED_TO_EMPLOYEE, PENDING_HR_REVIEW, HR_VERIFIED, RETURNED_TO_HOD,
PENDING_AUTHORIZATION, APPROVED, DENIED, PDF_GENERATED, COMPLETED, ARCHIVED`.
The legal transition table and side effects (AuditLog + Notification rows)
are implemented in `apps/leave/workflow.py` (backend agent's module).

**LeaveApplication** — one record for the whole workflow:

- `application_number` — unique, auto-generated `NAOT-LV-<year>-NNNNNN` (sequential per year, generated in `LeaveApplication.save()` under `select_for_update`)
- `status` — `ApplicationStatus`, indexed
- `employee` FK -> accounts.User, indexed
- Section A fields: `vote_code`, `sub_vote`, `check_number`, `personnel_file`, `full_name`, `designation`, `station`, `division_department`, `phone_number`, `email`, `contact_address`, `leave_type` FK -> LeaveType, `leave_number`, `travel_assistance`, `start_date`, `last_date`, `total_working_days`
- `recommendation` — OneToOne -> LeaveRecommendation (Section B1, HOD/HOS/HOU sign-off)
- `hr_review` — OneToOne -> LeaveHRReview (Section B2, HR verification)
- `approval` — OneToOne -> LeaveApproval (Section C, Authorizing Officer decision)
- `submitted_at`, `created_at`, `updated_at`

`LeaveRecommendation` / `LeaveHRReview` / `LeaveApproval` each carry a
`reviewer` FK -> User, a decision field (`recommended` / `verified` /
`approved`, nullable bool), `comments`, and plain-text signature-area
placeholders (`signature_name`, `signature_designation`, `signature_date`) —
no digital signature/DSMS fields, matching the paper form.

**LeaveDependant**: `application` FK, `name`, `relationship`, `date_of_birth`.

**LeaveBalance**: `employee` FK, `leave_type` FK, `period` (e.g. `"2026"`),
`opening_balance`, `entitlement`, `taken`, `pending`, `remaining` (all
decimal). Unique per `(employee, leave_type, period)`.

**LeavePolicy**: admin-configurable rule used to auto-derive `entitlement`
for a `LeaveBalance` (spec section 9's "leave types are configurable" +
section 40 balance spec). Fields: `leave_type` FK, `designation` (blank
`CharField` — optional job grade/designation this rule applies to, matched
case-insensitively/exactly against `accounts.User.designation`; blank means
it applies to any designation), `min_years_of_service` /
`max_years_of_service` (nullable `PositiveIntegerField`s — both null means a
flat, non-tenure-banded rule), `annual_entitlement` (decimal, days),
`is_active`, `sort_order` (tiebreaker only — see below), `description`,
`created_at`/`updated_at`. Matching logic lives in
`apps/leave/entitlement.py`: for an employee/leave_type, every active policy
whose designation (if set) matches the employee's `designation` and whose
tenure band (if set) contains the employee's years of service — computed
from `accounts.User.date_of_first_appointment` — is a candidate; among
candidates, the most *specific* one wins (a policy matching both
designation and tenure band beats one matching only one of those, which
beats a flat/all-designations rule), with `sort_order` then `id` used only
to break ties between equally-specific candidates. An employee with no
`date_of_first_appointment` only matches flat (un-banded) policies. If no
policy matches, `LEAVE_DEFAULT_ENTITLEMENT_DAYS` (settings/env, default
`28`) is used. This never raises — missing policy configuration always
falls back cleanly. `LeaveBalance.entitlement`/`opening_balance` are
auto-populated from this engine only when a balance row is first created
(`apps/leave/balances.py:recalculate_balance`); HR/admin overrides made
afterwards are preserved on subsequent recalculations.

## documents app

`DocumentTemplate` (`name`, `code`, `template_file`, `is_active`) —
`LeaveDocument` (`application` FK, `template` FK, `document_type`, `file`,
`generated_by` FK) — `DocumentVersion` (`document` FK, `version_number`,
`file`, `created_by`, `notes`). Models only; PDF generation logic belongs to
the backend agent.

## notifications app

`Notification`: `user` FK, `message`, `is_read`, `related_application` FK ->
LeaveApplication, `created_at`.

## audit app

`AuditLog`: `application` FK, `user` FK, `role`, `action`, `previous_status`,
`new_status`, `timestamp` (auto_now_add, no updated_at — immutable by
design), `ip_address`, `user_agent`, `comments`. Django admin for this model
disables change/delete permissions; the backend agent should likewise never
register PUT/PATCH/DELETE routes for it.

## Conventions

- Soft-delete (`is_active` + `deleted_at`) on: `accounts.User` (is_active from
  AbstractUser), `organization.*`, `leave.LeaveType`.
- All FK-heavy/frequently-filtered fields are indexed: `status`,
  `application_number`, `employee` on LeaveApplication; `check_number` on
  User (also unique).
- `created_at`/`updated_at` timestamps on every mutable model except AuditLog
  (immutable, `timestamp` only).
- No digital signature/DSMS fields anywhere — only plain text signature-area
  placeholders (name, designation, date), matching the paper form.

## Coordination notes

The backend agent has already started building on this schema directly in
`backend/apps/leave/` (`workflow.py`, `permissions.py`, `workingdays.py`,
`exceptions.py`) and has extended `backend/naot_leave/settings.py` with
SimpleJWT, CORS and django-filter config, and `requirements.txt` with those
packages plus `reportlab`/`Pillow` for PDF generation. Model field names in
this document match what's actually in `models.py` as of this commit.
