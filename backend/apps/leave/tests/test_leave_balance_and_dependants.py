"""
Leave balance read/visibility logic and LeaveDependant CRUD tied to an
application.
"""
import datetime
from decimal import Decimal

import pytest

from apps.leave.models import LeaveBalance, LeaveDependant

pytestmark = pytest.mark.django_db


# --- Leave balance -------------------------------------------------------


@pytest.fixture
def balance(employee_user, leave_type):
    return LeaveBalance.objects.create(
        employee=employee_user, leave_type=leave_type, period='2026',
        opening_balance=Decimal('5.00'), entitlement=Decimal('28.00'),
        taken=Decimal('3.00'), pending=Decimal('0.00'), remaining=Decimal('30.00'),
    )


def test_employee_sees_only_own_balance(as_user, employee_user, other_employee_user, balance):
    resp = as_user(employee_user).get('/api/leave-balances/')
    assert resp.status_code == 200
    ids = [row['id'] for row in resp.data['results']]
    assert balance.id in ids

    resp2 = as_user(other_employee_user).get('/api/leave-balances/')
    assert balance.id not in [row['id'] for row in resp2.data['results']]


def test_hr_admin_sees_all_balances(as_user, hr_user, balance):
    resp = as_user(hr_user).get('/api/leave-balances/')
    assert resp.status_code == 200
    ids = [row['id'] for row in resp.data['results']]
    assert balance.id in ids


def test_ao_sees_all_balances(as_user, ao_user, balance):
    resp = as_user(ao_user).get('/api/leave-balances/')
    assert resp.status_code == 200
    ids = [row['id'] for row in resp.data['results']]
    assert balance.id in ids


def test_leave_balance_is_read_only_for_employee(as_user, employee_user, balance):
    resp = as_user(employee_user).post('/api/leave-balances/', {
        'employee': employee_user.id, 'leave_type': balance.leave_type_id, 'period': '2027',
    }, format='json')
    assert resp.status_code == 405


def test_leave_balance_remaining_arithmetic(balance):
    # remaining should reflect opening + entitlement - taken - pending in a
    # correctly-maintained ledger (spec-level sanity check on the fixture).
    expected = balance.opening_balance + balance.entitlement - balance.taken - balance.pending
    assert expected == Decimal('30.00')
    assert balance.remaining == Decimal('30.00')


def test_leave_balance_unique_per_employee_type_period(employee_user, leave_type, balance):
    from django.db import IntegrityError
    with pytest.raises(IntegrityError):
        LeaveBalance.objects.create(employee=employee_user, leave_type=leave_type, period='2026')


# --- LeaveDependant CRUD ---------------------------------------------------


def test_create_application_with_dependants(as_user, employee_user, leave_type):
    resp = as_user(employee_user).post('/api/leave-applications/', {
        'leave_type': leave_type.id,
        'start_date': '2026-01-05',
        'last_date': '2026-01-09',
        'dependants': [
            {'name': 'Jane Doe', 'relationship': 'Spouse', 'date_of_birth': '1990-01-01'},
            {'name': 'Baby Doe', 'relationship': 'Child'},
        ],
    }, format='json')
    assert resp.status_code == 201, resp.data
    assert len(resp.data['dependants']) == 2
    app_id = resp.data['id']
    assert LeaveDependant.objects.filter(application_id=app_id).count() == 2


def test_update_replaces_dependants(as_user, draft_application, employee_user):
    LeaveDependant.objects.create(application=draft_application, name='Old Dep', relationship='Sibling')
    resp = as_user(employee_user).patch(f'/api/leave-applications/{draft_application.id}/', {
        'dependants': [{'name': 'New Dep', 'relationship': 'Spouse'}],
    }, format='json')
    assert resp.status_code == 200, resp.data
    deps = list(LeaveDependant.objects.filter(application=draft_application))
    assert len(deps) == 1
    assert deps[0].name == 'New Dep'


def test_dependants_visible_on_retrieve(as_user, draft_application, employee_user):
    LeaveDependant.objects.create(application=draft_application, name='Dep A', relationship='Spouse')
    resp = as_user(employee_user).get(f'/api/leave-applications/{draft_application.id}/')
    assert resp.status_code == 200
    names = [d['name'] for d in resp.data['dependants']]
    assert 'Dep A' in names


def test_other_employee_cannot_see_dependants_via_idor(as_user, draft_application, other_employee_user):
    LeaveDependant.objects.create(application=draft_application, name='Secret Dep', relationship='Spouse')
    resp = as_user(other_employee_user).get(f'/api/leave-applications/{draft_application.id}/')
    assert resp.status_code == 404
