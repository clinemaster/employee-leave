"""
Django settings for naot_leave project (NAOT Digital Leave Management System).
"""
from pathlib import Path
from datetime import timedelta
import os

try:
    from decouple import config
except ImportError:  # pragma: no cover - fallback if python-decouple isn't installed yet
    def config(key, default=None, cast=None):
        val = os.environ.get(key, default)
        if cast and val is not None:
            return cast(val)
        return val

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

_DEV_SECRET_KEY = 'django-insecure-dev-key-change-in-production'
SECRET_KEY = config('DJANGO_SECRET_KEY', default=_DEV_SECRET_KEY)

DEBUG = config('DJANGO_DEBUG', default=True, cast=bool)

# Never allow the system to run with the dev placeholder key once DEBUG is
# off — this is the single most common "forgot to set env vars" production
# footgun. Fail loudly at startup instead of silently shipping a known,
# publicly-committed signing key.
if not DEBUG and SECRET_KEY == _DEV_SECRET_KEY:
    raise ImproperlyConfigured(
        'DJANGO_SECRET_KEY is unset (or still the dev placeholder) while '
        'DJANGO_DEBUG=False. Set a real, random DJANGO_SECRET_KEY env var '
        'before running in production.'
    )

ALLOWED_HOSTS = config('DJANGO_ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')

# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'django_filters',
    'corsheaders',
    'drf_spectacular',

    # Local apps
    'apps.accounts',
    'apps.organization',
    'apps.leave',
    'apps.documents',
    'apps.notifications',
    'apps.audit',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'naot_leave.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'naot_leave.wsgi.application'

# Database
# Reads DATABASE_URL env var; defaults to a local Postgres URL so the backend
# agent can point this at a real Postgres instance. Falls back to sqlite only
# if explicitly requested via DATABASE_URL=sqlite:///db.sqlite3 (useful for
# generating migrations without a live Postgres server).

DATABASE_URL = config(
    'DATABASE_URL',
    default='postgres://naot_leave:naot_leave@localhost:5432/naot_leave',
)

DATABASES = {
    'default': dj_database_url.parse(DATABASE_URL, conn_max_age=600)
}

AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        # Stronger than Django's default of 8 — reasonable baseline for a
        # government system holding personal/HR data.
        'OPTIONS': {'min_length': config('PASSWORD_MIN_LENGTH', default=10, cast=int)},
    },
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = config('DJANGO_TIME_ZONE', default='Africa/Dar_es_Salaam')
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 25,
    'EXCEPTION_HANDLER': 'apps.leave.exceptions.custom_exception_handler',
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    # Without this, DRF serializes every DecimalField as a JSON string
    # (e.g. "85000.00") while computed SerializerMethodFields returning a
    # Decimal serialize as a JSON number — an inconsistent wire contract
    # that silently breaks a frontend typed against `number` for money
    # fields (discovered via the Travel Payment Request feature, where
    # raw fields like fare_per_person came back as strings but the
    # computed `total`/`naule_total` fields came back as numbers). This
    # makes all DecimalFields serialize as numbers everywhere, matching
    # what the computed fields already did.
    'COERCE_DECIMAL_TO_STRING': False,
    # Rate limiting (brute-force / resource-abuse protection). 'anon'/'user'
    # are blanket defaults applied to every request; 'login', 'pdf_export'
    # and 'report_export' are tighter per-endpoint scopes applied via
    # ScopedRateThrottle on the specific views that need it (see
    # apps/accounts/views.py LoginView, apps/leave/views.py generate_pdf,
    # apps/leave/reports.py). All configurable via env so ops can tune
    # without a code change.
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': config('THROTTLE_RATE_ANON', default='60/min'),
        'user': config('THROTTLE_RATE_USER', default='300/min'),
        'login': config('THROTTLE_RATE_LOGIN', default='5/min'),
        'pdf_export': config('THROTTLE_RATE_PDF_EXPORT', default='10/min'),
        'report_export': config('THROTTLE_RATE_REPORT_EXPORT', default='20/min'),
        'document_upload': config('THROTTLE_RATE_DOCUMENT_UPLOAD', default='20/min'),
        # TOTP codes are 6 digits (1e6 combinations) — throttle tightly.
        'mfa_verify': config('THROTTLE_RATE_MFA_VERIFY', default='5/min'),
    },
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'NAOT Digital Leave Management System API',
    'DESCRIPTION': (
        'REST API for the National Audit Office of Tanzania Digital Leave '
        'Management System — employee leave applications, the HOD/HR/'
        'Authorizing Officer workflow, document generation, and reporting. '
        'Authenticate with a JWT bearer token obtained from POST '
        '/api/auth/login/ (see the "Authorize" button, scheme "Bearer").'
    ),
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
    'SCHEMA_PATH_PREFIX': '/api/',
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=config('JWT_ACCESS_TOKEN_LIFETIME_HOURS', default=8, cast=int)),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=config('JWT_REFRESH_TOKEN_LIFETIME_DAYS', default=7, cast=int)),
    'ROTATE_REFRESH_TOKENS': True,
    # Blacklist rotated-out refresh tokens (requires the token_blacklist app,
    # now installed above) so a stolen refresh token can't keep being used
    # after the legitimate client's next refresh cycle.
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# --- File uploads (supporting documents) ------------------------------
# Spec's FILE_SIZE_LIMIT env var (bytes). Enforced explicitly in
# apps/documents (extension + magic-byte + size checks) since Django's
# generic DATA_UPLOAD_MAX_MEMORY_SIZE alone doesn't validate content type.
FILE_SIZE_LIMIT = config('FILE_SIZE_LIMIT', default=5 * 1024 * 1024, cast=int)  # 5 MB default
DATA_UPLOAD_MAX_MEMORY_SIZE = FILE_SIZE_LIMIT + (1024 * 1024)
FILE_UPLOAD_MAX_MEMORY_SIZE = FILE_SIZE_LIMIT + (1024 * 1024)

# --- Security / production hardening headers ---------------------------
# Off by default in DEBUG (local HTTP dev server); on by default once
# DJANGO_DEBUG=False, still overridable via env for edge cases (e.g. a
# staging box without TLS yet).
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=not DEBUG, cast=bool)
SESSION_COOKIE_SECURE = config('SESSION_COOKIE_SECURE', default=not DEBUG, cast=bool)
CSRF_COOKIE_SECURE = config('CSRF_COOKIE_SECURE', default=not DEBUG, cast=bool)
SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=0 if DEBUG else 31536000, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
# Required when TLS is terminated at a reverse proxy (nginx) in front of
# Gunicorn, per DEPLOYMENT.md §5, so Django correctly recognizes forwarded
# HTTPS requests (otherwise SECURE_SSL_REDIRECT / secure cookies loop).
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# CORS - Next.js dev server
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:3000',
).split(',')
CORS_ALLOW_CREDENTIALS = True

# Where generated leave-application PDFs are written under MEDIA_ROOT.
LEAVE_PDF_MEDIA_SUBDIR = 'leave_documents'

# Static assets (emblem/logo placeholders) used by the PDF generator.
DOCUMENTS_ASSETS_DIR = BASE_DIR / 'apps' / 'documents' / 'assets'

# Fallback annual leave entitlement (days) used by the leave-policy engine
# (apps/leave/entitlement.py) when no matching LeavePolicy rule exists for
# an employee/leave_type. Configurable via env for deployments that want a
# different system-wide default.
LEAVE_DEFAULT_ENTITLEMENT_DAYS = config('LEAVE_DEFAULT_ENTITLEMENT_DAYS', default=28, cast=int)

# --- Cache (rate-limit / throttle counter storage) ----------------------
# DRF's throttle classes (AnonRateThrottle/UserRateThrottle/ScopedRateThrottle)
# store their counters in the 'default' cache alias by default. Django's
# built-in LocMemCache is per-process, in-memory — fine for a single dev
# process or the test suite, but WRONG for a multi-instance/load-balanced
# deployment: each app instance would keep its own independent counters, so
# a client could get up to N-times the intended rate limit by being routed
# across N instances. When REDIS_URL is set, use django-redis so all
# instances share one counter store and rate limiting is actually enforced
# across the fleet. When unset (local dev, CI, pytest), fall back to
# LocMemCache so nothing here requires a live Redis server to run tests.
REDIS_URL = config('REDIS_URL', default='')
if REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django_redis.cache.RedisCache',
            'LOCATION': REDIS_URL,
            'OPTIONS': {
                'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            },
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    }

# --- Malware scanning (ClamAV) on uploaded documents ---------------------
# Off by default (no ClamAV daemon assumed present in dev/CI/most sandboxes).
# When enabled, apps/documents/uploads.scan_for_malware() connects to a
# ClamAV daemon over TCP (clamd) and streams the uploaded file to it. See
# SECURITY.md for the honesty note on what has/hasn't been live-verified.
CLAMAV_ENABLED = config('CLAMAV_ENABLED', default=False, cast=bool)
CLAMAV_HOST = config('CLAMAV_HOST', default='localhost')
CLAMAV_PORT = config('CLAMAV_PORT', default=3310, cast=int)

# --- Email (spec section 47 / section 29 notification routing) ---------
# Real SMTP, configured via env. When EMAIL_HOST is unset/empty (local dev,
# CI, the test suite) we fall back to Django's console backend, which prints
# outgoing emails to stdout instead of requiring a live mail server — this
# keeps `pytest` and local dev working with zero configuration. Django's
# locmem backend is used automatically under pytest via django.core.mail's
# test override (django.test.utils.setup_test_environment), so this default
# only matters for `runserver`/manual use, not for the test suite itself.
EMAIL_HOST = config('EMAIL_HOST', default='')
if EMAIL_HOST:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_HOST_USER = config('EMAIL_USERNAME', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_PASSWORD', default='')
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='no-reply@naot.go.tz')

# --- Logging -------------------------------------------------------------
# Minimal stdout logging so email-send failures (see apps/notifications/emails.py)
# are visible without crashing the request/workflow transition that triggered
# them.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
}
