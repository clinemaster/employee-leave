"""
CHIEF_EXTERNAL_AUDITOR as "head of work station": a fallback Section B1
reviewer for employees at their work station whose department/division has
no active head and no manager set (see apps.leave.permissions.matched_cea_for
/ routed_hod_for). Department/division heads always take priority over this
fallback -- see test_department_head_takes_priority_over_cea.
"""
import datetime

import pytest

from apps.accounts.models import Role
from apps.leave.models import ApplicationStatus as S
from apps.leave.models import LeaveApplication
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db


def _url(app_id, action=None):
    base = f'/api/leave-applications/{app_id}/'
    return base if action is None else base + f'{action}/'


@pytest.fixture
def department_with_no_head(db):
    from apps.organization.models import Department
    return Department.objects.create(name='Vacant Department', code='VACDEPT')


@pytest.fixture
def vacant_post_employee(make_user, department_with_no_head, work_station):
    """A department employee with no manager and no active HOD for their
    department -- must fall back to the CEA at their work station."""
    return make_user(
        username='vacantemp', full_name='Vacant Post Employee', check_number='VAC-001',
        role=Role.EMPLOYEE, department=department_with_no_head, work_station=work_station,
    )


@pytest.fixture
def vacant_post_application(db, vacant_post_employee, leave_type):
    return LeaveApplication.objects.create(
        employee=vacant_post_employee, leave_type=leave_type, full_name=vacant_post_employee.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )


def test_submit_routes_vacant_post_employee_to_cea_at_same_station(
    as_user, vacant_post_application, vacant_post_employee, cea_user,
):
    app = vacant_post_application
    resp = as_user(vacant_post_employee).post(_url(app.id, 'submit'))
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_HOD_REVIEW

    assert Notification.objects.filter(related_application=app, user=cea_user).exists()


def test_cea_can_recommend_and_it_routes_to_hr_then_ao(
    as_user, vacant_post_application, vacant_post_employee, cea_user, hr_user, ao_user,
):
    app = vacant_post_application
    as_user(vacant_post_employee).post(_url(app.id, 'submit'))

    resp = as_user(cea_user).post(_url(app.id, 'recommend'), {'decision': True})
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_HR_REVIEW
    assert app.recommendation is not None
    assert app.recommendation.recommended is True

    resp = as_user(hr_user).post(_url(app.id, 'verify'), {'decision': True})
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.PENDING_AUTHORIZATION

    resp = as_user(ao_user).post(_url(app.id, 'approve'), {'comments': 'approved'})
    assert resp.status_code == 200, resp.data
    app.refresh_from_db()
    assert app.status == S.APPROVED


def test_department_head_takes_priority_over_cea(
    as_user, make_user, department, work_station, cea_user, leave_type,
):
    """An employee whose department DOES have an active HOD routes to that
    HOD, even if they also share a work station with a CEA."""
    hod = make_user(
        username='deptHod', full_name='Dept HOD', check_number='DHOD-001',
        role=Role.HEAD_OF_DEPARTMENT, department=department,
    )
    employee = make_user(
        username='deptemp', full_name='Dept Employee', check_number='DEMP-001',
        role=Role.EMPLOYEE, department=department, work_station=work_station,
    )
    app = LeaveApplication.objects.create(
        employee=employee, leave_type=leave_type, full_name=employee.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )
    as_user(employee).post(_url(app.id, 'submit'))

    # The CEA is not routed to this application -- only the department HOD is.
    resp = as_user(cea_user).post(_url(app.id, 'recommend'), {'decision': True})
    assert resp.status_code in (400, 403, 404), resp.data

    resp = as_user(hod).post(_url(app.id, 'recommend'), {'decision': True})
    assert resp.status_code == 200, resp.data


def test_other_station_cea_cannot_act(
    as_user, vacant_post_application, make_user,
):
    from apps.organization.models import WorkStation
    other_station = WorkStation.objects.create(name='Other Station', code='OTHERSTN')
    other_cea = make_user(
        username='othercea', full_name='Other CEA', check_number='OCEA-001',
        role=Role.CHIEF_EXTERNAL_AUDITOR, work_station=other_station,
    )
    app = vacant_post_application
    as_user(app.employee).post(_url(app.id, 'submit'))

    resp = as_user(other_cea).post(_url(app.id, 'recommend'), {'decision': True})
    assert resp.status_code in (400, 403, 404), resp.data


@pytest.fixture
def station_only_employee(make_user, work_station):
    """An employee whose primary org assignment is the work station itself
    (no department, no division at all) -- see
    accounts.serializers._validate_single_org_unit, which now allows
    Workstation as a standalone primary assignment."""
    return make_user(
        username='stationemp', full_name='Station Only Employee', check_number='STN-001',
        role=Role.EMPLOYEE, work_station=work_station,
    )


def test_cea_queue_lists_employees_whose_only_org_unit_is_the_work_station(
    as_user, make_user, work_station, cea_user, leave_type, station_only_employee,
):
    """
    Regression: hod_scope_q's CEA "vacant post" branch used to only cover
    employees who belong to a department/division with no active head --
    an employee with no department/division at all (assigned directly to a
    work station) fell through the OR chain entirely and never appeared in
    the CEA's queue, even though routed_hod_for/effective_reviewer_for
    already matched them to the CEA for direct actions.
    """
    app = LeaveApplication.objects.create(
        employee=station_only_employee, leave_type=leave_type, full_name=station_only_employee.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )
    as_user(station_only_employee).post(_url(app.id, 'submit'))

    resp = as_user(cea_user).get('/api/leave-applications/?status=PENDING_HOD_REVIEW')
    assert resp.status_code == 200, resp.data
    results = resp.data['results'] if isinstance(resp.data, dict) and 'results' in resp.data else resp.data
    ids = [row['id'] for row in results]
    assert app.id in ids

    resp = as_user(cea_user).post(_url(app.id, 'recommend'), {'decision': True})
    assert resp.status_code == 200, resp.data


def test_cea_queue_lists_vacant_post_employees_at_their_station(
    as_user, vacant_post_application, cea_user, department, make_user, work_station, leave_type,
):
    """The CEA's HOD-scoped queue includes vacant-post employees at their
    station, but not an employee whose department already has an active head."""
    app = vacant_post_application
    as_user(app.employee).post(_url(app.id, 'submit'))

    make_user(
        username='deptHod2', full_name='Dept HOD Two', check_number='DHOD-002',
        role=Role.HEAD_OF_DEPARTMENT, department=department,
    )
    covered_employee = make_user(
        username='coveredemp', full_name='Covered Employee', check_number='COV-001',
        role=Role.EMPLOYEE, department=department, work_station=work_station,
    )
    covered_app = LeaveApplication.objects.create(
        employee=covered_employee, leave_type=leave_type, full_name=covered_employee.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )
    as_user(covered_employee).post(_url(covered_app.id, 'submit'))

    resp = as_user(cea_user).get('/api/leave-applications/?status=PENDING_HOD_REVIEW')
    assert resp.status_code == 200, resp.data
    results = resp.data['results'] if isinstance(resp.data, dict) and 'results' in resp.data else resp.data
    ids = [row['id'] for row in results]
    assert app.id in ids
    assert covered_app.id not in ids
