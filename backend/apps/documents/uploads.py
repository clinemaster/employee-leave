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

Malware scanning (scan_for_malware, below) is a separate, additional layer
on top of the three checks above — see its docstring.
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

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


def scan_for_malware(uploaded_file):
    """
    Virus/malware scan via a ClamAV daemon (clamd), gated by
    settings.CLAMAV_ENABLED (env: CLAMAV_ENABLED, default False).

    Behavior:
      - CLAMAV_ENABLED is False (default — most dev/CI/sandbox environments
        have no ClamAV daemon running): scanning is skipped entirely, a
        message is logged, and the function returns normally. The upload
        flow must never crash or reject a file because a scanner that was
        never turned on isn't reachable.
      - CLAMAV_ENABLED is True: connects to the daemon at
        settings.CLAMAV_HOST/CLAMAV_PORT and streams the file to
        instream(). If the daemon reports the stream as infected ("FOUND"),
        raises UploadValidationError and the file is rejected.
      - CLAMAV_ENABLED is True but the daemon is unreachable (connection
        error, timeout, etc.): this is a real production misconfiguration —
        fails CLOSED (raises UploadValidationError) rather than silently
        letting an unscanned file through. This only applies when scanning
        was explicitly turned on; it never triggers when disabled.

    Leaves the file pointer at position 0 on return (caller can still save
    the file). Not live-verified against a real ClamAV daemon in this
    environment (none available) — see SECURITY.md.
    """
    if not getattr(settings, 'CLAMAV_ENABLED', False):
        logger.info('ClamAV scanning is disabled (CLAMAV_ENABLED=False); skipping malware scan.')
        return

    import clamd

    host = getattr(settings, 'CLAMAV_HOST', 'localhost')
    port = getattr(settings, 'CLAMAV_PORT', 3310)

    uploaded_file.seek(0)
    try:
        client = clamd.ClamdNetworkSocket(host=host, port=port)
        result = client.instream(uploaded_file)
    except Exception as exc:
        logger.error('ClamAV scan failed (daemon at %s:%s unreachable or errored): %s', host, port, exc)
        raise UploadValidationError(
            'Malware scanning is enabled but the scanner is currently unavailable. '
            'Upload rejected for safety; please try again later or contact support.'
        ) from exc
    finally:
        uploaded_file.seek(0)

    # clamd's instream() returns {'stream': (status, reason)} where status
    # is 'OK', 'FOUND' (infected), or 'ERROR'.
    status_tuple = result.get('stream') if isinstance(result, dict) else None
    if status_tuple and status_tuple[0] == 'FOUND':
        logger.warning('ClamAV detected malware in uploaded file: %s', status_tuple[1])
        raise UploadValidationError(
            f'File rejected: malware scan detected a threat ({status_tuple[1]}).'
        )
    if status_tuple and status_tuple[0] == 'ERROR':
        logger.error('ClamAV scan returned an error status: %s', status_tuple[1])
        raise UploadValidationError(
            'Malware scanning failed to complete. Upload rejected for safety.'
        )
