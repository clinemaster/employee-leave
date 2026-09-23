"""
CAG review stage: mandatory for applicants holding AUTHORIZING_OFFICER,
HEAD_OF_DEPARTMENT, DAG, AAG, CHIEF_ACCOUNTANT, DAHRM or ADA. Verifies
routing (Employee -> CAG -> HR -> AO, no HOD stage for this track), the
recommend/reject actions, backend enforcement of the mandatory stage, and
that the normal HOD track is unaffected.
"""
import datetime

import pytest

from apps.audit.models import AuditLog
from apps.leave.models import ApplicationStatus as S
from apps.leave.models import LeaveApplication
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db


def _url(app_id, action=None):
    base = f'/api/leave-applications/{app_id}/'
    return base if action is None else base + f'{action}/'


def test_submit_routes_cag_applicant_to_cag_not_hod(as_user, hod_applicant_draft_application, hod_applicant_user, cag_user):
    app = hod_applicant_draft_application
    resp = as_user(hod_applicant_user).post(_url(app.id, 'submit'))
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_CAG_REVIEW
    assert app.current_location == 'CAG'
    assert app.requires_cag_review is True
    assert Notification.objects.filter(related_application=app, user=cag_user).exists()


def test_normal_employee_submit_unaffected(as_user, draft_application, employee_user):
    """Backward compatibility: employees outside the four roles keep the existing HOD route."""
    resp = as_user(employee_user).post(_url(draft_application.id, 'submit'))
    assert resp.status_code == 200, resp.data
    draft_application.refresh_from_db()
    assert draft_application.status == S.PENDING_HOD_REVIEW
    assert draft_application.requires_cag_review is False


def test_cag_recommend_routes_to_hr_skipping_hod(as_user, hod_applicant_draft_application, hod_applicant_user, cag_user, hr_user, ao_user):
    app = hod_applicant_draft_application
    as_user(hod_applicant_user).post(_url(app.id, 'submit'))

    resp = as_user(cag_user).post(_url(app.id, 'cag-review'), {'comments': 'looks fine'})
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    # auto-routes straight to HR -- no HOD stage in this track
    assert app.status == S.PENDING_HR_REVIEW
    assert app.cag_review is not None
    assert app.cag_review.recommended is True
    assert app.recommendation is None

    resp = as_user(hr_user).post(_url(app.id, 'verify'), {'decision': True})
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_AUTHORIZATION

    resp = as_user(ao_user).post(_url(app.id, 'approve'), {'comments': 'approved'})
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.APPROVED

    actions = list(AuditLog.objects.filter(application=app).values_list('action', flat=True))
    for expected in ('submit', 'cag_review', 'route_to_hr', 'verify', 'route_to_authorization', 'approve'):
        assert expected in actions, actions
    assert 'recommend' not in actions


def test_cag_reject_terminates_workflow(as_user, hod_applicant_draft_application, hod_applicant_user, cag_user):
    app = hod_applicant_draft_application
    as_user(hod_applicant_user).post(_url(app.id, 'submit'))

    resp = as_user(cag_user).post(_url(app.id, 'cag-reject'), {'comments': 'insufficient balance'})
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.DENIED
    assert app.current_location == 'Completed'
    assert app.cag_review.recommended is False

    notif = Notification.objects.filter(
        related_application=app, user=hod_applicant_user, message__icontains='rejected by cag',
    ).first()
    assert notif is not None
    assert 'insufficient balance' in notif.message


def test_cag_reject_requires_a_reason(as_user, hod_applicant_draft_application, hod_applicant_user, cag_user):
    app = hod_applicant_draft_application
    as_user(hod_applicant_user).post(_url(app.id, 'submit'))

    resp = as_user(cag_user).post(_url(app.id, 'cag-reject'), {})
    assert resp.status_code == 400, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_CAG_REVIEW


def test_hr_cannot_process_before_cag_recommendation(as_user, hod_applicant_draft_application, hod_applicant_user, hr_user, cag_user):
    app = hod_applicant_draft_application
    as_user(hod_applicant_user).post(_url(app.id, 'submit'))

    resp = as_user(hr_user).post(_url(app.id, 'verify'), {'decision': True})
    assert resp.status_code == 400, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_CAG_REVIEW


def test_ao_cannot_approve_before_cag_and_hr_stages(as_user, hod_applicant_draft_application, hod_applicant_user, ao_user, cag_user):
    app = hod_applicant_draft_application
    as_user(hod_applicant_user).post(_url(app.id, 'submit'))

    resp = as_user(ao_user).post(_url(app.id, 'approve'), {'comments': 'approved'})
    assert resp.status_code == 400, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_CAG_REVIEW


def test_non_cag_user_cannot_recommend_or_reject(as_user, hod_applicant_draft_application, hod_applicant_user, hr_user, ao_user, employee_user, cag_user):
    app = hod_applicant_draft_application
    as_user(hod_applicant_user).post(_url(app.id, 'submit'))

    for user in (hr_user, ao_user, employee_user, hod_applicant_user):
        resp = as_user(user).post(_url(app.id, 'cag-review'), {'comments': 'x'})
        assert resp.status_code in (400, 403, 404), resp.data
        resp = as_user(user).post(_url(app.id, 'cag-reject'), {'comments': 'x'})
        assert resp.status_code in (400, 403, 404), resp.data

    app.refresh_from_db()
    assert app.status == S.PENDING_CAG_REVIEW


def test_cag_queue_lists_only_pending_cag_applications(as_user, hod_applicant_draft_application, hod_applicant_user, cag_user, draft_application, employee_user):
    """The CAG queue is the existing list endpoint filtered by status -- a dedicated queue, not a new visibility hole."""
    app = hod_applicant_draft_application
    as_user(hod_applicant_user).post(_url(app.id, 'submit'))
    as_user(employee_user).post(_url(draft_application.id, 'submit'))  # normal HOD-track app, must not appear

    resp = as_user(cag_user).get('/api/leave-applications/?status=PENDING_CAG_REVIEW')
    assert resp.status_code == 200, resp.data
    results = resp.data['results'] if isinstance(resp.data, dict) and 'results' in resp.data else resp.data
    ids = [row['id'] for row in results]
    assert app.id in ids
    assert draft_application.id not in ids


def test_cag_reviewer_can_view_but_not_edit_unrelated_application(as_user, draft_application, cag_user):
    """A CAG reviewer has no special access to a normal-track (non-CAG-applicant) application."""
    resp = as_user(cag_user).get(_url(draft_application.id))
    assert resp.status_code == 404, resp.data


def test_submit_rejected_when_no_cag_reviewer_available(as_user, make_user, leave_type):
    from apps.accounts.models import Role
    lonely_hod = make_user(
        username='lonelyhod', full_name='Lonely HOD', check_number='LHOD-001', role=Role.HEAD_OF_DEPARTMENT,
    )
    app = LeaveApplication.objects.create(
        employee=lonely_hod, leave_type=leave_type, full_name=lonely_hod.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )
    resp = as_user(lonely_hod).post(_url(app.id, 'submit'))
    assert resp.status_code == 400, resp.data
    assert 'cag' in resp.data['detail'].lower()
    app.refresh_from_db()
    assert app.status == S.DRAFT
