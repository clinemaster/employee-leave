"""
Privilege escalation: an employee PATCHing their own or another user's
`role` field is rejected/ignored.
"""
import pytest

from apps.accounts.models import Role

pytestmark = pytest.mark.django_db


def test_employee_cannot_patch_own_role(as_user, employee_user):
    resp = as_user(employee_user).patch(
        f'/api/users/{employee_user.id}/', {'role': Role.SYSTEM_ADMIN}, format='json'
    )
    assert resp.status_code == 403, resp.data
    employee_user.refresh_from_db()
    assert employee_user.role == Role.EMPLOYEE


def test_employee_cannot_patch_other_users_role(as_user, employee_user, other_employee_user):
    resp = as_user(employee_user).patch(
        f'/api/users/{other_employee_user.id}/', {'role': Role.HR_ADMIN}, format='json'
    )
    assert resp.status_code == 403, resp.data
    other_employee_user.refresh_from_db()
    assert other_employee_user.role == Role.EMPLOYEE


def test_hod_cannot_patch_role(as_user, hod_user, employee_user):
    resp = as_user(hod_user).patch(
        f'/api/users/{employee_user.id}/', {'role': Role.AUTHORIZING_OFFICER}, format='json'
    )
    assert resp.status_code == 403, resp.data
    employee_user.refresh_from_db()
    assert employee_user.role == Role.EMPLOYEE


def test_hr_admin_cannot_patch_role(as_user, hr_user, employee_user):
    """Only SYSTEM_ADMIN may write user accounts, per get_permissions()."""
    resp = as_user(hr_user).patch(
        f'/api/users/{employee_user.id}/', {'role': Role.SYSTEM_ADMIN}, format='json'
    )
    assert resp.status_code == 403, resp.data


def test_system_admin_can_patch_role(as_user, sysadmin_user, employee_user):
    resp = as_user(sysadmin_user).patch(
        f'/api/users/{employee_user.id}/', {'role': Role.HR_ADMIN}, format='json'
    )
    assert resp.status_code == 200, resp.data
    employee_user.refresh_from_db()
    assert employee_user.role == Role.HR_ADMIN


def test_employee_cannot_list_users(as_user, employee_user):
    resp = as_user(employee_user).get('/api/users/')
    assert resp.status_code == 403


def test_me_endpoint_does_not_allow_role_write(as_user, employee_user):
    resp = as_user(employee_user).get('/api/users/me/')
    assert resp.status_code == 200
    assert resp.data['role'] == Role.EMPLOYEE
    # /me/ has no write path: a PATCH to that URL is resolved by the router
    # as the detail route with pk="me", which requires SYSTEM_ADMIN and is
    # therefore rejected with 403 (not 404/405, but rejected all the same).
    resp = as_user(employee_user).patch('/api/users/me/', {'role': Role.SYSTEM_ADMIN}, format='json')
    assert resp.status_code == 403
    employee_user.refresh_from_db()
    assert employee_user.role == Role.EMPLOYEE
