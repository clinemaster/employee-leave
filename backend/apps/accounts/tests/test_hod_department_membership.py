"""
HEAD_OF_DEPARTMENT may only be granted to a user who already belongs to that
department -- never on creation, and never in the same write that also
changes the user's department (see
accounts.serializers._validate_hod_requires_existing_department_member).
"""
import pytest

from apps.accounts.models import Role, User

pytestmark = pytest.mark.django_db


def test_cannot_create_a_new_user_directly_as_hod(as_user, sysadmin_user, department):
    resp = as_user(sysadmin_user).post('/api/users/', {
        'username': 'freshhod', 'full_name': 'Fresh HOD', 'check_number': 'FHOD-001',
        'email': 'freshhod@naot.go.tz', 'role': Role.HEAD_OF_DEPARTMENT, 'department': department.id,
    }, format='json')
    assert resp.status_code == 400, resp.data
    assert not User.objects.filter(username='freshhod').exists()


def test_cannot_promote_to_hod_while_also_changing_department(
    as_user, sysadmin_user, make_user, department, division,
):
    """An admin may not transplant someone into a department and make them
    its head in the same request."""
    employee = make_user(
        username='transplant', full_name='Transplant', check_number='TRP-001',
        role=Role.EMPLOYEE, division=division,
    )
    resp = as_user(sysadmin_user).patch(f'/api/users/{employee.id}/', {
        'role': Role.HEAD_OF_DEPARTMENT, 'department': department.id, 'division': None,
    }, format='json')
    assert resp.status_code == 400, resp.data
    employee.refresh_from_db()
    assert employee.role == Role.EMPLOYEE
    assert employee.department_id is None


def test_can_promote_an_existing_department_member_to_hod(as_user, sysadmin_user, make_user, department):
    employee = make_user(
        username='promoteme', full_name='Promote Me', check_number='PROM-001',
        role=Role.EMPLOYEE, department=department,
    )
    resp = as_user(sysadmin_user).patch(
        f'/api/users/{employee.id}/', {'role': Role.HEAD_OF_DEPARTMENT}, format='json',
    )
    assert resp.status_code == 200, resp.data
    employee.refresh_from_db()
    assert employee.role == Role.HEAD_OF_DEPARTMENT
    assert employee.department_id == department.id


def test_can_grant_hod_as_additional_role_to_an_existing_department_member(
    as_user, sysadmin_user, make_user, department,
):
    """Mirrors the "Roles" checkbox popover in Manage Users, which only ever
    sends role/additional_roles -- never department -- so an existing
    member's department is implicitly preserved."""
    employee = make_user(
        username='addrole', full_name='Add Role', check_number='ADDR-001',
        role=Role.EMPLOYEE, department=department,
    )
    resp = as_user(sysadmin_user).patch(
        f'/api/users/{employee.id}/', {'additional_roles': [Role.HEAD_OF_DEPARTMENT]}, format='json',
    )
    assert resp.status_code == 200, resp.data
    assert Role.HEAD_OF_DEPARTMENT in resp.data['additional_roles']


def test_cannot_grant_hod_to_a_user_with_no_department(as_user, sysadmin_user, make_user, work_station):
    employee = make_user(
        username='nodept', full_name='No Dept', check_number='NODEPT-001',
        role=Role.EMPLOYEE, work_station=work_station,
    )
    resp = as_user(sysadmin_user).patch(
        f'/api/users/{employee.id}/', {'additional_roles': [Role.HEAD_OF_DEPARTMENT]}, format='json',
    )
    assert resp.status_code == 400, resp.data
