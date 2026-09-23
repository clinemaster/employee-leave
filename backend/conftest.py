import datetime

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.leave.models import LeaveType
from apps.organization.models import Department, Division, WorkStation


@pytest.fixture(autouse=True)
def _isolated_media_root(settings, tmp_path):
    """
    Redirect all file storage (generated PDFs, uploads) to a per-test temp
    directory instead of the real MEDIA_ROOT. Without this, running the test
    suite writes/overwrites files under the actual dev media/ folder,
    clobbering real applications' generated documents.
    """
    settings.MEDIA_ROOT = tmp_path / 'media'


@pytest.fixture
def api_client():
    return APIClient()


def _make_user(db, **kwargs):
    username = kwargs.pop('username')
    defaults = dict(
        username=username,
        full_name=kwargs.pop('full_name', 'Test User'),
        check_number=kwargs.pop('check_number'),
        role=kwargs.pop('role', Role.EMPLOYEE),
        official_email=kwargs.pop('official_email', f'{username}@naot.go.tz'),
    )
    defaults.update(kwargs)
    user = User.objects.create_user(password='TestPass123!', **defaults)
    return user


@pytest.fixture
def make_user(db):
    def _factory(**kwargs):
        return _make_user(db, **kwargs)
    return _factory


@pytest.fixture
def department(db):
    return Department.objects.create(name='Test Department', code='TESTDEPT')


@pytest.fixture
def division(db):
    return Division.objects.create(name='Test Division', code='TESTDIV')


@pytest.fixture
def work_station(db):
    return WorkStation.objects.create(name='Head Office', code='HQ')


@pytest.fixture
def hod_user(make_user):
    return make_user(username='hod1', full_name='Head Of Dept', check_number='HOD-001', role=Role.HEAD_OF_DEPARTMENT)


@pytest.fixture
def other_hod_user(make_user):
    return make_user(username='hod2', full_name='Other HOD', check_number='HOD-002', role=Role.HEAD_OF_DEPARTMENT)


@pytest.fixture
def hr_user(make_user):
    return make_user(username='hr1', full_name='HR Admin', check_number='HR-001', role=Role.HR_ADMIN)


@pytest.fixture
def ao_user(make_user):
    return make_user(username='ao1', full_name='Authorizing Officer', check_number='AO-001', role=Role.AUTHORIZING_OFFICER)


@pytest.fixture
def sysadmin_user(make_user):
    return make_user(username='sysadmin1', full_name='System Admin', check_number='SA-001', role=Role.SYSTEM_ADMIN)


@pytest.fixture
def cag_user(make_user):
    return make_user(username='cag1', full_name='CAG Reviewer', check_number='CAG-001', role=Role.CAG)


@pytest.fixture
def other_cag_user(make_user):
    return make_user(username='cag2', full_name='Other CAG Reviewer', check_number='CAG-002', role=Role.CAG)


@pytest.fixture
def aag_user(make_user, division):
    """An AAG matched to `division` -- reviews that division's employees."""
    return make_user(username='aag1', full_name='AAG Reviewer', check_number='AAG-001', role=Role.AAG, division=division)


@pytest.fixture
def other_aag_user(make_user):
    """An AAG matched to a different division -- used for IDOR checks."""
    other_division = Division.objects.create(name='Other Division', code='OTHERDIV')
    return make_user(
        username='aag2', full_name='Other AAG Reviewer', check_number='AAG-002', role=Role.AAG,
        division=other_division,
    )


@pytest.fixture
def division_employee_user(make_user, division):
    """A plain employee belonging to `division` -- must route through AAG, not the normal HOD stage."""
    return make_user(
        username='divemp1', full_name='Division Employee', check_number='DIVEMP-001', role=Role.EMPLOYEE,
        division=division,
    )


@pytest.fixture
def cea_user(make_user, work_station):
    """A CHIEF_EXTERNAL_AUDITOR at `work_station` -- has no division (org-unit exempt), so
    routes through AAG matched by work station instead."""
    return make_user(
        username='cea1', full_name='Chief External Auditor', check_number='CEA-001',
        role=Role.CHIEF_EXTERNAL_AUDITOR, work_station=work_station,
    )


@pytest.fixture
def aag_user_at_station(make_user, work_station):
    """An AAG at `work_station` -- reviews CHIEF_EXTERNAL_AUDITOR applicants at that station."""
    return make_user(
        username='aagstation1', full_name='AAG At Station', check_number='AAGSTN-001', role=Role.AAG,
        work_station=work_station,
    )


@pytest.fixture
def hod_applicant_user(make_user):
    """A Head of Department applying for their own leave -- must route through CAG, not the normal HOD stage."""
    return make_user(username='hodapp1', full_name='HOD Applicant', check_number='HODAPP-001', role=Role.HEAD_OF_DEPARTMENT)


@pytest.fixture
def employee_user(make_user, hod_user):
    return make_user(username='emp1', full_name='Employee One', check_number='EMP-001', role=Role.EMPLOYEE, manager=hod_user)


@pytest.fixture
def other_employee_user(make_user, other_hod_user):
    """An employee NOT routed to hod_user — used for IDOR checks."""
    return make_user(username='emp2', full_name='Employee Two', check_number='EMP-002', role=Role.EMPLOYEE, manager=other_hod_user)


@pytest.fixture
def leave_type(db):
    return LeaveType.objects.create(name='Annual Leave', code='ANNUAL', sort_order=1)


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def as_user():
    """Callable fixture: as_user(user) -> authenticated APIClient."""
    def _factory(user):
        return auth_client(user)
    return _factory


@pytest.fixture
def draft_application(db, employee_user, leave_type):
    from apps.leave.models import LeaveApplication
    app = LeaveApplication.objects.create(
        employee=employee_user,
        leave_type=leave_type,
        full_name=employee_user.full_name,
        start_date=datetime.date(2026, 1, 5),  # Monday
        last_date=datetime.date(2026, 1, 9),   # Friday, no holidays -> 5 working days
    )
    return app


@pytest.fixture
def hod_applicant_draft_application(db, hod_applicant_user, leave_type):
    """A DRAFT application from an applicant whose role requires CAG review."""
    from apps.leave.models import LeaveApplication
    app = LeaveApplication.objects.create(
        employee=hod_applicant_user,
        leave_type=leave_type,
        full_name=hod_applicant_user.full_name,
        start_date=datetime.date(2026, 1, 5),  # Monday
        last_date=datetime.date(2026, 1, 9),   # Friday, no holidays -> 5 working days
    )
    return app


@pytest.fixture
def division_employee_draft_application(db, division_employee_user, leave_type):
    """A DRAFT application from an employee who belongs to a Division -- must route through AAG."""
    from apps.leave.models import LeaveApplication
    app = LeaveApplication.objects.create(
        employee=division_employee_user,
        leave_type=leave_type,
        full_name=division_employee_user.full_name,
        start_date=datetime.date(2026, 1, 5),  # Monday
        last_date=datetime.date(2026, 1, 9),   # Friday, no holidays -> 5 working days
    )
    return app


@pytest.fixture
def cea_draft_application(db, cea_user, leave_type):
    """A DRAFT application from a CHIEF_EXTERNAL_AUDITOR -- must route through AAG, matched by work station."""
    from apps.leave.models import LeaveApplication
    app = LeaveApplication.objects.create(
        employee=cea_user,
        leave_type=leave_type,
        full_name=cea_user.full_name,
        start_date=datetime.date(2026, 1, 5),  # Monday
        last_date=datetime.date(2026, 1, 9),   # Friday, no holidays -> 5 working days
    )
    return app
