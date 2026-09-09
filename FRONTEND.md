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
- **No dashboard-stats endpoint exists in API.md.** The employee stat cards
  (`app/employee/applications/page.tsx`) compute totals client-side from the (already
  row-level-scoped) applications list on the first page returned — this is an approximation, not a
  true aggregate; see Deferred.

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

- **Employee**: `/employee/applications` — 6 stat cards (total/draft/pending/approved/denied/
  returned, computed client-side — see RTK Query note above) + applications table;
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
- **Admin** (`SYSTEM_ADMIN`): `/admin/leave-types` (add / edit-name / deactivate — no reorder UI,
  since API.md documents no bulk-reorder endpoint) and `/admin/holidays` (add with a
  recurring-holiday checkbox / delete).

No digital signature capture, DSMS integration, or in-app PDF viewer was built — signature areas are
the backend's PDF-generation concern; the frontend only offers a "Download PDF" action that opens
the generated file's URL in a new tab.

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
