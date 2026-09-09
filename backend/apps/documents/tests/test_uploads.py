"""
Supporting-document upload security: extension/magic-byte/size validation,
and the authenticated-only download endpoint (no direct file URL access).
"""
import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from apps.documents.uploads import UploadValidationError, validate_upload

pytestmark = pytest.mark.django_db

PNG_HEADER = b'\x89PNG\r\n\x1a\n' + b'\x00' * 16
PDF_HEADER = b'%PDF-1.4\n' + b'\x00' * 16
FAKE_EXE_AS_JPG = b'MZ\x90\x00' + b'\x00' * 16  # PE header, renamed .jpg


def test_validate_upload_accepts_real_png():
    f = SimpleUploadedFile('photo.png', PNG_HEADER, content_type='image/png')
    validate_upload(f)  # should not raise


def test_validate_upload_rejects_disallowed_extension():
    f = SimpleUploadedFile('script.exe', PDF_HEADER, content_type='application/octet-stream')
    with pytest.raises(UploadValidationError):
        validate_upload(f)


def test_validate_upload_rejects_content_extension_mismatch():
    """A file renamed to .jpg but whose bytes aren't a JPEG must be rejected
    (magic-byte check catches what an extension allowlist alone would miss)."""
    f = SimpleUploadedFile('totally_a_photo.jpg', FAKE_EXE_AS_JPG, content_type='image/jpeg')
    with pytest.raises(UploadValidationError):
        validate_upload(f)


def test_validate_upload_rejects_oversized_file(settings):
    settings.FILE_SIZE_LIMIT = 10  # bytes
    f = SimpleUploadedFile('photo.png', PNG_HEADER, content_type='image/png')
    with pytest.raises(UploadValidationError):
        validate_upload(f)


def test_upload_endpoint_rejects_wrong_type(as_user, employee_user, draft_application):
    client = as_user(employee_user)
    bad_file = SimpleUploadedFile('evil.exe', FAKE_EXE_AS_JPG, content_type='application/octet-stream')
    resp = client.post(
        f'/api/leave-applications/{draft_application.id}/upload-document/',
        {'file': bad_file}, format='multipart',
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


def test_upload_endpoint_rejects_oversized_file(as_user, employee_user, draft_application, settings):
    settings.FILE_SIZE_LIMIT = 10
    f = SimpleUploadedFile('photo.png', PNG_HEADER, content_type='image/png')
    client = as_user(employee_user)
    resp = client.post(
        f'/api/leave-applications/{draft_application.id}/upload-document/',
        {'file': f}, format='multipart',
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


def test_upload_endpoint_accepts_valid_file(as_user, employee_user, draft_application):
    f = SimpleUploadedFile('photo.png', PNG_HEADER, content_type='image/png')
    client = as_user(employee_user)
    resp = client.post(
        f'/api/leave-applications/{draft_application.id}/upload-document/',
        {'file': f}, format='multipart',
    )
    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.data['document_type'] == 'SUPPORTING_ATTACHMENT'


def test_upload_endpoint_rejects_other_employees_application(as_user, other_employee_user, draft_application):
    """IDOR guard on upload: an unrelated employee can't attach a file to
    someone else's application. The row is outside their visible queryset
    entirely (visible_queryset_for), so get_object() 404s before the
    ownership check ever runs — same behavior as every other
    LeaveApplicationViewSet action, not a special case for uploads."""
    client = as_user(other_employee_user)
    f = SimpleUploadedFile('photo.png', PNG_HEADER, content_type='image/png')
    resp = client.post(
        f'/api/leave-applications/{draft_application.id}/upload-document/',
        {'file': f}, format='multipart',
    )
    assert resp.status_code == status.HTTP_404_NOT_FOUND


def test_download_requires_authentication(api_client, employee_user, draft_application):
    f = SimpleUploadedFile('photo.png', PNG_HEADER, content_type='image/png')
    from apps.documents.models import LeaveDocument
    doc = LeaveDocument.objects.create(
        application=draft_application, document_type=LeaveDocument.DocumentType.SUPPORTING_ATTACHMENT,
    )
    doc.file.save('photo.png', io.BytesIO(PNG_HEADER), save=True)

    resp = api_client.get(f'/api/leave-applications/{draft_application.id}/documents/{doc.id}/download/')
    assert resp.status_code == status.HTTP_401_UNAUTHORIZED


def test_download_rejects_unrelated_user(as_user, other_employee_user, draft_application):
    from apps.documents.models import LeaveDocument
    doc = LeaveDocument.objects.create(
        application=draft_application, document_type=LeaveDocument.DocumentType.SUPPORTING_ATTACHMENT,
    )
    doc.file.save('photo.png', io.BytesIO(PNG_HEADER), save=True)

    client = as_user(other_employee_user)
    resp = client.get(f'/api/leave-applications/{draft_application.id}/documents/{doc.id}/download/')
    assert resp.status_code == status.HTTP_404_NOT_FOUND


def test_download_succeeds_for_owner(as_user, employee_user, draft_application):
    from apps.documents.models import LeaveDocument
    doc = LeaveDocument.objects.create(
        application=draft_application, document_type=LeaveDocument.DocumentType.SUPPORTING_ATTACHMENT,
    )
    doc.file.save('photo.png', io.BytesIO(PNG_HEADER), save=True)

    client = as_user(employee_user)
    resp = client.get(f'/api/leave-applications/{draft_application.id}/documents/{doc.id}/download/')
    assert resp.status_code == status.HTTP_200_OK
