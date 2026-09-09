"""
Tests for GET /api/reports/leave-applications/ — RBAC restriction and the
PDF export (CSV/XLSX were already covered manually; PDF is new).
"""
import io

import pytest
from pypdf import PdfReader

pytestmark = pytest.mark.django_db

REPORT_URL = '/api/reports/leave-applications/'


def test_employee_cannot_access_report(as_user, employee_user):
    resp = as_user(employee_user).get(REPORT_URL)
    assert resp.status_code == 403, resp.data


def test_hod_cannot_access_report(as_user, hod_user):
    resp = as_user(hod_user).get(REPORT_URL)
    assert resp.status_code == 403, resp.data


@pytest.mark.parametrize('role_fixture', ['hr_user', 'ao_user', 'sysadmin_user'])
def test_reporting_roles_can_access_pdf(request, as_user, role_fixture, draft_application):
    user = request.getfixturevalue(role_fixture)
    resp = as_user(user).get(REPORT_URL, {'format': 'pdf'})
    assert resp.status_code == 200, resp.data
    assert resp['Content-Type'] == 'application/pdf'


def test_pdf_export_with_results_is_valid_pdf(as_user, hr_user, draft_application):
    resp = as_user(hr_user).get(REPORT_URL, {'format': 'pdf'})
    assert resp.status_code == 200
    content = b''.join(resp.streaming_content) if resp.streaming else resp.content
    reader = PdfReader(io.BytesIO(content))
    assert len(reader.pages) >= 1


def test_pdf_export_with_zero_results_is_valid_pdf(as_user, hr_user):
    """No applications match an impossible filter -> still a valid, non-crashing PDF."""
    resp = as_user(hr_user).get(REPORT_URL, {'format': 'pdf', 'status': 'ARCHIVED'})
    assert resp.status_code == 200
    content = b''.join(resp.streaming_content) if resp.streaming else resp.content
    reader = PdfReader(io.BytesIO(content))
    assert len(reader.pages) >= 1
    text = ''.join(page.extract_text() or '' for page in reader.pages)
    assert 'No matching applications' in text


def test_pdf_export_respects_filters(as_user, hr_user, draft_application):
    resp = as_user(hr_user).get(REPORT_URL, {'format': 'pdf', 'leave_type': draft_application.leave_type_id})
    assert resp.status_code == 200
    content = resp.content
    reader = PdfReader(io.BytesIO(content))
    text = ''.join(page.extract_text() or '' for page in reader.pages)
    assert draft_application.application_number in text


def test_invalid_format_rejected(as_user, hr_user):
    resp = as_user(hr_user).get(REPORT_URL, {'format': 'doc'})
    assert resp.status_code == 400
