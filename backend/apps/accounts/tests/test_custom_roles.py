"""
SYSTEM_ADMIN "Add Role" — apps.accounts.views.CustomRoleViewSet /
accounts.models.CustomRole. A created role behaves as a plain permission-
holder (see CustomRole's docstring): permissions can be attached to it via
the existing Roles page (RolePermissionsView), it's usable as a
role/additional_role on a user, and it's exempt from the "belongs to exactly
one department/division" rule -- but has none of the built-in roles'
bespoke routing logic.
"""
import pytest

from apps.accounts.models import CustomRole, RolePermission

pytestmark = pytest.mark.django_db

ROLES_URL = '/api/custom-roles/'
PERMISSIONS_URL = '/api/role-permissions/'


def test_non_sysadmin_cannot_create_role(as_user, hod_user):
    resp = as_user(hod_user).post(ROLES_URL, {'code': 'REGIONAL_MANAGER', 'display_name': 'Regional Manager'})
    assert resp.status_code == 403, resp.data


def test_sysadmin_can_create_a_role(as_user, sysadmin_user):
    resp = as_user(sysadmin_user).post(
        ROLES_URL, {'code': 'regional manager', 'display_name': ' Regional Manager '}, format='json',
    )
    assert resp.status_code == 201, resp.data
    # code is normalized: uppercased, spaces -> underscores; display_name is trimmed.
    assert resp.data['code'] == 'REGIONAL_MANAGER'
    assert resp.data['display_name'] == 'Regional Manager'
    assert CustomRole.objects.filter(code='REGIONAL_MANAGER').exists()


def test_rejects_code_colliding_with_builtin_role(as_user, sysadmin_user):
    resp = as_user(sysadmin_user).post(
        ROLES_URL, {'code': 'HR_ADMIN', 'display_name': 'Something Else'}, format='json',
    )
    assert resp.status_code == 400, resp.data


def test_rejects_duplicate_custom_role_code(as_user, sysadmin_user):
    CustomRole.objects.create(code='REGIONAL_MANAGER', display_name='Regional Manager')
    resp = as_user(sysadmin_user).post(
        ROLES_URL, {'code': 'REGIONAL_MANAGER', 'display_name': 'Another'}, format='json',
    )
    assert resp.status_code == 400, resp.data


def test_rejects_invalid_code_format(as_user, sysadmin_user):
    resp = as_user(sysadmin_user).post(
        ROLES_URL, {'code': '1_STARTS_WITH_DIGIT', 'display_name': 'x'}, format='json',
    )
    assert resp.status_code == 400, resp.data


def test_new_role_appears_in_role_permissions_matrix(as_user, sysadmin_user):
    as_user(sysadmin_user).post(ROLES_URL, {'code': 'REGIONAL_MANAGER', 'display_name': 'Regional Manager'})
    resp = as_user(sysadmin_user).get(PERMISSIONS_URL)
    assert resp.status_code == 200, resp.data
    codes = [r['code'] for r in resp.data['roles']]
    assert 'REGIONAL_MANAGER' in codes
    assert 'REGIONAL_MANAGER' in resp.data['matrix']


def test_permissions_can_be_attached_to_a_new_role(as_user, sysadmin_user):
    as_user(sysadmin_user).post(ROLES_URL, {'code': 'REGIONAL_MANAGER', 'display_name': 'Regional Manager'})
    resp = as_user(sysadmin_user).put(
        PERMISSIONS_URL, {'role': 'REGIONAL_MANAGER', 'permissions': ['CREATE_LEAVE_APPLICATION', 'VIEW_REPORTS']},
        format='json',
    )
    assert resp.status_code == 200, resp.data
    assert set(resp.data['matrix']['REGIONAL_MANAGER']) == {'CREATE_LEAVE_APPLICATION', 'VIEW_REPORTS'}
    assert RolePermission.objects.filter(role='REGIONAL_MANAGER', permission='VIEW_REPORTS').exists()


def test_new_role_is_assignable_to_a_user_and_org_unit_exempt(as_user, sysadmin_user, make_user):
    as_user(sysadmin_user).post(ROLES_URL, {'code': 'REGIONAL_MANAGER', 'display_name': 'Regional Manager'})
    resp = as_user(sysadmin_user).post(
        '/api/users/',
        {
            'username': 'regmgr', 'full_name': 'Regional Manager Person', 'check_number': 'RM-001',
            'role': 'REGIONAL_MANAGER', 'email': 'regmgr@naot.go.tz',
        },
        format='json',
    )
    assert resp.status_code == 201, resp.data
    assert resp.data['role'] == 'REGIONAL_MANAGER'


def test_new_role_rejected_as_additional_role_if_unknown(as_user, sysadmin_user, make_user):
    """A role code that doesn't exist (neither built-in nor a created CustomRole) is rejected."""
    target = make_user(username='plain1', full_name='Plain', check_number='PLN-001')
    resp = as_user(sysadmin_user).patch(
        f'/api/users/{target.id}/', {'additional_roles': ['NOT_A_REAL_ROLE']}, format='json',
    )
    assert resp.status_code == 400, resp.data


def test_cannot_delete_a_role_currently_assigned_to_a_user(as_user, sysadmin_user, make_user):
    as_user(sysadmin_user).post(ROLES_URL, {'code': 'REGIONAL_MANAGER', 'display_name': 'Regional Manager'})
    role = CustomRole.objects.get(code='REGIONAL_MANAGER')
    make_user(username='regmgr2', full_name='RM Two', check_number='RM-002', role='REGIONAL_MANAGER')

    resp = as_user(sysadmin_user).delete(f'{ROLES_URL}{role.id}/')
    assert resp.status_code == 400, resp.data
    assert CustomRole.objects.filter(code='REGIONAL_MANAGER').exists()


def test_can_delete_an_unused_role(as_user, sysadmin_user):
    as_user(sysadmin_user).post(ROLES_URL, {'code': 'REGIONAL_MANAGER', 'display_name': 'Regional Manager'})
    role = CustomRole.objects.get(code='REGIONAL_MANAGER')

    resp = as_user(sysadmin_user).delete(f'{ROLES_URL}{role.id}/')
    assert resp.status_code == 204, resp.data
    assert not CustomRole.objects.filter(code='REGIONAL_MANAGER').exists()


def test_deleting_a_role_cleans_up_its_permission_grants(as_user, sysadmin_user):
    """No orphaned RolePermission rows left behind referencing a deleted role."""
    as_user(sysadmin_user).post(ROLES_URL, {'code': 'REGIONAL_MANAGER', 'display_name': 'Regional Manager'})
    role = CustomRole.objects.get(code='REGIONAL_MANAGER')
    as_user(sysadmin_user).put(
        PERMISSIONS_URL, {'role': 'REGIONAL_MANAGER', 'permissions': ['VIEW_REPORTS']}, format='json',
    )
    assert RolePermission.objects.filter(role='REGIONAL_MANAGER').exists()

    resp = as_user(sysadmin_user).delete(f'{ROLES_URL}{role.id}/')
    assert resp.status_code == 204, resp.data
    assert not RolePermission.objects.filter(role='REGIONAL_MANAGER').exists()


def test_deleted_role_no_longer_appears_in_matrix(as_user, sysadmin_user):
    resp = as_user(sysadmin_user).post(ROLES_URL, {'code': 'REGIONAL_MANAGER', 'display_name': 'Regional Manager'})
    role_id = resp.data['id']

    as_user(sysadmin_user).delete(f'{ROLES_URL}{role_id}/')

    resp = as_user(sysadmin_user).get(PERMISSIONS_URL)
    assert resp.status_code == 200, resp.data
    codes = [r['code'] for r in resp.data['roles']]
    assert 'REGIONAL_MANAGER' not in codes
    assert 'REGIONAL_MANAGER' not in resp.data['matrix']
