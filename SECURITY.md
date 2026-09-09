# NAOT Digital Leave Management System — Security Summary

Honest status of what's implemented vs. what's a placeholder/TODO for a real
production rollout. Based on reading `backend/apps/*` (esp.
`apps/leave/permissions.py`, `apps/audit/`) and `backend/naot_leave/settings.py`.

## Implemented

**RBAC (role-based access control)** — `apps/leave/permissions.py` is the
single server-side source of truth for who may read/write which section of a
`LeaveApplication` (Section A = employee, B1 = HOD/HOS/HOU, B2 = HR_ADMIN,
C = Authorizing Officer). `assert_can_edit_fields()` re-validates every write
against an explicit per-role field allowlist regardless of what the client
sends, and explicitly documents that the frontend's own role gating "MUST NOT
be trusted." `visible_queryset_for()` row-filters list endpoints per role.

**JWT authentication** — `djangorestframework-simplejwt`, configured with an
8-hour access token lifetime, 7-day refresh, and refresh rotation
(`ROTATE_REFRESH_TOKENS = True`). Note `BLACKLIST_AFTER_ROTATION = False` —
rotated-out refresh tokens are not blacklisted (see Gaps).

**IDOR protection** — `can_view_application()` and
`CanAccessLeaveApplication` (object-level DRF permission) restrict access to
an application to the applicant, their routed HOD/reviewer, or a role with
org-wide visibility (HR_ADMIN, AUTHORIZING_OFFICER, SYSTEM_ADMIN) — a random
authenticated user cannot fetch or act on someone else's application by
guessing an ID.

**Input validation** — DRF serializers validate field types/choices at the
API boundary; `assert_can_edit_fields` additionally rejects out-of-section
field writes at the permission layer (defense in depth beyond serializer
`read_only` fields).

**Audit logging** — `apps.audit.AuditLog` records workflow events
(user, role, action, previous/new status, IP address, timestamp).
`AuditLogAdmin.has_change_permission`/`has_delete_permission` both return
`False`, so the model is immutable via Django admin; there is no
update/delete route exposed via the API either (verify with the new backend
test suite's audit-immutability tests).

**CORS** — restricted via `CORS_ALLOWED_ORIGINS` (explicit allowlist, not
`CORS_ALLOW_ALL_ORIGINS`), with credentials allowed only for those origins.

**CSRF** — `django.middleware.csrf.CsrfViewMiddleware` is enabled in
`MIDDLEWARE`. Because the API auth mechanism is JWT bearer tokens (not
session cookies) for `rest_framework_simplejwt`, most API calls aren't
CSRF-vulnerable in the classic sense; `SessionAuthentication` is also enabled
as a secondary authentication class, which *does* interact with CSRF for any
browsable-API/cookie-based use — see Gaps.

## Known gaps / TODOs for production

- **`DJANGO_SECRET_KEY` default is a dev placeholder** committed in
  `settings.py` (`django-insecure-dev-key-change-in-production`). Must be
  overridden via env var before any real deployment; if it was ever deployed
  with the default, rotate it.
- **No rate limiting** — no `django-ratelimit`/DRF throttle classes
  configured (`REST_FRAMEWORK` has no `DEFAULT_THROTTLE_CLASSES`). Login and
  other endpoints are unprotected against brute force / credential stuffing.
  Add DRF throttling (or a reverse-proxy level limiter, e.g. nginx
  `limit_req`) before go-live.
- **Refresh tokens are not blacklisted after rotation**
  (`BLACKLIST_AFTER_ROTATION = False`) and there's no `token_blacklist` app
  wired in — a stolen refresh token remains valid for its full 7-day
  lifetime even after the user's next legitimate refresh. Enable
  `rest_framework_simplejwt.token_blacklist` and blacklist-after-rotation for
  production.
- **No production hardening settings** — `settings.py` has none of
  `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`,
  `SECURE_HSTS_SECONDS`, or `SECURE_PROXY_SSL_HEADER`. These must be added
  (see DEPLOYMENT.md §5) before serving real traffic over HTTPS behind a
  proxy.
- **No virus/malware scanning on uploaded documents.** Whatever file-upload
  handling exists in `apps.documents`/`apps.leave` accepts and stores files
  without scanning them. For production, integrate a scanner (e.g. ClamAV)
  in the upload path before persisting files, and validate MIME type/content
  server-side (not just file extension).
- **No enforced upload size limit** beyond Django's generic defaults —
  the spec's `FILE_SIZE_LIMIT` variable isn't implemented anywhere (see
  DEPLOYMENT.md). Add explicit per-endpoint size validation.
- **No secrets management** — configuration is read from plain environment
  variables / `.env` via `python-decouple`, with no integration with a
  secrets manager (Vault, AWS/GCP Secrets Manager, etc.). Fine for a small
  deployment if `.env` is properly access-controlled and excluded from
  version control (confirm `.gitignore` covers it), but not a substitute for
  a managed secrets store at larger scale.
- **Password policy** relies entirely on Django's default
  `AUTH_PASSWORD_VALIDATORS` (similarity, minimum length, common-password,
  numeric-password checks) — reasonable defaults, but no explicit minimum
  length beyond Django's default (8) is configured, and there's no MFA.
- **No account lockout** after repeated failed logins (compounds the
  rate-limiting gap above).
- **`SessionAuthentication` is enabled alongside JWT** in
  `DEFAULT_AUTHENTICATION_CLASSES`. If the browsable API or any
  cookie-session flow is exposed to real users (as opposed to being purely
  JWT-in-header from the Next.js SPA), verify CSRF tokens are actually being
  supplied for those requests, or remove `SessionAuthentication` from the
  production config if it's unused.
- **Audit log storage is not independently durable** — it lives in the same
  Postgres database as everything else, so a database-level compromise
  (e.g. an attacker with raw SQL access) could still alter history despite
  the API/admin being locked down. For stronger tamper-evidence, consider
  periodic export to write-once/append-only storage.
- **No dependency/vulnerability scanning configured** (no `pip-audit`,
  `npm audit` step, or Dependabot config observed) — add one to CI before
  production rollout.
- **Logging/monitoring not yet configured** in `settings.py` (no `LOGGING`
  dict, no error tracker integration) — see DEPLOYMENT.md §7.

## Bottom line

The workflow-level authorization model (RBAC + IDOR + field-level section
enforcement + immutable audit trail) is implemented thoughtfully and is the
system's strongest area. The gaps above are mostly standard "harden before
production" infrastructure items (secret rotation, rate limiting, HTTPS
hardening settings, virus scanning, secrets management) rather than design
flaws in the access-control model itself — treat this list as the go-live
checklist, not evidence the current design is unsound.
