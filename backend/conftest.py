import datetime

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.leave.models import LeaveType


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
