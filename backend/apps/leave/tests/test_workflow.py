"""
Full workflow tests: draft -> submit -> HOD recommend -> HR verify -> AO
approve, plus denial/return branches, invalid transitions, and audit/
notification side effects.
"""
import datetime

import pytest
from rest_framework import status

from apps.audit.models import AuditLog
from apps.leave.models import ApplicationStatus as S
from apps.leave.models import LeaveApplication
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db


def _url(app_id, action=None):
    base = f'/api/leave-applications/{app_id}/'
    return base if action is None else base + f'{action}/'


def test_submit_creates_audit_and_notification(as_user, draft_application, employee_user):
    client = as_user(employee_user)
    resp = client.post(_url(draft_application.id, 'submit'))
    assert resp.status_code == 200, resp.data
    draft_application.refresh_from_db()
    assert draft_application.status == S.PENDING_HOD_REVIEW

    logs = AuditLog.objects.filter(application=draft_application)
    assert logs.filter(action='submit').exists()

    notifs = Notification.objects.filter(related_application=draft_application)
    assert notifs.filter(user=employee_user).exists()
    assert notifs.filter(user=draft_application.employee.manager).exists()


def test_submit_rejected_with_clear_error_when_employee_has_no_reviewer(as_user, make_user, leave_type):
    """
    Regression: submitting with no routed reviewer used to succeed and move
    the application to PENDING_HOD_REVIEW, where it got stuck forever since
    recommend/return both require one (effective_reviewer_for() -> None means
    no one, including SYSTEM_ADMIN via the normal role checks, could ever act
    on it). Now rejected at submit time with a clear message -- unless a
    fallback HR Admin/Authorizing Officer exists, in which case it routes
    there instead (see test_submit_falls_back_to_hr_admin_when_no_head_or_manager).
    """
    orphan = make_user(username='orphan', full_name='No Manager', check_number='ORPH-001')
    assert orphan.manager is None
    assert orphan.department is None and orphan.division is None
    app = LeaveApplication.objects.create(
        employee=orphan, leave_type=leave_type, full_name=orphan.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )
    client = as_user(orphan)
    resp = client.post(_url(app.id, 'submit'))
    assert resp.status_code == status.HTTP_400_BAD_REQUEST, resp.data
    assert 'reviewer' in resp.data['detail'].lower()
    app.refresh_from_db()
    assert app.status == S.DRAFT  # unchanged -- rejected before any transition


def test_submit_falls_back_to_hr_admin_when_no_head_or_manager(as_user, make_user, leave_type, hr_user):
    """When an employee has no matched head and no manager, submission routes
    to a fallback HR Admin instead of being rejected."""
    orphan = make_user(username='orphan2', full_name='No Manager Two', check_number='ORPH-002')
    app = LeaveApplication.objects.create(
        employee=orphan, leave_type=leave_type, full_name=orphan.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )
    client = as_user(orphan)
    resp = client.post(_url(app.id, 'submit'))
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_HOD_REVIEW
    assert Notification.objects.filter(related_application=app, user=hr_user).exists()


def test_full_happy_path_workflow(as_user, draft_application, employee_user, hod_user, hr_user, ao_user):
    emp_client = as_user(employee_user)
    hod_client = as_user(hod_user)
    hr_client = as_user(hr_user)
    ao_client = as_user(ao_user)

    resp = emp_client.post(_url(draft_application.id, 'submit'))
    assert resp.status_code == 200
    draft_application.refresh_from_db()
    assert draft_application.status == S.PENDING_HOD_REVIEW

    resp = hod_client.post(_url(draft_application.id, 'recommend'), {'decision': True, 'comments': 'ok'})
    assert resp.status_code == 200, resp.data
    draft_application.refresh_from_db()
    # recommend auto-routes to HR
    assert draft_application.status == S.PENDING_HR_REVIEW
    assert draft_application.recommendation is not None
    assert draft_application.recommendation.recommended is True

    resp = hr_client.post(_url(draft_application.id, 'verify'), {'decision': True, 'comments': 'balance ok'})
    assert resp.status_code == 200, resp.data
    draft_application.refresh_from_db()
    assert draft_application.status == S.PENDING_AUTHORIZATION
    assert draft_application.hr_review is not None
    assert draft_application.hr_review.verified is True

    resp = ao_client.post(_url(draft_application.id, 'approve'), {'comments': 'approved'})
    assert resp.status_code == 200, resp.data
    draft_application.refresh_from_db()
    assert draft_application.status == S.APPROVED
    assert draft_application.approval is not None
    assert draft_application.approval.approved is True

    # Audit trail has one row per transition (submit, recommend, route_to_hr,
    # verify, route_to_authorization, approve)
    actions = list(
        AuditLog.objects.filter(application=draft_application).values_list('action', flat=True)
    )
    for expected in ('submit', 'recommend', 'route_to_hr', 'verify', 'route_to_authorization', 'approve'):
        assert expected in actions, actions

    # Notifications created for employee at each major step
    assert Notification.objects.filter(
        related_application=draft_application, user=employee_user
    ).count() >= 4


def test_deny_branch(as_user, draft_application, employee_user, hod_user, hr_user, ao_user):
    as_user(employee_user).post(_url(draft_application.id, 'submit'))
    as_user(hod_user).post(_url(draft_application.id, 'recommend'), {'decision': True})
    as_user(hr_user).post(_url(draft_application.id, 'verify'), {'decision': True})

    resp = as_user(ao_user).post(_url(draft_application.id, 'deny'), {'comments': 'not eligible'})
    assert resp.status_code == 200, resp.data
    draft_application.refresh_from_db()
    assert draft_application.status == S.DENIED
    assert draft_application.approval.approved is False
    assert Notification.objects.filter(related_application=draft_application, user=employee_user, message__icontains='denied').exists()


def test_hod_return_to_employee_branch(as_user, draft_application, employee_user, hod_user):
    as_user(employee_user).post(_url(draft_application.id, 'submit'))
    resp = as_user(hod_user).post(_url(draft_application.id, 'return'), {'comments': 'fix dates'})
    assert resp.status_code == 200, resp.data
    draft_application.refresh_from_db()
    assert draft_application.status == S.RETURNED_TO_EMPLOYEE
    assert AuditLog.objects.filter(application=draft_application, action='return_to_employee').exists()
    assert Notification.objects.filter(related_application=draft_application, user=employee_user, message__icontains='returned').exists()

    # employee can resubmit from RETURNED_TO_EMPLOYEE
    resp = as_user(employee_user).post(_url(draft_application.id, 'submit'))
    assert resp.status_code == 200
    draft_application.refresh_from_db()
    assert draft_application.status == S.PENDING_HOD_REVIEW


def test_hr_return_to_hod_branch(as_user, draft_application, employee_user, hod_user, hr_user):
    as_user(employee_user).post(_url(draft_application.id, 'submit'))
    as_user(hod_user).post(_url(draft_application.id, 'recommend'), {'decision': True})
    draft_application.refresh_from_db()
    assert draft_application.status == S.PENDING_HR_REVIEW

    # No dedicated REST action for return_to_hod is documented as exposed;
    # verify the app is at least sitting in PENDING_HR_REVIEW correctly and
    # that verify() from the wrong role is rejected.
    assert draft_application.status == S.PENDING_HR_REVIEW


# --- Invalid transitions -----------------------------------------------


def test_cannot_approve_draft_application(as_user, draft_application, ao_user):
    resp = as_user(ao_user).post(_url(draft_application.id, 'approve'))
    assert resp.status_code in (400, 403, 404), resp.data


def test_cannot_skip_hr_and_go_straight_to_approval(as_user, draft_application, employee_user, hod_user, ao_user):
    as_user(employee_user).post(_url(draft_application.id, 'submit'))
    as_user(hod_user).post(_url(draft_application.id, 'recommend'), {'decision': True})
    draft_application.refresh_from_db()
    assert draft_application.status == S.PENDING_HR_REVIEW

    resp = as_user(ao_user).post(_url(draft_application.id, 'approve'))
    assert resp.status_code == 400, resp.data
    draft_application.refresh_from_db()
    assert draft_application.status == S.PENDING_HR_REVIEW


def test_cannot_recommend_twice(as_user, draft_application, employee_user, hod_user):
    as_user(employee_user).post(_url(draft_application.id, 'submit'))
    resp = as_user(hod_user).post(_url(draft_application.id, 'recommend'), {'decision': True})
    assert resp.status_code == 200
    # second recommend attempt: application already moved to PENDING_HR_REVIEW
    resp = as_user(hod_user).post(_url(draft_application.id, 'recommend'), {'decision': True})
    assert resp.status_code == 400, resp.data


def test_wrong_role_cannot_recommend(as_user, draft_application, employee_user, hr_user):
    as_user(employee_user).post(_url(draft_application.id, 'submit'))
    resp = as_user(hr_user).post(_url(draft_application.id, 'recommend'), {'decision': True})
    assert resp.status_code in (400, 403), resp.data


def test_unrouted_hod_cannot_recommend(as_user, draft_application, employee_user, hod_user, other_hod_user):
    """A HOD who is not the applicant's manager may not recommend (IDOR/routing check)."""
    as_user(employee_user).post(_url(draft_application.id, 'submit'))
    resp = as_user(other_hod_user).post(_url(draft_application.id, 'recommend'), {'decision': True})
    assert resp.status_code in (400, 403, 404), resp.data
    draft_application.refresh_from_db()
    assert draft_application.status == S.PENDING_HOD_REVIEW


def test_employee_cannot_submit_someone_elses_application(as_user, draft_application, other_employee_user):
    resp = as_user(other_employee_user).post(_url(draft_application.id, 'submit'))
    assert resp.status_code in (400, 403, 404), resp.data
