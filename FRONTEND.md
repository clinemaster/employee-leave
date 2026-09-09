# FRONTEND.md — NAOT Digital Leave Management System

This document describes the frontend slice built by the FRONTEND agent: a Next.js (App Router) +
TypeScript + Redux Toolkit + RTK Query application implementing phase 1 of the leave management
workflow, wired against the backend's published `/API.md`.

## Location

The Next.js app lives in `./frontend`. The Django project lives in `./backend` (DATABASE/BACKEND
agents). This repo is a small monorepo:

```
employee-leave/
├── backend/       ← Django REST Framework backend
├── frontend/      ← this Next.js app
├── API.md         ← backend's published endpoint/serializer spec (source of truth used here)
├── SCHEMA.md       ← backend's model/schema notes
└── FRONTEND.md
```

Run it with:

```
cd frontend
npm install   # already run once during scaffolding
npm run dev
```

Configure the API origin via `frontend/.env.local` (copy `.env.local.example`):

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

`npm run build` and `npm run lint` both pass cleanly as of this writing (one benign React Compiler
warning about `react-hook-form`'s `watch()` not being memoizable — expected, not an error).

## Stack

- Next.js 16 (App Router, Turbopack), TypeScript, React 19
- Redux Toolkit + react-redux + RTK Query
- Tailwind CSS v4 (utility classes used throughout `components/ui`)
- react-hook-form + zod (used in the multi-step leave application form; the single-page workflow
  review forms use plain local state instead — see "Deferred")
- No Angular/NgRx/other global state library used, per spec.

## Folder structure

```
frontend/src/
├── app/                  Next.js routes (App Router)
│   ├── login/
│   ├── dashboard/                     generic role-based redirect landing page
│   ├── employee/leave/new             multi-step application form
│   ├── employee/applications[/[id]]   employee dashboard + detail (+ PDF download)
│   ├── hod/applications[/[id]]        HOD/HOS/HOU dashboard + Section B1 review
│   ├── hr/applications[/[id]]         HR_ADMIN dashboard + Section B2 review
│   ├── authorization/applications[/[id]]  Authorizing Officer dashboard + Section C
│   └── admin/leave-types, admin/holidays  minimal SYSTEM_ADMIN CRUD
├── components/
│   ├── ui/               Button, Card, Badge (StatusBadge), Input/Label
│   ├── dashboard/        AppShell (sidebar+topbar+RoleGuard), StatCard, TabbedApplications
│   ├── tables/           ApplicationsTable
│   ├── leave/            LeaveApplicationForm (multi-step), SectionReadOnly (A/B1/B2/C read views)
│   ├── workflow/         RoleGuard, HodRecommendationForm, HrReviewForm, ApprovalForm
│   ├── forms/, dialogs/  present but empty — reserved, unused in phase 1
├── features/
│   ├── auth/             authApi (login/me), selectors (selectPermissions etc.), AuthHydrator
│   ├── leave/             leaveApi (workflow endpoints), catalogApi (leave types/holidays)
│   ├── users/, departments/, notifications/, dashboard/   reserved, not yet populated (see Deferred)
├── lib/
│   ├── api/baseApi.ts    RTK Query base with JWT header injection + one-shot refresh-and-retry
│   ├── auth/tokenStorage.ts   localStorage JWT persistence helper
│   ├── permissions/      role → UI permission derivation, route→role map, role home routes
│   └── validation/       zod schemas mirroring backend section-scoped rules (reference only — see
│                          "Deferred": workflow review forms don't use RHF/zod yet)
├── store/
│   ├── index.ts           configureStore, preloadedState support for SSR-safe token rehydration
│   ├── provider.tsx        StoreProvider (client component), wired in app/layout.tsx
│   ├── hooks.ts             typed useAppDispatch/useAppSelector
│   └── slices/              authSlice, uiSlice, notificationSlice
├── types/index.ts         Central domain types — field names match the DRF serializers in
│                            /API.md verbatim (snake_case), no case-conversion layer
└── utils/workingDays.ts    Client-side weekday preview calculator (NOT the source of truth —
                             server preview via /api/working-days-preview/ is also surfaced)
```

## Redux store

- `authSlice`: `user`, `accessToken`, `refreshToken`, `isAuthenticated`. Selectors:
  `selectCurrentUser`, `selectCurrentUserRole`, `selectIsAuthenticated`, `selectAccessToken`.
- `uiSlice`: sidebar open/closed, active modal id, ad-hoc filters map. Selectors:
  `selectSidebarState`, `selectActiveModal`, `selectFilters`.
- `notificationSlice`: unread count + panel open state. Selector: `selectUnreadNotificationCount`.
  Nothing populates it yet — see Deferred (no `notificationsApi` was wired up).
- `features/auth/selectors.ts` adds `selectPermissions` (memoized, derives a `Permissions` object
  from role via `lib/permissions`) on top of the slice's own selectors.
- JWTs are persisted to `localStorage` (`lib/auth/tokenStorage.ts`) and used to **preload** the
  Redux store on first client render (`store/provider.tsx`, via `useState` lazy init — avoids a
  "flash of logged out" and a setState-in-effect anti-pattern). `AuthHydrator` (mounted once in
  `app/layout.tsx`) then calls `GET /api/users/me/` to fill in the full `User` object.

## Roles (confirmed, from /API.md)

`EMPLOYEE, HEAD_OF_DEPARTMENT, HEAD_OF_SECTION, HEAD_OF_UNIT, HR_ADMIN, AUTHORIZING_OFFICER,
SYSTEM_ADMIN`. The three "line manager" roles are grouped as `HOD_ROLES` in `types/index.ts` and
all land on `/hod/applications`; every role can also reach `/employee/applications` since line
managers, HR, etc. can themselves be leave applicants.

## RTK Query

- `lib/api/baseApi.ts`: single `baseApi` with `fetchBaseQuery` against `${API_BASE_URL}/api/`, JWT
  bearer header injection, and a wrapped base query that attempts one `POST /api/auth/refresh/` on
  a 401 before retrying, else logs the user out. Tag types: `LeaveApplications`, `LeaveApplication`,
  `Dashboard`, `LeaveTypes`, `Holidays`, `Notifications`, `AuditTrail`, `Documents`, `Me`.
- `features/auth/authApi.ts`: `login` (`POST /api/auth/login/`, body `{username, password}`), `me`
  (`GET /api/users/me/`). No logout endpoint is documented in API.md — logout is client-only
  (clear tokens + Redux state), done in `AppShell`.
- `features/leave/leaveApi.ts` — matches `/API.md`'s "Leave Applications" section field-for-field:
  `getLeaveApplications` (list, row-level-scoped server-side, filters `status`/`leave_type`/
  `employee`), `getLeaveApplication`, `createLeaveApplication`/`updateLeaveApplication` (Section A
  fields only), `submitLeaveApplication`, `recommendLeaveApplication`/`returnLeaveApplication`
  (HOD/HOS/HOU), `verifyLeaveApplication` (HR_ADMIN), `approveLeaveApplication`/
  `denyLeaveApplication` (AUTHORIZING_OFFICER), `generateLeavePdf` (`POST .../generate-pdf/`,
  only valid once `APPROVED`), `getLeaveDocuments`, `getLeaveAuditTrail`,
  `previewWorkingDays` (`POST /api/working-days-preview/`, server-authoritative — excludes
  weekends + holidays). Every workflow mutation invalidates `LeaveApplication:{id}`,
  `LeaveApplications:LIST`, and `Dashboard`.
- `features/leave/catalogApi.ts`: `leave-types/` and `holidays/` CRUD (read: any user, write:
  SYSTEM_ADMIN, enforced server-side) — used by the admin pages and the leave-type dropdown in the
  application form.
- `features/dashboard/dashboardApi.ts`: `getDashboardStats` (`GET /api/dashboard-stats/`,
  role-scoped shape) — see "Phase 2 additions" below for how it's used.
- `features/notifications/notificationsApi.ts`, `features/leave/balancesApi.ts`,
  `features/users/usersApi.ts`, `features/departments/orgApi.ts` — added in phase 2, see below.

## Role-based route protection (UX-only)

- `lib/permissions/routeRoleMap` maps `/employee`, `/hod`, `/hr`, `/authorization`, `/admin` prefixes
  to allowed roles (HOD-family roles + SYSTEM_ADMIN for `/hod`, etc.).
- `components/workflow/RoleGuard.tsx` (used inside `AppShell`, which every protected page renders)
  redirects unauthenticated users to `/login?next=...` and redirects authenticated-but-wrong-role
  users to `/dashboard`.
- **This is UX convenience only.** The real authorization boundary is the Django REST API — row-level
  access (IDOR protection: a user only ever sees applications where they're the applicant, their
  manager, or they hold an org-wide role) and section-scoped edit enforcement are both
  server-side per API.md. Nothing in the frontend should be treated as a security control.

## Multi-step leave application form

`components/leave/LeaveApplicationForm.tsx`, driven by `react-hook-form` + `zod`, built directly
against Section A of `/API.md`:

1. Personal Info — read-only, pre-filled from `selectCurrentUser` (`full_name`, `check_number`,
   `personnel_file_number`, `department`, `station`, `designation`) — these are sent through as-is
   on create since they come from the authenticated user's profile, the source of truth.
2. Leave Request — leave type select (from `catalogApi.getLeaveTypes`), start/last date, a
   `travel_assistance` checkbox, contact address/phone, optional leave number, plus **two** labeled
   working-days estimates: a client-side weekday-only preview (`utils/workingDays.ts`) shown
   instantly, and the actual server preview (`POST /api/working-days-preview/`, excludes holidays
   too) fetched when advancing past this step — both explicitly labeled as previews, not the
   authoritative count (`total_working_days`, set server-side on save).
3. Dependants — `useFieldArray` add/remove rows (`name`, `relationship`, `date_of_birth`).
4. Review & Submit — read-only recap.

Actions: Save Draft (`createLeaveApplication`, application stays `DRAFT`), Back/Next
(client-validated per step via `zodResolver` + `trigger`), Submit (`createLeaveApplication` then
`submitLeaveApplication` → `PENDING_HOD_REVIEW`).

## Role dashboards / review pages

- **Employee**: `/employee/applications` — real server-computed stat cards (`DashboardStats`) +
  paginated applications table + leave balances (`LeaveBalances`);
  `/employee/applications/[id]` — full read-only A/B1/B2/C view + "Download PDF", enabled only once
  status is `APPROVED`/`PDF_GENERATED` (matches the backend's allowed-status gate).
- **HOD** (`HEAD_OF_DEPARTMENT`/`HEAD_OF_SECTION`/`HEAD_OF_UNIT`): `/hod/applications` — tabs
  (Pending Recommendation=`PENDING_HOD_REVIEW` / Recommended=`HOD_RECOMMENDED` /
  Returned=`RETURNED_TO_EMPLOYEE` / Completed=`APPROVED`); `/hod/applications/[id]` — Section A
  read-only + `HodRecommendationForm` (recommend/do-not-recommend, comments required unless
  recommending, signature name/designation) with Recommend and Return actions.
- **HR** (`HR_ADMIN`): `/hr/applications` — tabs (Pending Verification=`PENDING_HR_REVIEW` /
  Verified=`HR_VERIFIED` / Returned=`RETURNED_TO_HOD` / Completed=`APPROVED`) + a search input (not
  yet wired to a query param — see Deferred); `/hr/applications/[id]` — A+B1 read-only +
  `HrReviewForm` (verified/not-verified, HR comments, signature). **No Return button** — API.md
  documents `.../return/` as HOD/HOS/HOU-only (from `PENDING_HOD_REVIEW`); an HR "return to line
  manager" transition (`RETURNED_TO_HOD`) exists in the status enum but has no REST action wired up
  yet per API.md's own "Deferred" section, so the frontend doesn't offer it either.
- **Authorizing Officer**: `/authorization/applications` — tabs (Pending Decision=
  `PENDING_AUTHORIZATION` / Approved / Denied); `/authorization/applications/[id]` — A+B1+B2
  read-only + `ApprovalForm` (Approve with optional comments, or Deny with a required reason,
  signature name/designation). Travel assistance is a Section A **request** made by the applicant
  (shown read-only in Section A), not a separate Section C decision field — API.md does not
  document one.
- **Admin** (`SYSTEM_ADMIN`): `/admin/leave-types` (add / edit-name / deactivate / up-down reorder),
  `/admin/holidays` (add with a recurring-holiday checkbox / delete), `/admin/users` (list +
  create + inline role/active edit), `/admin/organization` (departments/sections/units/stations —
  list + create + active toggle), `/admin/reports` (filtered CSV/XLSX export download).

No digital signature capture, DSMS integration, or in-app PDF viewer was built — signature areas are
the backend's PDF-generation concern; the frontend only offers a "Download PDF" action that opens
the generated file's URL in a new tab.

## Phase 2 additions (this round)

Built against the backend's updated `/API.md` (notifications, dashboard-stats, leave-balances,
users/org CRUD, and reports/export all landed since phase 1). All new server state goes through
RTK Query, same as phase 1 — no ad-hoc `fetch` in components except the reports page's file
download (see below, which can't go through RTK Query since it streams a blob).

- **Notifications**: `features/notifications/notificationsApi.ts` (`getNotifications`,
  `markNotificationRead`, `markAllNotificationsRead`, matching `/API.md`'s `GET /api/notifications/`,
  `POST .../read/`, `POST .../mark-all-read/`) + `components/dashboard/NotificationBell.tsx`, a
  bell-with-unread-badge dropdown mounted in `AppShell`'s header. Poll-on-open only (RTK Query's
  normal cache/refetch-on-focus behavior) — no websocket/push channel is documented.
- **Dashboard stats**: `features/dashboard/dashboardApi.ts` (`getDashboardStats`, `GET
  /api/dashboard-stats/`) + `components/dashboard/DashboardStats.tsx`, a role-aware stat-card row
  (the response shape differs per role per `/API.md`). Replaces the old client-side-approximated
  employee stat cards; now rendered on the employee, HOD, HR, and Authorizing Officer application
  list pages. (SYSTEM_ADMIN's richer aggregate shape — `applications_by_leave_type`,
  `average_processing_time_hours`, etc. — is typed in `DashboardStats` but not yet surfaced with a
  dedicated admin overview page/chart; only the flat counts are rendered anywhere. That richer
  admin dashboard view is deferred.)
- **Pagination**: `components/tables/ApplicationsTable.tsx` now accepts an optional `pagination`
  prop (page / count / onPageChange) and renders Previous/Next controls against the list endpoints'
  `{count, next, previous, results}` shape; `components/dashboard/TabbedApplications.tsx` and the
  employee applications page own the `page` state and reset to page 1 when the active tab or
  filters change.
- **HR search/filter UI**: `/hr/applications` now has real filter inputs (employee name/search,
  check number, personnel file, department, station, leave type, date) wired to
  `leaveApi.getLeaveApplications` query params via `TabbedApplications`'s `extraParams` prop. Only
  `status`/`leave_type`/`employee`/`page` are guaranteed-supported filters per `/API.md`; the
  others (`search`, `check_number`, `personnel_file`, `division_department`, `station`,
  `start_date`) are sent optimistically — DRF generally ignores unrecognized query params rather
  than erroring, but they only narrow results once/if the backend's filterset wires them up. Not
  yet confirmed against a live backend — verify against a real deployment and adjust field names if
  the backend's filterset differs.
- **Leave-type reorder**: `/admin/leave-types` has up/down buttons that swap two rows' `sort_order`
  via two sequential `PATCH` calls — no bulk/reorder endpoint is documented in `/API.md`.
- **Admin CRUD screens**: `/admin/users` (list + create + inline role/active edit, paginated,
  `features/users/usersApi.ts` against `/api/users/`) and `/admin/organization`
  (`features/departments/orgApi.ts` against `/api/{departments,sections,units,stations}/` — list +
  create + active-toggle for each of the four resources on one page).
- **Leave balances**: `features/leave/balancesApi.ts` (`GET /api/leave-balances/`) +
  `components/leave/LeaveBalances.tsx`, shown on the employee dashboard (own balances, no
  `employeeId`) and on the HR application-review page (`employeeId={application.employee}`, since
  HR/AO/Admin can see all balances per `/API.md`).
- **Workflow forms → react-hook-form + zod**: `HodRecommendationForm`, `HrReviewForm`, and
  `ApprovalForm` (`components/workflow/*`) now use `react-hook-form` + `zodResolver`, matching the
  employee application form's pattern. New schemas in `lib/validation/leaveApplication.ts`:
  `hrReviewSchema`, `denySchema` (comments required to deny), `hodReturnSchema` (comments required
  to return). `ApprovalForm`'s approve/deny are two independent forms now (previously shared local
  state for signature fields), which also fixed a latent bug where a deny action could submit
  without its own signature.
- **Reports page**: `/admin/reports` — filter form (status, leave type, date range, format) that
  does a plain authenticated `fetch` (not RTK Query — it streams a file blob, triggers a
  browser download, and doesn't belong in the cache) against
  `GET /api/reports/leave-applications/?format=csv|xlsx&...`, matching `/API.md`'s query params
  (`start_date`, `end_date`, `department`, `station`, `leave_type`, `status`, `employee`). Surfaces
  403 (wrong role) and 404 (endpoint missing) distinctly rather than a raw fetch error.

### Deferred (still open after this round)

- SYSTEM_ADMIN's aggregate dashboard-stats fields (`applications_by_leave_type`,
  `applications_by_department`, `applications_by_station`, `average_processing_time_hours`) are
  typed but not rendered anywhere yet — no charts, no dedicated admin overview page.
- HR filter fields beyond `status`/`leave_type`/`employee`/`page` are sent optimistically and not
  verified against a live backend filterset — confirm field names once the backend's list-endpoint
  filtering is live and adjust `LeaveApplicationListParams` in `features/leave/leaveApi.ts` if
  needed.
- Department field is currently free-text `division_department` on the applications list filter
  because `LeaveApplication.division_department` is a plain string on the model (not an FK to the
  new `Department` resource) per `/API.md`'s Section A field list — the admin org-structure CRUD
  and this filter are not cross-wired (picking a department in the filter is a text match, not a
  dropdown of the new `/api/departments/` resource).
- No drag-and-drop for leave-type reorder — up/down buttons only (no bulk-reorder endpoint exists
  to justify DnD's extra complexity/dependency).
- Admin org-structure screens (`/admin/organization`) offer list/create/toggle-active only, no full
  edit-all-fields form (e.g. renaming a station's address) — add if the backend confirms a stable
  field set is unlikely to change further.
- `npm run build`'s TypeScript check currently fails — but only on files under the concurrently-run
  test-suite agent's `**/*.test.ts(x)` files (missing Jest ambient types /
  `tsconfig.json`/`jest.config.js` wiring, e.g. `Cannot find name 'expect'`), not on any
  FRONTEND-owned source file. Verified via `npx tsc --noEmit` filtered to exclude `*.test.*` — zero
  errors outside test files as of this commit. This should self-resolve once the test-suite agent
  finishes wiring Jest's types into `tsconfig.json` (or an `include`/`exclude` split so `next build`
  doesn't type-check test files); re-run `npm run build` after that lands.
- Reporting UI has no charting — plain filter form + file download only, per the task's scope
  ("no fancy charting needed").

## Deferred to a later phase (explicitly out of scope here)

- **Dashboard stats aggregate endpoint** — none exists in API.md; current stat cards are a
  client-side approximation over one page of results. A real `/dashboard-stats/`-style endpoint (or
  documented pagination-aware aggregation) would be needed for correctness at scale.
- **Server-side pagination UI** — `getLeaveApplications` accepts `page`, but no pager control was
  built; large result sets are effectively truncated to the first page in the UI.
- **HR search filter** — the search input on `/hr/applications` is present but not yet wired to a
  query param (API.md doesn't document a free-text search filter on the list endpoint).
- **`RETURNED_TO_HOD` HR-return action, and `PDF_GENERATED → COMPLETED → ARCHIVED`** transitions —
  not exposed as endpoints per API.md's own deferred list, so no frontend UI calls them either.
- Leave type reorder UI (no bulk-reorder endpoint documented).
- `features/users`, `features/departments`, `features/notifications` (beyond the unread-count UI
  slice), `features/dashboard` folders are scaffolded but empty. API.md does document
  `/api/users/`, `/api/departments/`, `/api/sections/`, `/api/units/`, `/api/stations/`, and
  `/api/notifications/` — none of these have RTK Query hooks yet. Adding a `notificationsApi`
  (`GET /api/notifications/`, `POST .../read/`, `POST .../mark-all-read/`) to drive the existing
  `notificationSlice` unread-count UI is the most valuable next addition.
- Leave balances (`GET /api/leave-balances/`, documented as read-only) are not surfaced anywhere in
  the UI yet (e.g. an "available balance" hint on the leave application form).
- In-app PDF viewer (download-link only, as scoped) and any reporting/export UI.
- Digital signature capture, DSMS integration, certificate flows (explicitly excluded per spec).
- The workflow review forms (`HodRecommendationForm`, `HrReviewForm`, `ApprovalForm`) use plain
  local `useState` rather than `react-hook-form` + the zod schemas already written in
  `lib/validation/leaveApplication.ts` — those schemas are kept as the reference shape for a future
  upgrade but aren't wired in yet.
- Accessibility pass (labels/ARIA present at a basic level via `<Label htmlFor>`, no dedicated
  audit).
- Automated tests (unit/e2e) — none were added in this phase.
- Middleware-level (edge) route protection — guarding is currently client-side only (`RoleGuard`),
  not a Next.js `middleware.ts`. Since real enforcement is server-side this was judged acceptable
  for phase 1, but a `middleware.ts` redirect could be added later for a faster, no-flash redirect.

## Coordination with BACKEND agent

A message requesting the finalized API spec was sent early on; before a reply arrived, the backend
agent published `/API.md` at the repo root with the confirmed endpoints, serializers, role enum,
and workflow rules. This frontend was then reconciled against that document field-for-field (types,
`baseApi`, `authApi`, `leaveApi`, `catalogApi`, all page/component field references, role names and
routing). A follow-up message was sent confirming receipt and flagging two interpretive choices worth
double-checking with backend: (1) `decision` in `/recommend/` and `/verify/` bodies is sent as a
plain boolean per API.md's note; (2) `signature_name`/`signature_designation` are used as the
officer-name/designation fields on recommend/verify/approve/deny actions.
