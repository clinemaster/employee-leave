"""
Server-side validation for user-supplied file uploads (leave-application
supporting documents).

Defense in depth beyond just trusting the client-supplied filename/
Content-Type:
  1. Extension allowlist (PDF/JPG/JPEG/PNG only).
  2. Magic-byte (file signature) check — the first few bytes of the file
     must match the claimed type, so a renamed .exe or .html can't slip
     through as a "photo.jpg".
  3. Size cap, read from settings.FILE_SIZE_LIMIT (env: FILE_SIZE_LIMIT,
     bytes; default 5 MB).

This is NOT a substitute for antivirus/malware scanning (e.g. ClamAV) — see
SECURITY.md. It only confirms the file is structurally what it claims to be
and within the configured size limit.
"""
from django.conf import settings

ALLOWED_EXTENSIONS = {'.pdf', '.jpg', '.jpeg', '.png'}

# (signature bytes, offset) — checked against the start of the file.
_MAGIC_SIGNATURES = {
    '.pdf': [b'%PDF-'],
    '.jpg': [b'\xff\xd8\xff'],
    '.jpeg': [b'\xff\xd8\xff'],
    '.png': [b'\x89PNG\r\n\x1a\n'],
}


class UploadValidationError(Exception):
    pass


def _extension_of(filename):
    filename = filename or ''
    idx = filename.rfind('.')
    return filename[idx:].lower() if idx != -1 else ''


def validate_upload(uploaded_file):
    """
    Raises UploadValidationError with a user-facing message if `uploaded_file`
    (a Django UploadedFile) fails extension, magic-byte, or size checks.
    Leaves the file pointer at position 0 on return (caller can still save it).
    """
    max_size = getattr(settings, 'FILE_SIZE_LIMIT', 5 * 1024 * 1024)
    if uploaded_file.size is not None and uploaded_file.size > max_size:
        raise UploadValidationError(
            f'File too large ({uploaded_file.size} bytes). Maximum allowed is {max_size} bytes.'
        )

    ext = _extension_of(uploaded_file.name)
    if ext not in ALLOWED_EXTENSIONS:
        raise UploadValidationError(
            f'Unsupported file type "{ext or "(none)"}". Allowed: {", ".join(sorted(ALLOWED_EXTENSIONS))}.'
        )

    uploaded_file.seek(0)
    header = uploaded_file.read(16)
    uploaded_file.seek(0)

    signatures = _MAGIC_SIGNATURES.get(ext, [])
    if not any(header.startswith(sig) for sig in signatures):
        raise UploadValidationError(
            'File content does not match its extension (failed file-signature check).'
        )
