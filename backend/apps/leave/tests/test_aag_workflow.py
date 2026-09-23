"""
AAG review stage: mandatory for employees who belong to a Division and whose
role doesn't itself require CAG review (CAG takes priority), and for
CHIEF_EXTERNAL_AUDITOR (matched by work station instead of division, since
that role has none). Verifies routing (Employee -> AAG -> HR -> AO, no HOD
stage for this track), the recommend/reject actions, matching the AAG
assigned to the employee's specific division/work station, backend
enforcement of the mandatory stage, and that the normal HOD/CAG tracks are
unaffected.
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


def test_submit_routes_division_employee_to_aag_not_hod(
    as_user, division_employee_draft_application, division_employee_user, aag_user,
):
    app = division_employee_draft_application
    resp = as_user(division_employee_user).post(_url(app.id, 'submit'))
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_AAG_REVIEW
    assert app.current_location == 'AAG'
    assert app.requires_aag_review is True
    assert Notification.objects.filter(related_application=app, user=aag_user).exists()


def test_normal_employee_submit_unaffected(as_user, draft_application, employee_user):
    """Backward compatibility: department employees keep the existing HOD route."""
    resp = as_user(employee_user).post(_url(draft_application.id, 'submit'))
    assert resp.status_code == 200, resp.data
    draft_application.refresh_from_db()
    assert draft_application.status == S.PENDING_HOD_REVIEW
    assert draft_application.requires_aag_review is False


def test_cag_applicant_who_also_belongs_to_division_still_routes_to_cag(
    as_user, make_user, division, cag_user, leave_type,
):
    """CAG takes priority over AAG (needs_aag_review excludes needs_cag_review applicants)."""
    applicant = make_user(
        username='hodindiv', full_name='HOD In Division', check_number='HODDIV-001',
        role='HEAD_OF_DEPARTMENT', division=division,
    )
    app = LeaveApplication.objects.create(
        employee=applicant, leave_type=leave_type, full_name=applicant.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )
    resp = as_user(applicant).post(_url(app.id, 'submit'))
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_CAG_REVIEW
    assert app.requires_cag_review is True
    assert app.requires_aag_review is False


def test_aag_recommend_routes_to_hr_skipping_hod(
    as_user, division_employee_draft_application, division_employee_user, aag_user, hr_user, ao_user,
):
    app = division_employee_draft_application
    as_user(division_employee_user).post(_url(app.id, 'submit'))

    resp = as_user(aag_user).post(_url(app.id, 'aag-review'), {'comments': 'looks fine'})
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    # auto-routes straight to HR -- no HOD stage in this track
    assert app.status == S.PENDING_HR_REVIEW
    assert app.aag_review is not None
    assert app.aag_review.recommended is True
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
    for expected in ('submit', 'aag_review', 'route_to_hr', 'verify', 'route_to_authorization', 'approve'):
        assert expected in actions, actions
    assert 'recommend' not in actions


def test_aag_reject_terminates_workflow(
    as_user, division_employee_draft_application, division_employee_user, aag_user,
):
    app = division_employee_draft_application
    as_user(division_employee_user).post(_url(app.id, 'submit'))

    resp = as_user(aag_user).post(_url(app.id, 'aag-reject'), {'comments': 'insufficient balance'})
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.DENIED
    assert app.current_location == 'Completed'
    assert app.aag_review.recommended is False

    notif = Notification.objects.filter(
        related_application=app, user=division_employee_user, message__icontains='rejected by aag',
    ).first()
    assert notif is not None
    assert 'insufficient balance' in notif.message


def test_aag_reject_requires_a_reason(
    as_user, division_employee_draft_application, division_employee_user, aag_user,
):
    app = division_employee_draft_application
    as_user(division_employee_user).post(_url(app.id, 'submit'))

    resp = as_user(aag_user).post(_url(app.id, 'aag-reject'), {})
    assert resp.status_code == 400, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_AAG_REVIEW


def test_hr_cannot_process_before_aag_recommendation(
    as_user, division_employee_draft_application, division_employee_user, hr_user, aag_user,
):
    app = division_employee_draft_application
    as_user(division_employee_user).post(_url(app.id, 'submit'))

    resp = as_user(hr_user).post(_url(app.id, 'verify'), {'decision': True})
    assert resp.status_code == 400, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_AAG_REVIEW


def test_other_division_aag_cannot_recommend_or_reject(
    as_user, division_employee_draft_application, division_employee_user, other_aag_user, aag_user,
):
    """An AAG matched to a different division has no access to this application."""
    app = division_employee_draft_application
    as_user(division_employee_user).post(_url(app.id, 'submit'))

    resp = as_user(other_aag_user).post(_url(app.id, 'aag-review'), {'comments': 'x'})
    assert resp.status_code in (400, 403, 404), resp.data
    resp = as_user(other_aag_user).post(_url(app.id, 'aag-reject'), {'comments': 'x'})
    assert resp.status_code in (400, 403, 404), resp.data

    app.refresh_from_db()
    assert app.status == S.PENDING_AAG_REVIEW


def test_aag_queue_lists_only_matched_division_applications(
    as_user, division_employee_draft_application, division_employee_user, aag_user, other_aag_user,
    make_user, leave_type,
):
    """The AAG queue is scoped to the AAG's own matched division."""
    app = division_employee_draft_application
    as_user(division_employee_user).post(_url(app.id, 'submit'))

    resp = as_user(aag_user).get('/api/leave-applications/?status=PENDING_AAG_REVIEW')
    assert resp.status_code == 200, resp.data
    results = resp.data['results'] if isinstance(resp.data, dict) and 'results' in resp.data else resp.data
    ids = [row['id'] for row in results]
    assert app.id in ids

    resp = as_user(other_aag_user).get('/api/leave-applications/?status=PENDING_AAG_REVIEW')
    assert resp.status_code == 200, resp.data
    results = resp.data['results'] if isinstance(resp.data, dict) and 'results' in resp.data else resp.data
    ids = [row['id'] for row in results]
    assert app.id not in ids


def test_submit_rejected_when_no_aag_reviewer_available(as_user, make_user, division, leave_type):
    lonely_employee = make_user(
        username='lonelydiv', full_name='Lonely Division Employee', check_number='LDIV-001',
        role='EMPLOYEE', division=division,
    )
    app = LeaveApplication.objects.create(
        employee=lonely_employee, leave_type=leave_type, full_name=lonely_employee.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )
    resp = as_user(lonely_employee).post(_url(app.id, 'submit'))
    assert resp.status_code == 400, resp.data
    assert 'aag' in resp.data['detail'].lower()
    app.refresh_from_db()
    assert app.status == S.DRAFT


# --- CHIEF_EXTERNAL_AUDITOR: routed to AAG matched by work station -----

def test_submit_routes_cea_to_aag_matched_by_work_station(
    as_user, cea_draft_application, cea_user, aag_user_at_station,
):
    app = cea_draft_application
    resp = as_user(cea_user).post(_url(app.id, 'submit'))
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_AAG_REVIEW
    assert app.current_location == 'AAG'
    assert app.requires_aag_review is True
    assert app.requires_cag_review is False
    assert Notification.objects.filter(related_application=app, user=aag_user_at_station).exists()


def test_aag_at_different_station_cannot_review_cea(
    as_user, cea_draft_application, cea_user, aag_user_at_station, aag_user,
):
    """aag_user (matched by division, not this work station) has no access to the CEA's application."""
    app = cea_draft_application
    as_user(cea_user).post(_url(app.id, 'submit'))

    resp = as_user(aag_user).post(_url(app.id, 'aag-review'), {'comments': 'x'})
    assert resp.status_code in (400, 403, 404), resp.data

    app.refresh_from_db()
    assert app.status == S.PENDING_AAG_REVIEW


def test_cea_aag_recommend_routes_to_hr_skipping_hod(
    as_user, cea_draft_application, cea_user, aag_user_at_station, hr_user, ao_user,
):
    app = cea_draft_application
    as_user(cea_user).post(_url(app.id, 'submit'))

    resp = as_user(aag_user_at_station).post(_url(app.id, 'aag-review'), {'comments': 'looks fine'})
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_HR_REVIEW
    assert app.aag_review is not None
    assert app.aag_review.recommended is True

    resp = as_user(hr_user).post(_url(app.id, 'verify'), {'decision': True})
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_AUTHORIZATION

    resp = as_user(ao_user).post(_url(app.id, 'approve'), {'comments': 'approved'})
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.APPROVED

    actions = list(AuditLog.objects.filter(application=app).values_list('action', flat=True))
    for expected in ('submit', 'aag_review', 'route_to_hr', 'verify', 'route_to_authorization', 'approve'):
        assert expected in actions, actions


def test_submit_rejected_when_no_aag_at_ceas_work_station(as_user, cea_draft_application, cea_user):
    """No AAG at the CEA's work station (aag_user_at_station fixture not used) -- rejected at submit."""
    app = cea_draft_application
    resp = as_user(cea_user).post(_url(app.id, 'submit'))
    assert resp.status_code == 400, resp.data
    assert 'aag' in resp.data['detail'].lower()
    assert 'work station' in resp.data['detail'].lower()
    app.refresh_from_db()
    assert app.status == S.DRAFT


# --- CHIEF_EXTERNAL_AUDITOR: falls back to the Division's existing AAG ---
# when no AAG is directly assigned to the CEA's own work station (see
# matched_aag_for) -- reuses the existing AAG-to-Division mapping via
# WorkStation.division rather than a separate CEA-to-AAG link. The
# work-station-direct match (tested above) always takes priority when both
# are configured.

def test_submit_routes_cea_to_division_aag_when_workstation_has_no_direct_aag(
    as_user, make_user, division, aag_user, leave_type,
):
    from apps.organization.models import WorkStation

    station = WorkStation.objects.create(name='Regional Office', code='REGOFF', division=division)
    cea = make_user(
        username='cea2', full_name='CEA With Division Station', check_number='CEA-002',
        role='CHIEF_EXTERNAL_AUDITOR', work_station=station,
    )
    app = LeaveApplication.objects.create(
        employee=cea, leave_type=leave_type, full_name=cea.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )
    resp = as_user(cea).post(_url(app.id, 'submit'))
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_AAG_REVIEW
    assert Notification.objects.filter(related_application=app, user=aag_user).exists()

    resp = as_user(aag_user).post(_url(app.id, 'aag-review'), {'comments': 'ok'})
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_HR_REVIEW


def test_direct_workstation_aag_takes_priority_over_division_aag(
    as_user, make_user, division, aag_user, aag_user_at_station, work_station, leave_type,
):
    """When an AAG is assigned directly to the CEA's work station AND that
    work station also has a parent Division with its own AAG, the direct
    match wins (existing behavior is never overridden by the new fallback)."""
    work_station.division = division
    work_station.save(update_fields=['division'])
    cea = make_user(
        username='cea3', full_name='CEA With Both Configs', check_number='CEA-003',
        role='CHIEF_EXTERNAL_AUDITOR', work_station=work_station,
    )
    app = LeaveApplication.objects.create(
        employee=cea, leave_type=leave_type, full_name=cea.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )
    as_user(cea).post(_url(app.id, 'submit'))

    resp = as_user(aag_user).post(_url(app.id, 'aag-review'), {'comments': 'wrong reviewer'})
    assert resp.status_code in (400, 403, 404), resp.data

    resp = as_user(aag_user_at_station).post(_url(app.id, 'aag-review'), {'comments': 'right reviewer'})
    assert resp.status_code == 200, resp.data


def test_submit_rejected_when_workstation_division_has_no_aag(
    as_user, make_user, division, leave_type,
):
    from apps.organization.models import WorkStation

    station = WorkStation.objects.create(name='Lonely Regional Office', code='LONEREG', division=division)
    cea = make_user(
        username='cea4', full_name='CEA Vacant Division AAG', check_number='CEA-004',
        role='CHIEF_EXTERNAL_AUDITOR', work_station=station,
    )
    app = LeaveApplication.objects.create(
        employee=cea, leave_type=leave_type, full_name=cea.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )
    resp = as_user(cea).post(_url(app.id, 'submit'))
    assert resp.status_code == 400, resp.data
    assert 'aag' in resp.data['detail'].lower()
    app.refresh_from_db()
    assert app.status == S.DRAFT
