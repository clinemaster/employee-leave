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
- **Virus/malware scanning (ClamAV)** — `apps/documents/uploads.py` now has
  `scan_for_malware()`, called after the extension/magic-byte/size checks
  above, before the file is persisted. Gated by `CLAMAV_ENABLED` (env,
  default `False`): when off, scanning is skipped and a log line notes it —
  this is safe for dev/CI/most sandboxes where no ClamAV daemon runs. When
  `CLAMAV_ENABLED=true`, it connects to a ClamAV daemon over TCP
  (`clamd.ClamdNetworkSocket`, `CLAMAV_HOST`/`CLAMAV_PORT` env vars,
  defaulting to `localhost:3310`) and streams the file to `instream()`;
  a result of `FOUND` (infected) rejects the upload with a 400. If scanning
  is enabled but the daemon is unreachable, the upload is rejected
  (fail-closed) rather than silently let through — a production deployer who
  turned scanning on gets a hard error, not a false sense of security.
  **Honesty note:** this integration is implemented and unit-tested against
  a mocked `clamd` client (clean result, infected result, and
  connection-error paths all covered — see
  `apps/documents/tests/test_uploads.py`), but it has **not** been
  exercised against a real, running ClamAV daemon in this environment (none
  is available here). Deployers must stand up an actual `clamd` instance and
  set `CLAMAV_ENABLED=true` plus `CLAMAV_HOST`/`CLAMAV_PORT` for this to
  provide real protection in production — see DEPLOYMENT.md.

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

**CI dependency/vulnerability scanning** — GitHub Actions now runs on every
push and pull request (`.github/workflows/`):
- `backend-ci.yml` runs `python manage.py check`, a migrations-check,
  `pytest` with coverage against a real Postgres service container, and a
  `pip-audit -r requirements.txt` job (informational — logs a warning
  annotation on findings without failing the build; tighten to a hard
  failure once existing findings are triaged).
- `frontend-ci.yml` runs `npm ci`, `npm run lint`, `npm test`, `npm run
  build`, and a separate `npm audit --audit-level=high` job (this one **does
  fail the build** on high/critical vulnerabilities).
- `dependency-review.yml` runs GitHub's native `dependency-review-action` on
  pull requests, diffing changed manifests against the base branch.

This closes the previously-listed "no dependency/vulnerability scanning
configured" gap. See DEPLOYMENT.md for a description of the CI setup. Note:
these workflow files have been validated locally for YAML correctness and
the underlying commands (`pytest`, `npm test`, `npm run lint`, `npm run
build`) all pass when run directly in this repo, but the workflows
themselves have not been exercised against real GitHub Actions
infrastructure yet — verify on the first push/PR.

**Password policy** — Django's `AUTH_PASSWORD_VALIDATORS` (similarity,
minimum length, common-password, numeric-password checks) is enabled, now
with an explicit minimum length of 10 (env: `PASSWORD_MIN_LENGTH`,
previously relying on Django's unconfigured default of 8) — a slightly
stronger bar appropriate for a government HR system.

**MFA (implemented, opt-in)** — TOTP-based two-factor authentication
(`apps/accounts/mfa.py`, `mfa_views.py`), compatible with any standard
authenticator app (Google Authenticator, Authy, 1Password, etc.), via
`pyotp`. Any role may enable it for their own account; it is not yet
mandatory for any role (including SYSTEM_ADMIN / AUTHORIZING_OFFICER — see
"Known gaps" for the enforcement-by-role follow-up).
- `User.mfa_secret` is encrypted at rest with Fernet (key derived from
  `SECRET_KEY` via SHA-256) — never stored as plaintext, and never included
  in any API response (not even write-only) — see `UserSerializer` and the
  dedicated MFA request serializers.
- `POST /api/auth/mfa/setup/` generates a secret + `otpauth://` provisioning
  URI (does not enable MFA yet); `POST /api/auth/mfa/verify-setup/` confirms
  a live code and flips `mfa_enabled=True`; `POST /api/auth/mfa/disable/`
  requires the user's current password. All three act only on the
  requesting user's own account — self-service only in this phase, no admin
  override to set/clear MFA for someone else.
- Login: an MFA-enabled user's `POST /api/auth/login/` returns
  `{"mfa_required": true, "mfa_token": "..."}` (a signed, 5-minute-lived
  token, `django.core.signing`) instead of a JWT pair; the client then calls
  `POST /api/auth/mfa/login-verify/` with that token + a TOTP code to
  receive the real access/refresh pair.
- Replay protection: `User.mfa_last_verified_step` records the last TOTP
  time-step consumed at login, so a captured/observed login code can't be
  replayed even while it's still numerically valid within its window.
- Rate limiting: `verify-setup` and `login-verify` share a new
  `mfa_verify` `ScopedRateThrottle` scope (default 5/min, env
  `THROTTLE_RATE_MFA_VERIFY`) — a 6-digit code is only ~1e6 combinations and
  must be throttled tightly regardless of the blanket per-user/anon rates.
- Tests: `backend/apps/accounts/tests/test_mfa.py` (setup, verify-setup
  success/failure, login challenge, login-verify success/wrong-code/replay/
  invalid-token, disable password check, self-service-only scope,
  throttling).

**API documentation (Swagger/OpenAPI)** — `drf-spectacular` generates docs
from the actual views/serializers at `/api/docs/` (Swagger UI), `/api/redoc/`
(ReDoc), and `/api/schema/` (raw OpenAPI YAML). All three are deliberately
public (`AllowAny`), same posture as any public API reference — they expose
endpoint *shapes*, not data or secrets. If a future deployment wants these
gated (e.g. an internal-only API with no public docs appetite), that's a
one-line change to `permission_classes` on the three routes in
`naot_leave/urls.py`.

## Known gaps / TODOs for production

- **No account lockout** after repeated failed logins beyond the rate
  limit — the login endpoint is now throttled (429 after the configured
  rate), which meaningfully slows brute force, but there is no
  per-account lockout/backoff independent of the throttle (e.g. locking an
  account after N failed attempts regardless of source IP/client).
- **MFA is opt-in, not enforced by role.** TOTP MFA is implemented and
  self-service (see "Implemented" above), but nothing in code requires
  SYSTEM_ADMIN / AUTHORIZING_OFFICER (the highest-value targets) to have it
  enabled — a compromised password alone is still sufficient for an account
  that hasn't opted in. Enforcing MFA for specific roles (reject login, or
  force a setup prompt, until enabled) is a follow-up, not yet built.
- **No backup/recovery codes for MFA.** If a user loses their authenticator
  device, there is currently no self-service recovery path — re-enabling
  access requires a SYSTEM_ADMIN (via Django admin/shell) to clear
  `mfa_enabled`/`mfa_secret` on their behalf. One-time backup codes are a
  natural follow-up.
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
- **Logging/monitoring not yet configured** in `settings.py` (no `LOGGING`
  dict, no error tracker integration) — see DEPLOYMENT.md §7.
- **Document storage is single-host local filesystem** — fine for one app
  instance; a multi-instance deployment needs shared/networked storage or
  S3-compatible object storage with signed URLs (see DEPLOYMENT.md §6),
  which is not implemented.
- **Shared cache for multi-instance rate limiting — now implemented,
  opt-in via env.** `settings.py`'s `CACHES['default']` uses
  `django_redis.cache.RedisCache` when the `REDIS_URL` env var is set, and
  falls back to Django's in-memory `LocMemCache` when it's unset (so local
  dev/CI/pytest never need a live Redis instance). DRF's throttle classes
  (`AnonRateThrottle`/`UserRateThrottle`/`ScopedRateThrottle`) use the
  `default` cache alias without any further change, so once `REDIS_URL` is
  set in production, rate-limit counters are automatically shared across
  every app instance/worker. **This is still a deployment-time decision,
  not automatic**: a deployment that never sets `REDIS_URL` still runs on
  per-process `LocMemCache`, and in a multi-instance/load-balanced setup
  that means each instance enforces its own independent counters — a client
  routed across N instances can get up to N times the intended rate limit.
  See DEPLOYMENT.md for the `REDIS_URL` setup and this tradeoff.

## Bottom line

The workflow-level authorization model (RBAC + IDOR + field-level section
enforcement + immutable audit trail) is implemented thoughtfully and remains
the system's strongest area. This pass closed the previously-listed
infrastructure gaps that were straightforward to close in-code: rate
limiting, refresh-token blacklisting, HTTPS/cookie hardening settings,
secret-fallback protection, stronger password policy, a minimal, validated,
authenticated-only supporting-document upload/download path, CI
dependency/vulnerability scanning (pip-audit, npm audit, GitHub dependency
review) on every push/PR, a shared Redis cache backend for correct
multi-instance rate limiting (opt-in via `REDIS_URL`), ClamAV malware
scanning on uploads (opt-in via `CLAMAV_ENABLED`, unit-tested against a
mocked scanner but not yet exercised against a live daemon — see above),
and TOTP-based MFA (opt-in per user, self-service setup/disable, replay-
protected and rate-limited login-verify step). What's left (MFA enforced
by role, MFA recovery codes, account lockout, a real secrets manager,
logging/monitoring) is genuinely out of scope for a code-only pass and is
called out above rather than left implicit.
