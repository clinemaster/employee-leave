"""
TOTP-based MFA helpers (apps.accounts).

Uses `pyotp` for RFC 6238 TOTP generation/verification (compatible with any
standard authenticator app — Google Authenticator, Authy, 1Password, etc.)
and `cryptography`'s Fernet for at-rest encryption of the per-user TOTP
secret, so `User.mfa_secret` is never stored as plaintext in the database
(SECURITY.md: "no MFA" gap). The encryption key is derived from
`settings.SECRET_KEY` via SHA-256 so no extra secret needs to be provisioned
for local/dev use; production deployments that rotate `SECRET_KEY` should be
aware that rotation invalidates existing encrypted MFA secrets (out of scope
for this pass — see SECURITY.md).

The secret is also never included in any DRF serializer output — encrypted
or not, it's write-only from the API's perspective (see serializers.py).
"""
import base64
import hashlib
import time

import pyotp
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

ISSUER_NAME = 'NAOT Leave Management'


def _fernet() -> Fernet:
    # Derive a 32-byte, url-safe-base64 key from SECRET_KEY (never store the
    # raw Django SECRET_KEY itself as a Fernet key — SHA-256 it first).
    digest = hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def generate_secret() -> str:
    """Generate a new random base32 TOTP secret (plaintext, caller must encrypt before storing)."""
    return pyotp.random_base32()


def encrypt_secret(plain_secret: str) -> str:
    return _fernet().encrypt(plain_secret.encode('utf-8')).decode('utf-8')


def decrypt_secret(encrypted_secret: str) -> str | None:
    if not encrypted_secret:
        return None
    try:
        return _fernet().decrypt(encrypted_secret.encode('utf-8')).decode('utf-8')
    except InvalidToken:
        return None


def provisioning_uri(plain_secret: str, username: str) -> str:
    """otpauth:// URI for QR-code display in an authenticator app."""
    return pyotp.totp.TOTP(plain_secret).provisioning_uri(name=username, issuer_name=ISSUER_NAME)


def verify_code(plain_secret: str, code: str) -> bool:
    if not plain_secret or not code:
        return False
    totp = pyotp.totp.TOTP(plain_secret)
    # valid_window=1 tolerates minor clock drift (accepts the previous/next
    # 30s step in addition to the current one), matching common TOTP UX.
    return totp.verify(code, valid_window=1)


def verify_code_no_replay(plain_secret: str, code: str, last_step):
    """Verify `code` and return the matched TOTP step number, or None if
    invalid OR if that step has already been consumed (replay protection —
    a captured/observed code can't be reused, even though it stays
    numerically valid for the rest of its 30s window plus drift tolerance).

    `last_step` should be `User.mfa_last_verified_step` (nullable int); the
    caller is responsible for persisting the returned step back onto the
    user after a successful verification.
    """
    if not plain_secret or not code:
        return None
    totp = pyotp.totp.TOTP(plain_secret)
    interval = totp.interval
    now = int(time.time())
    current_step = now // interval
    for offset in (-1, 0, 1):
        step = current_step + offset
        if totp.at(step * interval) == code:
            if last_step is not None and step <= last_step:
                return None
            return step
    return None
