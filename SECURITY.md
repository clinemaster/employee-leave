# NAOT Digital Leave Management System — Security Summary

Honest status of what's implemented vs. what's a placeholder/TODO for a real
production rollout. Based on reading `backend/apps/*` (esp.
`apps/leave/permissions.py`, `apps/documents/uploads.py`, `apps/audit/`) and
`backend/naot_leave/settings.py`.

## Implemented

**RBAC (role-based access control)** — `apps/leave/permissions.py` is the
single server-side source of truth for who may read/write which section of a
`LeaveApplication` (Section A = employee, B1 = HOD/HOS/HOU, B2 = HR_ADMIN,
C = Authorizing Officer). `assert_can_edit_fields()` re-validates every write
against an explicit per-role field allowlist regardless of what the client
sends, and explicitly documents that the frontend's own role gating "MUST NOT
be trusted." `visible_queryset_for()` row-filters list endpoints per role.

**JWT authentication** — `djangorestframework-simplejwt`, configured with an
access/refresh lifetime that defaults to 8 hours / 7 days
(`JWT_ACCESS_TOKEN_LIFETIME_HOURS` / `JWT_REFRESH_TOKEN_LIFETIME_DAYS` env
vars, both overridable) and refresh rotation (`ROTATE_REFRESH_TOKENS =
True`). `rest_framework_simplejwt.token_blacklist` is now installed and
`BLACKLIST_AFTER_ROTATION = True` — a rotated-out refresh token is
blacklisted immediately, so a leaked-but-since-rotated refresh token can no
longer be replayed. (Run `python manage.py migrate` after pulling this
change — it adds the blacklist app's tables.)

**IDOR protection** — `can_view_application()` and
`CanAccessLeaveApplication` (object-level DRF permission) restrict access to
an application to the applicant, their routed HOD/reviewer, or a role with
org-wide visibility (HR_ADMIN, AUTHORIZING_OFFICER, SYSTEM_ADMIN) — a random
authenticated user cannot fetch or act on someone else's application by
guessing an ID. The same object-permission re-check backs the new document
upload/download endpoints (see "File uploads" below) — a user who can't view
an application can't attach to or download from it either.

**Input validation** — DRF serializers validate field types/choices at the
API boundary; `assert_can_edit_fields` additionally rejects out-of-section
field writes at the permission layer (defense in depth beyond serializer
`read_only` fields).

**Audit logging** — `apps.audit.AuditLog` records workflow events
(user, role, action, previous/new status, IP address, timestamp).
`AuditLogAdmin.has_change_permission`/`has_delete_permission` both return
`False`, so the model is immutable via Django admin; there is no
update/delete route exposed via the API either (verified by the backend
test suite's audit-immutability tests).

**CORS** — restricted via `CORS_ALLOWED_ORIGINS` (explicit allowlist, not
`CORS_ALLOW_ALL_ORIGINS`), with credentials allowed only for those origins.

**CSRF posture (audited, not assumed)** — `django.middleware.csrf.
CsrfViewMiddleware` is enabled in `MIDDLEWARE` for the whole project,
including Django admin (`/admin/`), which is session/cookie authenticated —
admin `POST`s are CSRF-protected exactly as Django intends, and this needed
no change. For the REST API consumed by the Next.js SPA: the primary and
only auth path used in practice is `JWTAuthentication` (`Authorization:
Bearer <token>` header) — bearer tokens in a custom header aren't
automatically attached by a browser the way a cookie is, so this path is not
CSRF-vulnerable in the classic sense (there is no ambient credential for a
third-party site to ride). `SessionAuthentication` is also still listed in
`DEFAULT_AUTHENTICATION_CLASSES` as a secondary class (mainly so the
DRF browsable API works for local debugging while logged into Django admin
in the same browser); DRF's `SessionAuthentication` itself enforces CSRF
checks on unsafe methods when a request *is* authenticated via session
cookie, so this is not an open hole — but if the browsable API is not needed
in production, removing `SessionAuthentication` from
`DEFAULT_AUTHENTICATION_CLASSES` further shrinks the attack surface (left as
a deployment-time decision, see DEPLOYMENT.md).

**Rate limiting** — DRF throttling is now configured
(`REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES']`): a blanket `AnonRateThrottle`
/ `UserRateThrottle` on every request (defaults 60/min anonymous, 300/min
authenticated — env: `THROTTLE_RATE_ANON`, `THROTTLE_RATE_USER`), plus
tighter `ScopedRateThrottle` scopes on the endpoints that most need it:
- **Login** (`POST /api/auth/login/`) — default 5/min per client
  (`THROTTLE_RATE_LOGIN`), brute-force/credential-stuffing protection.
- **PDF generation** (`POST /api/leave-applications/{id}/generate-pdf/`) —
  default 10/min (`THROTTLE_RATE_PDF_EXPORT`), since PDF rendering is CPU/IO
  work per call.
- **Report export** (`GET /api/reports/leave-applications/`) — default
  20/min (`THROTTLE_RATE_REPORT_EXPORT`), since it streams a full filtered
  query result.
- **Document upload** (`POST /api/leave-applications/{id}/upload-document/`)
  — default 20/min (`THROTTLE_RATE_DOCUMENT_UPLOAD`).

All rates are env-configurable so ops can tune per deployment without a code
change. Exceeding a limit returns `429 Too Many Requests`.

**File upload security (supporting documents)** — there was previously no
supporting-document upload path at all (only generated PDFs existed as
`LeaveDocument` rows). This is now implemented as a minimal, intentionally
narrow endpoint:
- `POST /api/leave-applications/{id}/upload-document/` — employee-only, own
  application only, only while the application is `DRAFT` or
  `RETURNED_TO_EMPLOYEE`. One file per call (`SUPPORTING_ATTACHMENT`
  `LeaveDocument`); call it again to attach another.
- `GET /api/leave-applications/{id}/documents/{document_id}/download/` — the
  **only** supported way to fetch a document's bytes (generated PDF or
  supporting attachment). It re-runs the same object-level permission check
  as every other application endpoint (`CanAccessLeaveApplication` /
  `can_view_application`) before streaming the file — there is no direct,
  unauthenticated file URL. `/media/...` is not served at all by Django
  outside `DEBUG` (see `naot_leave/urls.py` — the `static()` mount is
  `if settings.DEBUG`), and DEPLOYMENT.md §6 already told nginx not to alias
  `/media/` either, so this download view is the only path to the bytes in
  production.
- Validation (`apps/documents/uploads.py`, `validate_upload()`):
  1. **Extension allowlist** — `.pdf`, `.jpg`, `.jpeg`, `.png` only.
  2. **Magic-byte / file-signature check** — the file's actual leading
     bytes must match the claimed type (`%PDF-` for PDF, `\xff\xd8\xff` for
     JPEG, the PNG signature for PNG). A renamed executable or HTML file
     with a `.jpg` extension is rejected even though the extension alone
     would pass.
  3. **Size limit** — `settings.FILE_SIZE_LIMIT` (env: `FILE_SIZE_LIMIT`,
     bytes; default 5 MB), the spec's previously-unimplemented variable.
     `DATA_UPLOAD_MAX_MEMORY_SIZE` / `FILE_UPLOAD_MAX_MEMORY_SIZE` are also
     derived from it so Django itself rejects an oversized request body
     before it's fully read into memory.
- Storage location is unchanged from generated PDFs — local filesystem under
  `MEDIA_ROOT/leave_documents/`, i.e. **not** under any path Django or nginx
  serves publicly (see above).
- **Not implemented: virus/malware scanning.** Validation here confirms a
  file is structurally what it claims to be (right extension, right magic
  bytes, within the size cap) — it does not scan file contents for malware.
  See "Known gaps" below; this remains explicitly out of scope for this
  pass.

**Secrets from environment, no silent production fallback** —
`DJANGO_SECRET_KEY`, `DATABASE_URL` (DB credentials), and the JWT signing
key (JWT uses `SECRET_KEY` by default under simplejwt) are all read from env
vars via `python-decouple`. The dev-only placeholder
(`django-insecure-dev-key-change-in-production`) still exists as the
*default* for local development convenience, but `settings.py` now raises
`ImproperlyConfigured` at startup if `DJANGO_DEBUG=False` and
`DJANGO_SECRET_KEY` is still that placeholder — it is no longer possible to
accidentally deploy to production with the committed dev key. (`.env` is
still assumed to be gitignored and access-controlled at the host level;
there's no integration with a dedicated secrets manager — see "Known gaps".)

**Production hardening headers** — `settings.py` now sets, all env-gated and
off in `DEBUG` by default: `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`,
`CSRF_COOKIE_SECURE`, `SECURE_HSTS_SECONDS` (1 year once enabled, with
`SECURE_HSTS_INCLUDE_SUBDOMAINS`/`SECURE_HSTS_PRELOAD`), plus
`SECURE_CONTENT_TYPE_NOSNIFF = True` and `X_FRAME_OPTIONS = 'DENY'`
unconditionally (harmless in dev, no reason to gate those two). When
`DJANGO_DEBUG=False`, `SECURE_PROXY_SSL_HEADER` is also set to
`('HTTP_X_FORWARDED_PROTO', 'https')`, matching the nginx reverse-proxy
setup in DEPLOYMENT.md §4/§5 (required for `SECURE_SSL_REDIRECT` and secure
cookies to behave correctly behind a TLS-terminating proxy).

**Password policy** — Django's `AUTH_PASSWORD_VALIDATORS` (similarity,
minimum length, common-password, numeric-password checks) is enabled, now
with an explicit minimum length of 10 (env: `PASSWORD_MIN_LENGTH`,
previously relying on Django's unconfigured default of 8) — a slightly
stronger bar appropriate for a government HR system. Still no MFA (see
"Known gaps").

## Known gaps / TODOs for production

- **No virus/malware scanning on uploaded documents.** The new upload
  validation (extension + magic bytes + size) confirms a file is
  structurally what it claims to be; it does **not** scan file contents.
  For production, integrate a scanner (e.g. ClamAV, or a cloud AV API) in
  the upload path (`apps/documents/uploads.py:validate_upload`) before the
  file is persisted.
- **No account lockout** after repeated failed logins beyond the rate
  limit — the login endpoint is now throttled (429 after the configured
  rate), which meaningfully slows brute force, but there is no
  per-account lockout/backoff independent of the throttle (e.g. locking an
  account after N failed attempts regardless of source IP/client).
- **No MFA** — password-only authentication.
- **Secrets management** — configuration is read from plain environment
  variables / `.env` via `python-decouple`, with no integration with a
  dedicated secrets manager (Vault, AWS/GCP Secrets Manager, etc.). The
  dev-placeholder `SECRET_KEY` can no longer silently reach production (see
  above), but rotation, access auditing, and encryption-at-rest for `.env`
  itself are still operational responsibilities, not code-enforced.
- **`SessionAuthentication` is still enabled alongside JWT** in
  `DEFAULT_AUTHENTICATION_CLASSES`, primarily to keep the DRF browsable API
  usable for local debugging. It is CSRF-safe as configured (see "CSRF
  posture" above), but if the browsable API isn't needed in production,
  removing it from the production settings further reduces attack surface.
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
- **Document storage is single-host local filesystem** — fine for one app
  instance; a multi-instance deployment needs shared/networked storage or
  S3-compatible object storage with signed URLs (see DEPLOYMENT.md §6),
  which is not implemented.
- **Rate-limit storage is Django's default cache backend** (in-memory
  `LocMemCache` unless a real cache is configured) — for a multi-process/
  multi-host deployment, point `CACHES['default']` at a shared backend
  (e.g. Redis/Memcached) or throttle counters won't be shared across
  workers/instances, undermining the limits above. Not yet configured —
  add this alongside a real `CACHES` setting before scaling out.

## Bottom line

The workflow-level authorization model (RBAC + IDOR + field-level section
enforcement + immutable audit trail) is implemented thoughtfully and remains
the system's strongest area. This pass closed the previously-listed
infrastructure gaps that were straightforward to close in-code: rate
limiting, refresh-token blacklisting, HTTPS/cookie hardening settings,
secret-fallback protection, stronger password policy, and — since it didn't
exist yet — a minimal, validated, authenticated-only supporting-document
upload/download path. What's left (virus scanning, MFA, account lockout,
a real secrets manager, shared cache for multi-instance throttling,
logging/monitoring, dependency scanning) is genuinely out of scope for a
code-only pass and is called out above rather than left implicit.
