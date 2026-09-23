# FRONTEND.md — NAOT Digital Leave Management System

This document describes the frontend slice built by the FRONTEND agent: a Next.js (App Router) +
TypeScript + Redux Toolkit + RTK Query application implementing phase 1 of the leave management
workflow, wired against the backend's published `backend/API.md`.

## Location

The Next.js app lives in `./frontend` and is fully self-contained (all frontend code, config, and
this doc live under it). The Django project lives in `./backend`, also fully self-contained
(code, `requirements.txt`, and its own docs). This repo is a small monorepo:

```
employee-leave/
├── backend/
│   ├── API.md      ← backend's published endpoint/serializer spec (source of truth used here)
│   ├── SCHEMA.md    ← backend's model/schema notes
│   ├── requirements.txt
│   └── ...          Django REST Framework backend code
├── frontend/
│   ├── FRONTEND.md  ← this file
│   └── ...           this Next.js app
├── DEPLOYMENT.md    ← project-wide: deploys both halves
└── SECURITY.md      ← project-wide: security posture across both halves
```

References to `/API.md` and `/SCHEMA.md` elsewhere in this document predate this reorganization
and mean `../backend/API.md` / `../backend/SCHEMA.md` relative to this file.

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

`npm run build` and `npm run lint` both pass cleanly as of this writing (two benign React Compiler
warnings about `react-hook-form`'s `watch()` not being memoizable — expected, not an error).

## Phase 4 additions (this round) — Travel Payment Request

Built against the backend's Person types & travel payment request additions to `/API.md`
(`PersonType` catalog + `/api/person-types/` CRUD/reorder, and `travel_routes`/`taxi_expenses`/
`mizigo_items` nested on `LeaveApplication`).

- **New Step 4 in the leave application form**: `LeaveApplicationForm.tsx` gained "Travel Payment
  Request" (JEDWALI 1: MCHANGANUO WA MAOMBI YA MALIPO) as a fifth wizard step, **always shown**
  (not gated on the `travel_assistance` checkbox) — Personal Info → Leave Request → Dependants →
  **Travel Payment Request** → Review & Submit. The step's UI lives in
  `components/leave/TravelPaymentStep.tsx` (NAULI/routes with a per-route Wahusika/person-type
  table, TAXI, MIZIGO, each with `useFieldArray` add/remove, plus a live sticky summary tile row),
  embedded directly in the parent form's single `react-hook-form` instance (not a separate form) —
  same step-validation/Next/Back/Save Draft pattern as the existing steps. Person types (Wahusika)
  are fetched from `personTypesApi.getPersonTypes` (active, sorted by `sort_order`), not hardcoded,
  so admin-added types show up automatically; adding a route seeds one passenger row per active
  person type, defaulting `idadi` to 0 (0 is valid — "no travelers of this type on this route").
  All totals (`fare × idadi × trips`, taxi `trips × cost`, luggage `qty × unit_cost`, and the NAULI/
  TAXI/MIZIGO/JUMLA KUU summary) are computed client-side live in `utils/travelPayment.ts` and
  rendered read-only — the user only ever types Idadi/fare/cost/quantity, never a total.
- **`<TravelPaymentPreview>`** (`components/leave/TravelPaymentPreview.tsx`): reusable read-only
  rendering of JEDWALI 1's WAHUSIKA | IDADI | MCHANGANUO | JUMLA table layout (MCHANGANUO text like
  "85,000 × 4×2" via `mchanganuoText()`), used inside the Review & Submit step and intended for
  reuse on a future application detail page. Prefers a saved row's server-computed `total`/
  `naule_total` when present, falling back to the client calculation otherwise.
- **Types/validation**: `types/index.ts` gained `PersonType`, `TravelRoute`, `TravelRoutePassenger`,
  `TaxiExpense`, `MizigoItem`, and `LeaveApplication` gained `travel_routes`/`taxi_expenses`/
  `mizigo_items` plus the four read-only grand-total fields (`naule_grand_total`,
  `taxi_grand_total`, `mizigo_grand_total`, `travel_payment_grand_total`) — field names reconciled
  against `/API.md`'s "Person types & travel payment request" section (`from_place`/`to_place`, not
  `from_location`/`to_location`; each line-item type carries an optional `sort_order`). New zod
  schemas in `lib/validation/leaveApplication.ts` (`travelRouteSchema`, `taxiExpenseSchema`,
  `mizigoItemSchema`, `travelPaymentSchema`) validate idadi/quantity/number_of_trips as non-negative
  integers, fare/cost values as positive numbers, and from/to as required non-empty strings.
- **`features/leave/personTypesApi.ts`**: `getPersonTypes`, `createPersonType`, `updatePersonType`,
  `deactivatePersonType`, `reorderPersonTypes` against `/api/person-types/` — copies
  `catalogApi.ts`'s leave-types pattern field-for-field, including the bulk reorder endpoint. New
  `PersonTypes` tag added to `baseApi`.
- **`/admin/person-types`**: list + create + up/down bulk reorder, copying `/admin/leave-types`'s
  structure exactly. Nav link added to `AppShell`'s SYSTEM_ADMIN section, next to Leave Policies.
- Tests: `LeaveApplicationForm.test.tsx` gained coverage for the new step's presence in the wizard,
  the worked-example arithmetic (fare 85,000 × idadi 4 × round-trip = 680,000; fare 40,000 × idadi 2
  × round-trip = 160,000; taxi 2 × 100,000 = 200,000, all computed live as inputs change), and
  add/remove for routes and taxi expenses. `lib/validation/leaveApplication.test.ts` (new file)
  covers the travel-payment zod schemas rejecting missing from/to, non-positive fares, and
  negative/fractional/non-numeric idadi. `features/leave/personTypesApi.test.ts` and
  `app/admin/person-types/page.test.tsx` mirror `policiesApi.test.ts` / `admin/leave-policies`'s
  test harnesses (list/create/reorder request shape + tag invalidation, rendered list/empty-state/
  create-form/reorder assertions).

### Deferred from this round

- Decimal fields (`fare_per_person`, `cost_per_trip`, `unit_cost`) are typed as `number` in the
  frontend for simplicity even though DRF's `DecimalField` serializes them as strings on the wire
  (e.g. `"85000.00"`) — RTK Query/fetch will pass the JSON through either way and the browser's
  `<input type="number">` + `valueAsNumber` coerces on both ends, but a strict string-vs-number
  mismatch hasn't been exercised against a live backend response.
- No detail-page rendering of a saved application's travel payment breakdown yet — `
  <TravelPaymentPreview>` was built reusable for this, but no application detail page wires it in
  this round (out of scope, per the task's focus on the application form + admin CRUD).
- The Travel Payment Request step's Idadi inputs (and taxi/mizigo description/trips/cost inputs
  registered inline without individual `id`/`htmlFor` on every field previously in this codebase)
  now have `id`/`htmlFor` pairs for accessibility/testability — a small improvement over the
  Dependants step's inputs, which remain unassociated (matches that step's existing pattern; not
  touched this round).

## Phase 3 additions (this round)

- **Leave Policies admin UI**: `/admin/leave-policies` (SYSTEM_ADMIN only) — list of `LeavePolicy`
  rows sorted by leave type then tenure band/`sort_order`, a create/edit form (leave type select,
  optional designation text input, optional min/max years-of-service tenure band, annual
  entitlement, sort order, description, an Active checkbox), and delete — same useState-driven CRUD
  pattern as `/admin/leave-types` / `/admin/organization` (no react-hook-form/zod here, matching
  those pages, not the multi-step application form). Backed by `features/leave/policiesApi.ts`
  (`getLeavePolicies`, `getLeavePolicy`, `createLeavePolicy`, `updateLeavePolicy`,
  `deleteLeavePolicy` against `/api/leave-policies/`, tag `LeavePolicies` added to `baseApi`,
  list/item tag invalidation). `types/index.ts` gained a `LeavePolicy` interface matching
  `LeavePolicySerializer` field-for-field. Nav link added to `AppShell`'s SYSTEM_ADMIN section,
  alongside Leave Types/Holidays/Users/Organization/Reports.
  - **Designation field** (later addition): the create/edit form gained a `designation` text input
    ("leave blank to apply to all designations") next to Leave Type, and the list table gained a
    Designation column (showing "All" when unset) between Leave Type and Tenure Band — lets admins
    configure grade/designation-specific entitlement rules (e.g. Auditor General vs Clerk), which
    the backend ranks by specificity alongside tenure bands (`apps/leave/entitlement.py`).
- **Computed-entitlement preview**: `LeaveBalance` type extended with the new read-only comparison
  fields per `/API.md` (`opening_balance`, `entitlement`, `taken`, `pending`, `remaining`,
  `computed_entitlement`, `is_entitlement_overridden`); `balance_days` kept as optional for
  backward compatibility since it wasn't actually documented in `/API.md`. `components/leave/
  LeaveBalances.tsx` gained an "Entitlement" column showing the row's `entitlement`, with an amber
  "Overridden (policy: N)" badge when `is_entitlement_overridden` is true (comparing against
  `computed_entitlement`) and a muted "(policy-derived)" hint otherwise — so HR can see at a glance
  whether a balance was policy-computed or hand-overridden.
- **Bulk leave-type reorder**: the backend published `POST /api/leave-types/reorder/` this round
  (bulk `sort_order` update, body `[{id, sort_order}, ...]`). `catalogApi.ts` gained
  `reorderLeaveTypes`, and `/admin/leave-types`'s up/down move handler now sends one bulk call
  instead of two sequential `PATCH` calls — the "no bulk/reorder endpoint" deferred note from the
  previous round is resolved. Still no drag-and-drop UI, just the existing up/down buttons.
- Tests: `features/leave/policiesApi.test.ts` (list/get/create/update/delete request shape + tag
  invalidation, mirroring `leaveApi.test.ts`'s pattern) and `app/admin/leave-policies/page.test.tsx`
  (renders existing policies grouped/sorted, empty state, create-form submission body, client-side
  required-field validation, delete button) — 10 new tests, run inside `AppShell`/`RoleGuard` as an
  authenticated SYSTEM_ADMIN via `makeStore(...)` + a mocked `fetch`, same harness as the existing
  role-scoped detail-page smoke tests.

### Deferred from this round

- The leave-policies list/form has no reorder UI beyond the numeric `sort_order` input (no
  up/down buttons like `/admin/leave-types`, no drag-and-drop) — acceptable since bands per leave
  type are typically few in number, but worth adding if that assumption breaks.
- No dedicated confirmation dialog on delete (matches the existing `/admin/holidays` pattern of an
  immediate `DELETE` on click — consistent with the rest of the admin CRUD, not a new gap).

## Test coverage

`npm test` — 121 passing tests across 23 suites (up from phase 3's 80/18; the 41 new tests are this
round's Travel Payment Request step, `personTypesApi`, `/admin/person-types`, and the new
`lib/validation/leaveApplication.test.ts`, see "Phase 4 additions" above).
Carried over from the previous round:

- **Workflow forms** (`components/workflow/HodRecommendationForm.test.tsx`,
  `HrReviewForm.test.tsx`, `ApprovalForm.test.tsx`): each renders its section's fields, exercises
  the zod-required-comment paths (comments required on HOD "Do not recommend" and on Return;
  a reason required on Deny), and asserts the exact payload shape sent to
  `recommendLeaveApplication` / `returnLeaveApplication` / `verifyLeaveApplication` /
  `approveLeaveApplication` / `denyLeaveApplication` (URL, method, and JSON body).
- **`AuthHydrator`** (`features/auth/AuthHydrator.test.tsx`): covers `tokenStorage.loadTokens()`
  reading/omitting persisted tokens, the hydrator populating `state.auth.user` from `GET
  /api/users/me/` once a token is preloaded, staying unauthenticated with no token (RTK Query's
  `skip` correctly prevents the request), and a malformed/expired token (401 with no refresh
  token) being handled by `baseApi`'s reauth wrapper (logout) rather than crashing.
- **`baseApi` token-refresh-on-401** (`lib/api/baseApi.test.ts`): a 401 triggers exactly one `POST
  /api/auth/refresh/`, the original request is retried once with the new token on success (3 total
  `fetch` calls, store's `accessToken` updated), a failed refresh logs the user out without
  retrying or looping (2 calls, not 3+), and a 401 with no refresh token available skips the
  refresh call entirely and logs out immediately (1 call).
- **Role-scoped detail pages**, one smoke test per role
  (`app/employee/applications/[id]/page.test.tsx`, `app/hod/applications/[id]/page.test.tsx`,
  `app/hr/applications/[id]/page.test.tsx`, `app/authorization/applications/[id]/page.test.tsx`):
  renders each page with a mocked store + `fetch`, and asserts the RBAC matrix — the employee's own
  view is entirely read-only (all four sections via `SectionReadOnly`, PDF download gated on
  `APPROVED`/`PDF_GENERATED` status) with no workflow-mutation form present; the HOD page shows
  Section A read-only plus an editable B1 `HodRecommendationForm` only (no verify/approve UI); the
  HR page shows A+B1 read-only plus an editable B2 `HrReviewForm` only; the Authorizing Officer page
  shows A+B1+B2 read-only plus an editable Section C `ApprovalForm` only. These pages use React 19's
  `use()` on the route's `params` promise — under jsdom a bare `Promise.resolve(...)` still suspends
  the component on first render (it isn't pre-settled the way Next.js's own internal params promise
  is), so the tests pass a promise with `status`/`value` pre-attached, mirroring the informal
  contract `use()` recognizes for an already-settled thenable, rather than wrapping in `<Suspense>`
  and asserting after a loading state.
- **Regression**: `LeaveApplicationForm.test.tsx` gained a test for the `leave_type` zod message —
  see "Fixed this round" below.

### Remaining honest gaps

- `TabbedApplications`, `ApplicationsTable`, `DashboardStats`, `NotificationBell`, `LeaveBalances`,
  and the admin CRUD pages (`/admin/*`) have no dedicated tests — only smoke-tested indirectly
  where they're rendered inside a covered detail page (e.g. `NotificationBell` and `LeaveBalances`
  render inside the new HR detail-page smoke test, but their own internal behavior — mark-read,
  mark-all-read, the period filter — isn't independently asserted).
- The list/dashboard pages (`/employee/applications`, `/hod/applications`, `/hr/applications`,
  `/authorization/applications`) — tabs, pagination, HR's filter inputs — have no tests; only the
  four `[id]` detail pages (one per role) were added this round, per the task's scope.
- `AuthHydrator`'s test covers `loadTokens()` + the hydrator's own effect; it does not cover
  `store/provider.tsx`'s lazy-`useState` preload path directly (that a fresh page load with a
  persisted token produces a store whose `preloadedState.auth` already has `isAuthenticated: true`
  before the first render) — indirectly implied by the passing `loadTokens()` tests plus reading the
  source, but not exercised through an actual `StoreProvider` render.
- `RoleGuard`'s existing tests + the new detail-page smoke tests cover the "wrong role redirected"
  and "right role sees content" paths for the four workflow roles; SYSTEM_ADMIN's own dedicated
  admin-page components remain untested (only its access to `/hod` via `RoleGuard.test.tsx` is
  covered).
- No end-to-end/integration test drives the full multi-step workflow across roles (create → submit
  → recommend → verify → approve) in one test; each stage is covered in isolation.
- Accessibility pass, and true browser/e2e testing (Playwright/Cypress) — still not in scope.

### Fixed this round

- `LeaveApplicationForm`'s `leave_type` zod validation: previously
  `z.number({ error: "Select a leave type" }).positive()` — the custom `error` message on
  `z.number()` only fires for a genuine type mismatch (e.g. a string or `undefined`), not for a
  same-type value that merely fails a later chained refinement like `.positive()`. Since the field's
  default value is `0` (a real number), advancing past the Leave Request step without picking a
  type showed zod's generic "too small" message instead of the intended "Select a leave type".
  Fixed by replacing `.positive()` with `.refine((val) => val > 0, { message: "Select a leave type"
  })` in both `LeaveApplicationForm.tsx`'s local schema and the mirrored reference schema in
  `lib/validation/leaveApplication.ts`. Regression test added in `LeaveApplicationForm.test.tsx`.
- Noted but **not** fixed (out of scope for this round, flagged for awareness): in
  `HodRecommendationForm`, the "Comments (required)" label and `watch("decision")` can read as
  `false`/`undefined` on first render before the user interacts with the native `<select>`, even
  though `useForm`'s `defaultValues.decision` is `true` — a quirk of pairing `watch()` with a
  `setValueAs`-transformed uncontrolled `<select>`. It self-corrects the moment the user touches the
  select (and the *submitted* value is always correct, since that's read via `getValues`/the DOM ref
  at submit time, not `watch()`), so no application can actually be recommended with the wrong
  `decision` value — but the label's fleeting "(required)" hint before any interaction is misleading
  UX. A safer fix would be to drive the `<select>`'s `value`/`onChange` explicitly (a controlled
  `Controller`) instead of relying on `watch()` over an uncontrolled native element.

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

`EMPLOYEE, HEAD_OF_DEPARTMENT, DAG, HEAD_OF_SECTION, HR_ADMIN, AUTHORIZING_OFFICER, CAG, AAG,
CHIEF_ACCOUNTANT, DAHRM, ADA, CHIEF_EXTERNAL_AUDITOR, SYSTEM_ADMIN`. The "line manager" roles are
grouped as `HOD_ROLES` in `types/index.ts` and all land on `/hod/applications`; every role can
also reach `/employee/applications` since line managers, HR, etc. can themselves be leave
applicants.

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
- **HOD** (`HEAD_OF_DEPARTMENT`/`DAG`/`HEAD_OF_SECTION`/`CHIEF_EXTERNAL_AUDITOR`): `/hod/applications` — tabs
  (Pending Recommendation=`PENDING_HOD_REVIEW` / Recommended=`HOD_RECOMMENDED` /
  Returned=`RETURNED_TO_EMPLOYEE` / Completed=`APPROVED`); `/hod/applications/[id]` — Section A
  read-only + `HodRecommendationForm` (recommend/do-not-recommend, comments required unless
  recommending, signature name/designation) with Recommend and Return actions.
  `CHIEF_EXTERNAL_AUDITOR` acts as "head of work station" here — a fallback reviewer (after
  department/division heads and legacy `manager` routing) for employees at their work station
  whose department/division has no active head (see backend `matched_cea_for`).
- **HR** (`HR_ADMIN`): `/hr/applications` — tabs (Pending Verification=`PENDING_HR_REVIEW` /
  Verified=`HR_VERIFIED` / Returned=`RETURNED_TO_HOD` / Completed=`APPROVED`) + a search input (not
  yet wired to a query param — see Deferred); `/hr/applications/[id]` — A+B1 read-only +
  `HrReviewForm` (verified/not-verified, HR comments, signature). **No Return button** — API.md
  documents `.../return/` as HOD/HOS/HOU-only (from `PENDING_HOD_REVIEW`); an HR "return to line
  manager" transition (`RETURNED_TO_HOD`) exists in the status enum but has no REST action wired up
  yet per API.md's own "Deferred" section, so the frontend doesn't offer it either.
- **CAG**: `/cag/applications` — tabs (Pending Review=`PENDING_CAG_REVIEW` / Recommended=
  `CAG_RECOMMENDED` / Rejected=`DENIED`); `/cag/applications/[id]` — Section A read-only +
  `CagReviewForm` (recommend/reject, comments, signature) — mandatory stand-in for Section B1 for
  applicants whose role requires it (`requires_cag_review`), skipping the HOD stage entirely.
- **AAG**: `/aag/applications` — same tab/page shape as CAG (`PENDING_AAG_REVIEW`/
  `AAG_RECOMMENDED`/`DENIED`), `AagReviewForm` — mandatory stand-in for Section B1 for Division
  employees whose role doesn't itself require CAG review (`requires_aag_review`), matched to the
  AAG assigned to that specific division (CAG takes priority when both would apply). Also stands
  in for `CHIEF_EXTERNAL_AUDITOR`, matched by `work_station` instead (that role has no division).
- **Authorizing Officer**: `/authorization/applications` — tabs (Pending Decision=
  `PENDING_AUTHORIZATION` / Approved / Denied); `/authorization/applications/[id]` — A+B1+B2
  read-only + `ApprovalForm` (Approve with optional comments, or Deny with a required reason,
  signature name/designation). Travel assistance is a Section A **request** made by the applicant
  (shown read-only in Section A), not a separate Section C decision field — API.md does not
  document one.
- **Admin** (`SYSTEM_ADMIN`): `/admin/leave-types` (add / edit-name / deactivate / up-down reorder),
  `/admin/holidays` (add with a recurring-holiday checkbox / delete), `/admin/users` (list +
  create + inline role/active edit), `/admin/organization` (departments/divisions/designations/work stations —
  list + create + active toggle), `/admin/reports` (filtered CSV/XLSX export download),
  `/admin/leave-policies` (list + create/edit + delete tenure-banded entitlement rules — added
  phase 3, see "Phase 3 additions" below).

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
- ~~No drag-and-drop for leave-type reorder~~ — the up/down buttons now call the bulk
  `POST /api/leave-types/reorder/` endpoint (added by BACKEND this round) instead of two sequential
  `PATCH`es; still no drag-and-drop UI, just resolved the "no bulk endpoint" gap. See "Phase 3
  additions" above.
- Admin org-structure screens (`/admin/organization`) offer list/create/toggle-active only, no full
  edit-all-fields form (e.g. renaming a station's address) — add if the backend confirms a stable
  field set is unlikely to change further.
- ~~`npm run build`'s TypeScript check currently fails on `**/*.test.ts(x)` files~~ — resolved as of
  this round: `npm run build` passes cleanly (TypeScript check included) with 70 passing tests
  across 16 suites present in the tree.
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
- Automated unit/component tests — see the dedicated "Test coverage" section above (70 passing as
  of this round). True browser/e2e testing (Playwright/Cypress) is still not in scope.
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
