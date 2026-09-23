"""
The SYSTEM_ADMIN-only Roles page: GET/PUT /api/role-permissions/ and the
dynamic enforcement it drives (apps.leave.permissions.HasPermission and the
extra role_has_permission checks in apps.leave.workflow._check_role_for_action).
"""
import datetime

import pytest

from apps.accounts.models import Role, RolePermission
from apps.leave.models import LeaveApplication

pytestmark = pytest.mark.django_db

URL = '/api/role-permissions/'


def test_non_sysadmin_cannot_view_or_edit(as_user, hod_user):
    resp = as_user(hod_user).get(URL)
    assert resp.status_code == 403, resp.data

    resp = as_user(hod_user).put(URL, {'role': 'HOD', 'permissions': []}, format='json')
    assert resp.status_code == 403, resp.data


def test_sysadmin_can_view_matrix(as_user, sysadmin_user):
    resp = as_user(sysadmin_user).get(URL)
    assert resp.status_code == 200, resp.data
    assert {r['code'] for r in resp.data['roles']} == set(Role.values)
    assert 'RECOMMEND_LEAVE' in {p['code'] for p in resp.data['permissions']}
    # Seeded to match the previously-hardcoded behavior.
    assert 'RECOMMEND_LEAVE' in resp.data['matrix']['HEAD_OF_DEPARTMENT']
    assert 'VERIFY_LEAVE' in resp.data['matrix']['HR_ADMIN']


def test_sysadmin_can_edit_a_roles_permissions(as_user, sysadmin_user):
    resp = as_user(sysadmin_user).put(
        URL, {'role': 'HEAD_OF_DEPARTMENT', 'permissions': ['CREATE_LEAVE_APPLICATION']}, format='json',
    )
    assert resp.status_code == 200, resp.data
    assert resp.data['matrix']['HEAD_OF_DEPARTMENT'] == ['CREATE_LEAVE_APPLICATION']
    assert not RolePermission.objects.filter(role='HEAD_OF_DEPARTMENT', permission='RECOMMEND_LEAVE').exists()


def test_system_admin_role_is_immutable(as_user, sysadmin_user):
    resp = as_user(sysadmin_user).put(URL, {'role': 'SYSTEM_ADMIN', 'permissions': []}, format='json')
    assert resp.status_code == 400, resp.data


def test_rejects_invalid_role_or_permission(as_user, sysadmin_user):
    resp = as_user(sysadmin_user).put(URL, {'role': 'NOT_A_ROLE', 'permissions': []}, format='json')
    assert resp.status_code == 400, resp.data

    resp = as_user(sysadmin_user).put(
        URL, {'role': 'HR_ADMIN', 'permissions': ['NOT_A_PERMISSION']}, format='json',
    )
    assert resp.status_code == 400, resp.data


def test_revoking_recommend_leave_blocks_the_hod_from_recommending(
    as_user, sysadmin_user, employee_user, hod_user, draft_application,
):
    """Dynamic enforcement: routing still points at hod_user, but without the
    RECOMMEND_LEAVE permission the action is now denied."""
    as_user(employee_user).post(f'/api/leave-applications/{draft_application.id}/submit/')

    as_user(sysadmin_user).put(URL, {'role': 'HEAD_OF_DEPARTMENT', 'permissions': []}, format='json')

    resp = as_user(hod_user).post(f'/api/leave-applications/{draft_application.id}/recommend/', {'decision': True})
    assert resp.status_code == 403, resp.data

    # Restore and confirm it works again.
    as_user(sysadmin_user).put(
        URL, {'role': 'HEAD_OF_DEPARTMENT', 'permissions': ['CREATE_LEAVE_APPLICATION', 'RECOMMEND_LEAVE']},
        format='json',
    )
    resp = as_user(hod_user).post(f'/api/leave-applications/{draft_application.id}/recommend/', {'decision': True})
    assert resp.status_code == 200, resp.data


def test_manage_leave_types_permission_gates_write_access(as_user, sysadmin_user, hr_user):
    from apps.leave.models import LeaveType
    leave_type = LeaveType.objects.create(name='Annual Leave', code='ANNUAL')

    # HR_ADMIN isn't seeded with MANAGE_LEAVE_TYPES by default.
    resp = as_user(hr_user).patch(f'/api/leave-types/{leave_type.id}/', {'name': 'Renamed'}, format='json')
    assert resp.status_code == 403, resp.data

    as_user(sysadmin_user).put(
        URL, {'role': 'HR_ADMIN', 'permissions': ['CREATE_LEAVE_APPLICATION', 'VERIFY_LEAVE', 'MANAGE_LEAVE_TYPES']},
        format='json',
    )
    resp = as_user(hr_user).patch(f'/api/leave-types/{leave_type.id}/', {'name': 'Renamed'}, format='json')
    assert resp.status_code == 200, resp.data


def test_revoking_create_leave_application_blocks_submit(as_user, sysadmin_user, employee_user, leave_type):
    app = LeaveApplication.objects.create(
        employee=employee_user, leave_type=leave_type, full_name=employee_user.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )
    as_user(sysadmin_user).put(URL, {'role': 'EMPLOYEE', 'permissions': []}, format='json')

    resp = as_user(employee_user).post(f'/api/leave-applications/{app.id}/submit/')
    assert resp.status_code == 403, resp.data
