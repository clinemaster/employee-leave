# NAOT Digital Leave Management System — Deployment Guide

This document covers production deployment of the Django backend (`backend/`)
and the Next.js frontend (`frontend/`). It reflects the environment variables
and configuration **actually wired up in code** as of this writing (verified
by grepping `backend/naot_leave/settings.py` and `frontend/src`), not the
full variable list from the original spec — several spec-listed variables
(email, document storage, file size limits, application URL) are **not yet
read by any code path**. Those gaps are called out explicitly below so they
aren't mistaken for implemented, configurable behavior.

## 1. Environment variables

### Backend (`backend/naot_leave/settings.py`, read via `python-decouple`)

| Variable | Default (dev) | Notes |
|---|---|---|
| `DJANGO_SECRET_KEY` | `django-insecure-dev-key-change-in-production` | **Must** be overridden in production with a long random value. Never commit the real value. Startup now **raises `ImproperlyConfigured` and refuses to run** if `DJANGO_DEBUG=False` and this is still the dev placeholder — you cannot accidentally deploy with the default key. |
| `DJANGO_DEBUG` | `True` | Set to `False` in production. Controls Django's debug pages / stack traces, and gates the security-header defaults below. |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated. Set to your real domain(s), e.g. `leave.naot.go.tz`. |
| `DATABASE_URL` | `postgres://naot_leave:naot_leave@localhost:5432/naot_leave` | Parsed via `dj_database_url`. Use `postgres://user:pass@host:5432/dbname` in production, or `sqlite:///db.sqlite3` for local/dev only. |
| `DJANGO_TIME_ZONE` | `Africa/Dar_es_Salaam` | Django `TIME_ZONE` setting. |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated list of origins allowed to call the API (the Next.js frontend's origin(s) in production). |
| `PASSWORD_MIN_LENGTH` | `10` | Minimum password length enforced by `AUTH_PASSWORD_VALIDATORS`. |
| `JWT_ACCESS_TOKEN_LIFETIME_HOURS` | `8` | JWT access token lifetime. |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS` | `7` | JWT refresh token lifetime. Rotated refresh tokens are now blacklisted (`BLACKLIST_AFTER_ROTATION=True`) — run migrations after upgrading to pick up the `token_blacklist` app's tables. |
| `THROTTLE_RATE_ANON` / `THROTTLE_RATE_USER` | `60/min` / `300/min` | Blanket DRF rate limits for anonymous/authenticated requests. |
| `THROTTLE_RATE_LOGIN` | `5/min` | Login-endpoint throttle (brute-force protection). |
| `THROTTLE_RATE_PDF_EXPORT` | `10/min` | `.../generate-pdf/` throttle. |
| `THROTTLE_RATE_REPORT_EXPORT` | `20/min` | `/api/reports/leave-applications/` throttle. |
| `THROTTLE_RATE_DOCUMENT_UPLOAD` | `20/min` | `.../upload-document/` throttle. |
| `FILE_SIZE_LIMIT` | `5242880` (5 MB) | Max upload size in bytes, now actually enforced (`apps/documents/uploads.py`) for the supporting-document upload endpoint, and feeds `DATA_UPLOAD_MAX_MEMORY_SIZE`/`FILE_UPLOAD_MAX_MEMORY_SIZE`. This is the previously-unimplemented spec variable — it now works. |
| `SECURE_SSL_REDIRECT` / `SESSION_COOKIE_SECURE` / `CSRF_COOKIE_SECURE` | `not DJANGO_DEBUG` | HTTPS/cookie hardening, on automatically once `DJANGO_DEBUG=False`; override only for an intermediate staging box without TLS yet. |
| `SECURE_HSTS_SECONDS` | `0` in DEBUG, `31536000` (1yr) otherwise | HSTS header duration once behind real TLS. |

Rate-limit counters use Django's default cache backend (in-memory
`LocMemCache` unless you configure `CACHES`) — for more than one app
process/host, point `CACHES` at a shared backend (Redis/Memcached) or the
limits won't be shared across workers. Not yet configured — see
SECURITY.md's "Known gaps".

### Frontend (`frontend/src/lib/api/baseApi.ts`)

| Variable | Default (dev) | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Base URL the frontend calls for the Django API. Must be set to the public API URL in production (e.g. `https://api.leave.naot.go.tz`). Note: the code uses `NEXT_PUBLIC_API_BASE_URL`, not `NEXT_PUBLIC_API_URL`/`API_URL` as named in the original spec — use this exact name. |

### Variables named in the spec but NOT currently implemented in code

The original spec (section 47) lists `EMAIL_HOST`/`EMAIL_PORT`/`EMAIL_USERNAME`/
`EMAIL_PASSWORD`, `STORAGE` config, `DOCUMENT_STORAGE` config, `FILE_SIZE_LIMIT`,
and `APPLICATION_URL`. As of this writing, none of these are read anywhere in
`backend/` or `frontend/` — there is no `django.core.mail` configuration, no
custom storage backend, no upload size limit enforcement, and no
"application base URL" setting used for links in emails/PDFs. Do **not**
assume they work by setting them; they will be silently ignored. If/when
email notifications, cloud object storage, or upload limits are implemented,
add the corresponding `EMAIL_*`, `DEFAULT_FILE_STORAGE`/`STORAGES`,
`FILE_UPLOAD_MAX_MEMORY_SIZE`/`DATA_UPLOAD_MAX_MEMORY_SIZE`, and
`APPLICATION_URL` settings then, and update this table. Today, notifications
are in-app only (`apps.notifications.Notification` rows), file storage is
Django's default local filesystem storage under `MEDIA_ROOT`, and there is no
enforced upload size cap beyond Django's built-in defaults.

### Suggested `.env` files

`backend/.env` (loaded by `python-decouple`, not committed):
```
DJANGO_SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_urlsafe(50))">
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=leave.naot.go.tz
DATABASE_URL=postgres://naot_leave:REDACTED@db-host:5432/naot_leave
DJANGO_TIME_ZONE=Africa/Dar_es_Salaam
CORS_ALLOWED_ORIGINS=https://leave.naot.go.tz
```

`frontend/.env.production` (or set in the hosting platform):
```
NEXT_PUBLIC_API_BASE_URL=https://api.leave.naot.go.tz
```

## 1a. Continuous integration

GitHub Actions workflows in `.github/workflows/` run on every push and pull
request:

- **`backend-ci.yml`** — spins up a Postgres 16 service container, installs
  `requirements.txt`, runs `python manage.py check`, a
  `makemigrations --check --dry-run` guard against un-generated migrations,
  applies `python manage.py migrate` against the service container (the
  practical equivalent of a `migrate --check` gate — it fails the job if
  migrations don't apply cleanly), then runs `pytest --cov=apps` and fails
  the build on any test failure. A second job runs `pip-audit -r
  requirements.txt` (informational — annotates findings, doesn't fail the
  build; see SECURITY.md).
- **`frontend-ci.yml`** — installs Node dependencies with `npm ci` in
  `frontend/`, then runs `npm run lint`, `npm test -- --ci`, and `npm run
  build`, failing on any error. A second job runs `npm audit
  --audit-level=high`, which **does** fail the build on high/critical
  vulnerabilities.
- **`dependency-review.yml`** — on pull requests, runs GitHub's native
  `dependency-review-action` to flag newly-introduced vulnerable
  dependencies in the diff against the base branch.

Together these close the "no CI dependency scanning" gap previously noted in
SECURITY.md. Required CI env vars for the backend job (`DATABASE_URL`,
`DJANGO_SECRET_KEY`, etc.) are set inline in the workflow using
throwaway/test values — they are not production secrets and don't need to be
added as repo secrets for CI to pass.

Note: these workflow files were authored and locally validated for YAML
correctness (`python -c "import yaml; yaml.safe_load(...)"`) and the
commands they wire up (`pytest`, `npm run lint`, `npm test`, `npm run
build`) were confirmed to run successfully directly in this repo. They have
not yet been exercised against real GitHub Actions infrastructure — confirm
on the first push/PR that triggers them.

## 2. Database migration steps

```bash
cd backend
# Point DATABASE_URL at the real Postgres instance (see .env above)
python manage.py migrate
python manage.py createsuperuser   # first SYSTEM_ADMIN account
```

For subsequent deploys: run `python manage.py migrate` after pulling new code
and before restarting the app server, as part of your deploy script. Take a
database backup immediately before running migrations against production
data (see §7).

## 3. Build steps

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate   # or source .venv/bin/activate on Linux
pip install -r ../requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate
```

Run with a production WSGI server (Gunicorn is not currently in
`requirements.txt` — add it):
```bash
pip install gunicorn
gunicorn naot_leave.wsgi:application --bind 0.0.0.0:8000 --workers 3
```

### Frontend

```bash
cd frontend
npm ci
npm run build
npm run start   # runs `next start`, defaults to port 3000
```

Run the Next.js server behind a process manager (pm2, systemd, or a
container orchestrator) so it restarts on crash/reboot.

## 4. Reverse proxy (nginx example)

Terminate TLS at nginx, proxy `/api/` to Django (Gunicorn on 127.0.0.1:8000)
and everything else to Next.js (127.0.0.1:3000):

```nginx
server {
    listen 80;
    server_name leave.naot.go.tz;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name leave.naot.go.tz;

    ssl_certificate     /etc/letsencrypt/live/leave.naot.go.tz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/leave.naot.go.tz/privkey.pem;

    client_max_body_size 20M;  # allow document uploads

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/ {
        alias /srv/naot-leave/backend/staticfiles/;
    }

    # Do NOT alias /media/ directly — leave documents are private (see §5).
    # Serve them through the Django view stack so RBAC is enforced.

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

If the Django API is deployed on a separate host/subdomain from the Next.js
app (recommended), split this into two server blocks and set
`NEXT_PUBLIC_API_BASE_URL` accordingly; keep `CORS_ALLOWED_ORIGINS` on the
Django side in sync with the frontend's public origin.

## 5. HTTPS / TLS

- Obtain certificates via Let's Encrypt (`certbot --nginx`) or your
  organization's CA; renew automatically (`certbot renew` on a cron/systemd
  timer).
- Set `DJANGO_DEBUG=False` and add standard Django hardening settings not
  currently in `settings.py` — recommended additions before go-live:
  `SECURE_SSL_REDIRECT = True`, `SESSION_COOKIE_SECURE = True`,
  `CSRF_COOKIE_SECURE = True`, `SECURE_HSTS_SECONDS`, and
  `SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')` (required
  since nginx terminates TLS in front of Gunicorn). These are not yet in the
  codebase — see SECURITY.md.
- Force HTTPS at the nginx layer (the `return 301` block above) as a backstop
  even before those Django settings are added.

## 6. Static / media file serving — private documents

Leave application PDFs are written under `MEDIA_ROOT/leave_documents/`
(`LEAVE_PDF_MEDIA_SUBDIR` in settings.py) using Django's default local
filesystem storage. These are **sensitive personal documents** and must not
be served as plain static files from nginx (unlike `/static/`, which is
public CSS/JS/admin assets).

Recommended production approach:
- Do not add an `alias /media/` nginx location for `leave_documents/`.
- Serve generated PDFs and other uploaded documents through an authenticated
  Django view/endpoint that checks the requesting user's permission on the
  related `LeaveApplication` before streaming the file (equivalent RBAC to
  the API's application endpoints). If such an endpoint doesn't already
  exist, add one rather than exposing `MEDIA_ROOT` directly.
- If nginx must serve the bytes for performance, use the `X-Accel-Redirect`
  pattern: Django authorizes the request, then returns
  `X-Accel-Redirect: /protected-media/leave_documents/<file>` and nginx maps
  `/protected-media/` to an `internal;` location pointing at `MEDIA_ROOT`
  (not reachable directly by clients).
- Set `MEDIA_ROOT` to a disk volume that is backed up (see §7) and, ideally,
  outside the web server's document root entirely.
- For a multi-instance deployment, move `MEDIA_ROOT` to shared/networked
  storage (or S3-compatible object storage with a private bucket + signed
  URLs) so all app instances see the same files — this is the `STORAGE` /
  `DOCUMENT_STORAGE` config named in the original spec but not yet
  implemented; today the app assumes a single local filesystem.

## 7. Logging and monitoring

- Django: add a `LOGGING` dict to `settings.py` (not currently present) that
  writes to stdout/stderr in production so the process manager or container
  runtime captures it, plus a rotating file handler for `django.request` and
  `django.security` if running on a single host. Route application errors to
  an error tracker (e.g. Sentry) — none is currently wired up.
- `apps.audit.AuditLog` already captures business-level events (workflow
  transitions, etc.) inside the app database; this is not a substitute for
  infrastructure logging (access logs, 5xx rates, latency).
- nginx access/error logs: keep default paths, rotate with `logrotate`.
- Next.js: run under a process manager that captures stdout (pm2 `pm2 logs`,
  or container log driver); watch for build-time vs runtime errors
  separately.
- Monitor at minimum: HTTP 5xx rate, Django process uptime, Postgres
  connection count/disk usage, disk usage on the `MEDIA_ROOT` volume
  (PDFs accumulate over time), and certificate expiry.

## 8. Backup guidance (spec section 49)

Back up, on a schedule appropriate to change volume (nightly full + more
frequent incremental/WAL for the database is typical for a system of record
like leave applications):

1. **Database** (Postgres) — `pg_dump` (or continuous WAL archiving /
   managed-service automated backups) covering all app tables: users,
   organization structure, `LeaveApplication` + B1/B2/C sub-records,
   `LeaveDependant`, `LeaveBalance`, `LeaveType`, `Holiday`,
   `DocumentTemplate`/`LeaveDocument`/`DocumentVersion`, `Notification`,
   and `AuditLog`. This is the highest-priority backup — it's the source of
   truth for everything else.
2. **Uploaded documents and generated PDFs** — everything under
   `MEDIA_ROOT` (`leave_documents/` and any other upload subdirs). Back up
   at the filesystem level (rsync/snapshot) or, if migrated to object
   storage, rely on the storage provider's versioning/replication plus your
   own periodic export.
3. **Audit logs** — currently stored in the same Postgres database as
   everything else (`apps.audit.AuditLog`), so they're covered by the
   database backup in (1); no separate export needed unless you want an
   append-only offsite copy for compliance (e.g. periodic export to
   write-once storage, given the model is designed to be immutable).
4. **Templates and logos** — `backend/apps/documents/assets/` (emblem/logo
   assets used by the PDF generator) and any `DocumentTemplate` rows/files.
   These change rarely; back up whenever they're updated, and ensure they're
   included in version control or a dedicated asset backup, not just
   `MEDIA_ROOT` snapshots.
5. **Application code and configuration** — already covered by git, but
   `.env` files (secrets) are deliberately not committed; store them in a
   secrets manager or an encrypted vault with its own backup, not in the
   repo.

Test restores periodically (restore a `pg_dump` to a scratch database, verify
a sampled PDF/document round-trips) — an untested backup is not a backup.
Define and document retention (e.g. 30 daily + 12 monthly database backups)
and an offsite/secondary-region copy so a single-site failure doesn't lose
both primary and backup.
