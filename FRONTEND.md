# FRONTEND.md — NAOT Digital Leave Management System

This document describes the frontend slice built by the FRONTEND agent: a Next.js (App Router) +
TypeScript + Redux Toolkit + RTK Query application implementing phase 1 of the leave management
workflow.

## Location

The Next.js app lives in `./frontend` (not the repo root), because the DATABASE/BACKEND agents are
building the Django project directly at the repo root (`requirements.txt`, `.venv/` were already
present there when this work started). This repo is effectively a small monorepo:

```
employee-leave/
├── requirements.txt, .venv/, ...   ← Django backend (DATABASE/BACKEND agents)
├── frontend/                        ← this Next.js app
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

## Stack

- Next.js 16 (App Router, Turbopack), TypeScript, React 19
- Redux Toolkit + react-redux + RTK Query
- Tailwind CSS v4 (utility classes used throughout `components/ui`)
- react-hook-form + zod for form state/validation
- No Angular/NgRx/other global state library used, per spec.

## Folder structure

```
frontend/src/
├── app/                  Next.js routes (App Router)
│   ├── login/
│   ├── dashboard/                     generic redirect landing page
│   ├── employee/leave/new             multi-step application form
│   ├── employee/applications[/[id]]   employee dashboard + detail
│   ├── hod/applications[/[id]]        HOD dashboard + Section B1 review
│   ├── hr/applications[/[id]]         HR dashboard + Section B2 review
│   ├── authorization/applications[/[id]]  Authorizing Officer dashboard + Section C
│   └── admin/leave-types, admin/holidays  minimal admin CRUD
├── components/
│   ├── ui/               Button, Card, Badge (StatusBadge), Input/Label
│   ├── dashboard/        AppShell (sidebar+topbar+RoleGuard), StatCard, TabbedApplications
│   ├── tables/           ApplicationsTable
│   ├── leave/            LeaveApplicationForm (multi-step), SectionReadOnly (A/B1/B2/C read views)
│   ├── workflow/         RoleGuard, HodRecommendationForm, HrReviewForm, ApprovalForm
│   ├── forms/, dialogs/  present but empty — reserved for phase 2 (no dialogs were needed yet)
├── features/
│   ├── auth/             authApi (login/me/logout), selectors (selectPermissions etc.), AuthHydrator
│   ├── leave/             leaveApi (workflow endpoints), catalogApi (leave types/holidays)
│   ├── users/, departments/, notifications/, dashboard/   reserved, not yet populated (no
│   │                       confirmed endpoints for these beyond what's in leaveApi/authApi)
├── lib/
│   ├── api/baseApi.ts    RTK Query base with JWT header injection + one-shot refresh-and-retry
│   ├── auth/tokenStorage.ts   localStorage JWT persistence helper
│   ├── permissions/      role → UI permission derivation, route→role map, role home routes
│   └── validation/       zod schemas (leave request, HOD recommendation, approval)
├── store/
│   ├── index.ts           configureStore, preloadedState support for SSR-safe token rehydration
│   ├── provider.tsx        StoreProvider (client component), wired in app/layout.tsx
│   ├── hooks.ts             typed useAppDispatch/useAppSelector
│   └── slices/              authSlice, uiSlice, notificationSlice
├── types/index.ts         Central domain types (User, LeaveApplication, enums, etc.)
└── utils/workingDays.ts    Client-side weekday preview calculator (NOT the source of truth)
```

## Redux store

- `authSlice`: `user`, `accessToken`, `refreshToken`, `isAuthenticated`. Selectors:
  `selectCurrentUser`, `selectCurrentUserRole`, `selectIsAuthenticated`, `selectAccessToken`.
- `uiSlice`: sidebar open/closed, active modal id, ad-hoc filters map. Selectors:
  `selectSidebarState`, `selectActiveModal`, `selectFilters`.
- `notificationSlice`: unread count + panel open state. Selector: `selectUnreadNotificationCount`.
- `features/auth/selectors.ts` adds `selectPermissions` (memoized, derives a `Permissions` object
  from role via `lib/permissions`) on top of the slice's own selectors.
- JWTs are persisted to `localStorage` (`lib/auth/tokenStorage.ts`) and used to **preload** the
  Redux store on first client render (`store/provider.tsx`), avoiding a "flash of logged out" and
  avoiding a setState-in-effect anti-pattern. `AuthHydrator` (mounted once in `app/layout.tsx`)
  then calls `GET /api/auth/me/` to fill in the full `User` object.

## RTK Query

- `lib/api/baseApi.ts`: single `baseApi` with `fetchBaseQuery`, JWT bearer header injection, and a
  wrapped base query that attempts one `POST /api/auth/refresh/` on a 401 before retrying, else
  logs the user out. Tag types: `LeaveApplications`, `LeaveApplication`, `Dashboard`, `LeaveTypes`,
  `Holidays`, `Notifications`, `AuditTrail`, `Documents`, `Me`.
- `features/auth/authApi.ts`: `login`, `me`, `logout`.
- `features/leave/leaveApi.ts`: `getLeaveApplications` (paginated, filterable), `getLeaveApplication`,
  `createLeaveApplication`, `updateLeaveApplication`, `submitLeaveApplication`,
  `recommendLeaveApplication`, `returnLeaveApplication`, `verifyLeaveApplication`,
  `approveLeaveApplication`, `denyLeaveApplication`, `generateLeavePdf`, `getLeaveDocuments`,
  `getLeaveAuditTrail`, `getDashboardStats`, `previewWorkingDays` (lazy query — best-effort
  server-side working-days preview). Every mutation invalidates `LeaveApplication:{id}`,
  `LeaveApplications:LIST`, and `Dashboard` as appropriate.
- `features/leave/catalogApi.ts`: leave types + holidays CRUD (admin pages).

## API shape assumptions — NOT YET CONFIRMED WITH BACKEND

**Important**: at the time of this work, the BACKEND agent had not yet responded with finalized
endpoint paths, JSON field names, or the exact `Role` enum values. Rather than block on that, every
assumed path/shape is centralized and marked with `TODO(api-confirm)` comments in:

- `src/lib/api/baseApi.ts` (base URL, refresh endpoint)
- `src/features/auth/authApi.ts` (login/me/logout paths and payload field names)
- `src/features/leave/leaveApi.ts` (all `/api/leave-applications/...` paths and bodies)
- `src/features/leave/catalogApi.ts` (`/api/leave-types/`, `/api/holidays/`)
- `src/types/index.ts` (all field names — camelCase assumed; Django REST Framework often returns
  snake_case, which would require either a `transformResponse` per endpoint or a global
  case-conversion base query)

A message requesting the finalized spec was sent to the BACKEND agent; if their reply changes any
of these shapes, only the files above need to change — no component/page imports RTK Query request
bodies or raw API responses directly, they all go through the typed hooks.

**Known likely mismatch**: DRF/simplejwt typically returns snake_case JSON (`access_token` vs
`access`, `first_name` vs `firstName`, etc.). This was not yet reconciled — whoever picks this up
next should either add a response/query transform in `baseApi.ts` or agree with backend on
camelCase serializers.

## Role-based route protection (UX-only)

- `lib/permissions/routeRoleMap` maps `/employee`, `/hod`, `/hr`, `/authorization`, `/admin` prefixes
  to allowed roles.
- `components/workflow/RoleGuard.tsx` (used inside `AppShell`, which every protected page renders)
  redirects unauthenticated users to `/login?next=...` and redirects authenticated-but-wrong-role
  users to `/dashboard`.
- **This is UX convenience only.** The real authorization boundary is the Django REST API (RBAC on
  every endpoint) — nothing here should be treated as a security control.

## Multi-step leave application form

`components/leave/LeaveApplicationForm.tsx`, driven by `react-hook-form` + `zod`
(`lib/validation/leaveApplication.ts`):

1. Personal Info — read-only, pre-filled from `selectCurrentUser`.
2. Leave Request — leave type select (from `catalogApi.getLeaveTypes`), start/end date, reason,
   address, contact phone, plus a **client-side working-days preview** (`utils/workingDays.ts`,
   simple Mon–Fri count) explicitly labeled "preview" and noted as excluding holidays — the
   authoritative count comes from the server.
3. Dependants — `useFieldArray` add/remove rows (name, relationship, DOB).
4. Review & Submit — read-only recap.

Actions: Save Draft (`createLeaveApplication({ isDraft: true })`), Back/Next (client-validated per
step via `zodResolver` + `trigger`), Submit (`createLeaveApplication` then
`submitLeaveApplication`).

## Role dashboards / review pages

- **Employee**: `/employee/applications` — 6 stat cards (total/draft/pending/approved/denied/returned
  via `getDashboardStats`) + recent applications table; `/employee/applications/[id]` — full
  read-only A/B1/B2/C view + "Download PDF" (`generateLeavePdf` then opens the returned URL in a new
  tab — no in-app PDF viewer, per scope).
- **HOD**: `/hod/applications` — tabs (Pending Recommendation / Recommended / Returned / Completed)
  via `TabbedApplications`; `/hod/applications/[id]` — Section A read-only +
  `HodRecommendationForm` (decision enum, comments required unless plain `RECOMMEND`, officer
  name/designation) with Recommend and Return actions.
- **HR**: `/hr/applications` — tabs + a search input (not yet wired to a query param — see Deferred);
  `/hr/applications/[id]` — A+B1 read-only + `HrReviewForm` (balance fields, HR comments) with
  Verify and Return actions.
- **Authorizing Officer**: `/authorization/applications` — tabs (Pending Decision/Approved/Denied);
  `/authorization/applications/[id]` — A+B1+B2 read-only + `ApprovalForm` (Approve w/ travel
  assistance toggle, or Deny with a required reason).
- **Admin**: `/admin/leave-types` (add / edit-name / deactivate — reorder wiring is stubbed via
  `useReorderLeaveTypesMutation` but no drag-and-drop UI yet) and `/admin/holidays` (add / delete).

No digital signature capture, DSMS integration, or in-app PDF viewer was built — signature areas are
the backend's PDF-generation concern; the frontend only offers a "Download PDF" action.

## Deferred to a later phase (explicitly out of scope here)

- **Any API shape confirmed by the real backend** — everything above is our best guess; expect
  `features/*/*.ts` and `types/index.ts` to need edits once the BACKEND agent responds.
- snake_case ↔ camelCase reconciliation between DRF and the frontend types.
- Advanced reporting/export UI.
- In-app PDF viewer (download-link only, as scoped).
- Digital signature capture, DSMS integration, certificate flows (explicitly excluded per spec).
- HR search filter UI is present but not yet wired into `getLeaveApplications` params.
- Drag-and-drop reordering UI for leave types (mutation hook exists, no UI).
- `features/users`, `features/departments`, `features/notifications` (beyond the unread-count UI
  slice), `features/dashboard` folders are scaffolded but empty — no confirmed endpoints yet for
  org-unit/user management screens beyond what leaveApi/authApi already cover.
- Real-time notifications (websocket/polling) — only the Redux UI state (`unreadCount`,
  `panelOpen`) exists; nothing populates it yet.
- Server-driven pagination controls on the applications tables (RTK Query params support
  `page`/`pageSize` but no pager UI was added).
- Accessibility pass (labels/ARIA are present at a basic level via `<Label htmlFor>`, but no
  dedicated a11y audit was done).
- Automated tests (unit/e2e) — none were added in this phase.
- Middleware-level (edge) route protection — guarding is currently client-side only
  (`RoleGuard`), not a Next.js `middleware.ts`. Since real enforcement is server-side (Django RBAC)
  this was judged acceptable for phase 1, but a `middleware.ts` redirect could be added later for
  faster/no-flash redirects.

## Coordination with BACKEND agent

A message was sent to the BACKEND agent (name `backend`) requesting confirmed endpoint paths,
request/response shapes, the `Role` enum, and pagination/filter conventions. At the time this file
was written, no reply had arrived, so the app was scaffolded and wired against best-guess shapes
per the instructions, with every assumption isolated to `lib/api`, `features/*/*.ts`, and
`types/index.ts` for easy follow-up.
