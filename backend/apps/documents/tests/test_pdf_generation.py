"""
PDF generation: produces a 2-page PDF, contains expected section-marker
text, doesn't crash when optional fields are missing.
"""
import datetime
import io

import pytest
from pypdf import PdfReader

from apps.documents.pdf import generate_leave_application_pdf
from apps.leave.models import ApplicationStatus as S
from apps.leave.models import LeaveApplication
from apps.leave.workflow import WorkflowError, perform_transition

pytestmark = pytest.mark.django_db


def _approve_application(app, employee_user, hod_user, hr_user, ao_user):
    perform_transition(app, employee_user, 'submit')
    perform_transition(app, hod_user, 'recommend')
    perform_transition(app, hr_user, 'verify')
    perform_transition(app, ao_user, 'approve')
    app.refresh_from_db()
    return app


def test_pdf_has_two_pages_and_section_markers(draft_application, employee_user, hod_user, hr_user, ao_user):
    app = _approve_application(draft_application, employee_user, hod_user, hr_user, ao_user)
    document = generate_leave_application_pdf(app, ao_user)

    app.refresh_from_db()
    assert app.status == S.PDF_GENERATED

    document.file.open('rb')
    try:
        pdf_bytes = document.file.read()
    finally:
        document.file.close()

    reader = PdfReader(io.BytesIO(pdf_bytes))
    assert len(reader.pages) == 2

    text = '\n'.join(page.extract_text() or '' for page in reader.pages)
    assert 'SECTION A' in text
    assert 'SECTION B1' in text
    assert 'SECTION B2' in text
    assert 'SECTION C' in text
    assert app.application_number in text


def test_pdf_generation_rejected_when_not_approved(draft_application, ao_user):
    with pytest.raises(WorkflowError):
        generate_leave_application_pdf(draft_application, ao_user)


def test_pdf_generation_does_not_crash_with_missing_optional_fields(
    employee_user, hod_user, hr_user, ao_user, leave_type
):
    # Minimal application: most Section A optional text fields left blank,
    # no dependants, no travel assistance.
    app = LeaveApplication.objects.create(
        employee=employee_user,
        leave_type=leave_type,
        start_date=datetime.date(2026, 3, 2),
        last_date=datetime.date(2026, 3, 4),
    )
    app = _approve_application(app, employee_user, hod_user, hr_user, ao_user)
    document = generate_leave_application_pdf(app, ao_user)
    document.file.open('rb')
    try:
        pdf_bytes = document.file.read()
    finally:
        document.file.close()
    reader = PdfReader(io.BytesIO(pdf_bytes))
    assert len(reader.pages) == 2


def test_generate_pdf_endpoint(as_user, draft_application, employee_user, hod_user, hr_user, ao_user):
    app = _approve_application(draft_application, employee_user, hod_user, hr_user, ao_user)
    resp = as_user(ao_user).post(f'/api/leave-applications/{app.id}/generate-pdf/')
    assert resp.status_code == 201, resp.data
    app.refresh_from_db()
    assert app.status == S.PDF_GENERATED


def test_generate_pdf_endpoint_rejects_unapproved(as_user, draft_application, employee_user):
    resp = as_user(employee_user).post(f'/api/leave-applications/{draft_application.id}/generate-pdf/')
    assert resp.status_code == 400
