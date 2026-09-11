"""
PDF generation: produces a 2-page PDF, contains expected section-marker
text, doesn't crash when optional fields are missing.
"""
import datetime
import io

import pytest
from pypdf import PdfReader
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer

from apps.documents.pdf import _cell, cell_style, generate_leave_application_pdf
from apps.leave.models import ApplicationStatus as S
from apps.leave.models import LeaveApplication, LeaveDependant
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


# --- Cell text wrapping (Section A/B1/B2/C table cells previously overflowed
# past their fixed column width for long HOD/HR/AO comments and multi-
# dependant lists, since plain strings in a reportlab Table are never
# wrapped -- only Paragraph flowables are) --------------------------------

def test_cell_wraps_plain_strings_in_a_paragraph():
    result = _cell('some comment text')
    assert isinstance(result, Paragraph)


def test_cell_passes_flowables_through_unchanged():
    flowable = Spacer(1, 1)
    assert _cell(flowable) is flowable


def test_cell_escapes_special_characters_without_crashing():
    # Free-text user input (comments, names) may contain literal &, <, >,
    # which Paragraph would otherwise misinterpret as markup.
    result = _cell('Approved & confirmed <urgent> per HR > HOD chain')
    assert isinstance(result, Paragraph)  # doesn't raise


def test_cell_none_renders_as_empty_paragraph():
    result = _cell(None)
    assert isinstance(result, Paragraph)


def test_long_comment_wraps_to_multiple_lines_within_the_actual_column_width():
    """
    The actual regression: a long comment must wrap (grow taller) within
    the fixed ~4.2cm comment column rather than rendering as one long line
    that would overflow into the neighboring cell. A Paragraph.wrap() call
    at that width returning a height taller than one line proves wrapping
    happened; the returned width must never exceed what was asked for.
    """
    long_comment = (
        'I strongly recommend approval of this leave application because the '
        'employee has accumulated sufficient leave days, has arranged proper '
        'handover of duties, and the timing does not conflict with any '
        'critical audit engagements scheduled for this period.'
    )
    column_width = 4.2 * cm
    paragraph = _cell(long_comment)
    width, height = paragraph.wrap(column_width, 1000)

    single_line_height = cell_style.fontSize + cell_style.leading - cell_style.fontSize  # ~leading
    assert width <= column_width
    assert height > cell_style.leading * 3  # definitely wrapped across several lines


def test_pdf_with_long_comments_and_many_dependants_generates_without_crashing_and_preserves_content(
    employee_user, hod_user, hr_user, ao_user, leave_type
):
    """
    Full-stack regression check for the reported bug: long HOD/HR/AO
    comments and a multi-dependant list used to overflow their table cells.
    This doesn't assert exact PDF geometry (pypdf can't easily verify visual
    layout), but confirms generation succeeds and every dependant's full
    name is present verbatim in the extracted text -- if cell content were
    being truncated or clipped instead of wrapped, some names would be cut
    off or missing.
    """
    app = LeaveApplication.objects.create(
        employee=employee_user,
        leave_type=leave_type,
        start_date=datetime.date(2026, 3, 2),
        last_date=datetime.date(2026, 3, 6),
        contact_address=(
            'P.O. Box 12345, Dodoma, United Republic of Tanzania, near the '
            'central market and the regional administrative offices'
        ),
    )
    dependant_names = [f'Dependant Full Name Number {i} Extra Long' for i in range(1, 7)]
    for name in dependant_names:
        LeaveDependant.objects.create(application=app, name=name, relationship='Child')

    app = _approve_application(app, employee_user, hod_user, hr_user, ao_user)

    # perform_transition() only writes AuditLog/status -- it doesn't create
    # the Section B1/B2/C review objects (that's done by the DRF view layer
    # in a real request). Create them directly so the PDF has comment text
    # to render.
    from apps.leave.models import LeaveApproval, LeaveHRReview, LeaveRecommendation

    app.recommendation = LeaveRecommendation.objects.create(
        reviewer=hod_user, recommended=True,
        comments=(
            'I strongly recommend approval of this leave application because the '
            'employee has accumulated sufficient leave days, has no pending '
            'disciplinary matters, has arranged proper handover of duties to a '
            'colleague, and the timing does not conflict with any critical audit '
            'engagements scheduled for this period.'
        ),
    )
    app.hr_review = LeaveHRReview.objects.create(
        reviewer=hr_user, verified=True, leave_balance_confirmed=True,
        comments=(
            'Leave balance confirmed against HR records; employee has 18 days '
            'remaining for the current leave period and no outstanding leave '
            'from the previous period requiring reconciliation.'
        ),
    )
    app.approval = LeaveApproval.objects.create(
        reviewer=ao_user, approved=True,
        comments=(
            'Approved as recommended by the Head of Department and verified by '
            'Human Resources; please ensure the employee completes the standard '
            'handover checklist before departure.'
        ),
    )
    app.save()

    document = generate_leave_application_pdf(app, ao_user)
    document.file.open('rb')
    try:
        pdf_bytes = document.file.read()
    finally:
        document.file.close()

    reader = PdfReader(io.BytesIO(pdf_bytes))
    text = '\n'.join((page.extract_text() or '').replace('\n', ' ') for page in reader.pages)
    for name in dependant_names:
        assert name in text
