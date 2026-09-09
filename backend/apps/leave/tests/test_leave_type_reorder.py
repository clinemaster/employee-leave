"""
Tests for POST /api/leave-types/reorder/ — bulk sort_order update, admin-only,
atomic (all-or-nothing).
"""
import pytest

from apps.leave.models import LeaveType

pytestmark = pytest.mark.django_db

REORDER_URL = '/api/leave-types/reorder/'


@pytest.fixture
def three_leave_types(db):
    a = LeaveType.objects.create(name='Annual Leave', code='ANNUAL', sort_order=0)
    b = LeaveType.objects.create(name='Sick Leave', code='SICK', sort_order=1)
    c = LeaveType.objects.create(name='Maternity Leave', code='MATERNITY', sort_order=2)
    return a, b, c


def test_sysadmin_can_reorder(as_user, sysadmin_user, three_leave_types):
    a, b, c = three_leave_types
    payload = [
        {'id': c.id, 'sort_order': 0},
        {'id': a.id, 'sort_order': 1},
        {'id': b.id, 'sort_order': 2},
    ]
    resp = as_user(sysadmin_user).post(REORDER_URL, payload, format='json')
    assert resp.status_code == 200, resp.data
    a.refresh_from_db()
    b.refresh_from_db()
    c.refresh_from_db()
    assert c.sort_order == 0
    assert a.sort_order == 1
    assert b.sort_order == 2
    returned_ids = [row['id'] for row in resp.data]
    assert returned_ids == [c.id, a.id, b.id]


@pytest.mark.parametrize('role_fixture', ['employee_user', 'hod_user', 'hr_user', 'ao_user'])
def test_non_admin_cannot_reorder(request, as_user, role_fixture, three_leave_types):
    user = request.getfixturevalue(role_fixture)
    a, b, c = three_leave_types
    payload = [{'id': a.id, 'sort_order': 1}, {'id': b.id, 'sort_order': 0}]
    resp = as_user(user).post(REORDER_URL, payload, format='json')
    assert resp.status_code == 403, resp.data
    a.refresh_from_db()
    assert a.sort_order == 0  # untouched


def test_duplicate_id_rejected_no_partial_write(as_user, sysadmin_user, three_leave_types):
    a, b, c = three_leave_types
    payload = [
        {'id': a.id, 'sort_order': 5},
        {'id': a.id, 'sort_order': 6},
    ]
    resp = as_user(sysadmin_user).post(REORDER_URL, payload, format='json')
    assert resp.status_code == 400, resp.data
    a.refresh_from_db()
    assert a.sort_order == 0


def test_nonexistent_id_rejected_no_partial_write(as_user, sysadmin_user, three_leave_types):
    a, b, c = three_leave_types
    payload = [
        {'id': a.id, 'sort_order': 9},
        {'id': 999999, 'sort_order': 10},
    ]
    resp = as_user(sysadmin_user).post(REORDER_URL, payload, format='json')
    assert resp.status_code == 400, resp.data
    a.refresh_from_db()
    assert a.sort_order == 0  # not partially written despite being valid itself


def test_empty_body_rejected(as_user, sysadmin_user):
    resp = as_user(sysadmin_user).post(REORDER_URL, [], format='json')
    assert resp.status_code == 400, resp.data


def test_malformed_entry_rejected(as_user, sysadmin_user, three_leave_types):
    a, b, c = three_leave_types
    resp = as_user(sysadmin_user).post(REORDER_URL, [{'id': a.id}], format='json')
    assert resp.status_code == 400, resp.data
