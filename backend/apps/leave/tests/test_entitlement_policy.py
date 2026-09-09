"""
Leave-entitlement policy engine tests (spec section 9 configurable leave
types / section 40 balance spec): LeavePolicy matching by tenure band,
fallback to system default, auto-population on first LeaveBalance record,
HR override preserved on recalculation, and RBAC on the LeavePolicy CRUD
endpoints.
"""
import datetime
from decimal import Decimal

import pytest

from apps.leave.balances import recalculate_balance
from apps.leave.entitlement import compute_entitlement, years_of_service
from apps.leave.models import LeaveBalance, LeavePolicy

pytestmark = pytest.mark.django_db


def _today():
    from django.utils import timezone
    return timezone.now().date()


# --- years_of_service / policy matching -----------------------------------


def test_years_of_service_none_when_unset(employee_user):
    employee_user.date_of_first_appointment = None
    assert years_of_service(employee_user) is None


def test_years_of_service_computed(employee_user):
    today = _today()
    employee_user.date_of_first_appointment = today.replace(year=today.year - 5)
    assert years_of_service(employee_user) == 5


def test_flat_policy_matches_regardless_of_tenure(employee_user, leave_type):
    LeavePolicy.objects.create(leave_type=leave_type, annual_entitlement=Decimal('28.00'))
    employee_user.date_of_first_appointment = _today().replace(year=_today().year - 2)
    assert compute_entitlement(employee_user, leave_type) == Decimal('28.00')


def test_tenure_band_policy_matches_correct_band(employee_user, leave_type):
    LeavePolicy.objects.create(
        leave_type=leave_type, min_years_of_service=0, max_years_of_service=4,
        annual_entitlement=Decimal('21.00'), sort_order=0,
    )
    LeavePolicy.objects.create(
        leave_type=leave_type, min_years_of_service=5, max_years_of_service=None,
        annual_entitlement=Decimal('30.00'), sort_order=1,
    )
    employee_user.date_of_first_appointment = _today().replace(year=_today().year - 7)
    assert compute_entitlement(employee_user, leave_type) == Decimal('30.00')

    employee_user.date_of_first_appointment = _today().replace(year=_today().year - 1)
    assert compute_entitlement(employee_user, leave_type) == Decimal('21.00')


def test_first_match_wins_by_sort_order(employee_user, leave_type):
    # Two overlapping bands; lower sort_order should win.
    LeavePolicy.objects.create(
        leave_type=leave_type, min_years_of_service=0, max_years_of_service=None,
        annual_entitlement=Decimal('19.00'), sort_order=0,
    )
    LeavePolicy.objects.create(
        leave_type=leave_type, min_years_of_service=0, max_years_of_service=None,
        annual_entitlement=Decimal('99.00'), sort_order=1,
    )
    employee_user.date_of_first_appointment = _today().replace(year=_today().year - 1)
    assert compute_entitlement(employee_user, leave_type) == Decimal('19.00')


def test_inactive_policy_is_ignored(employee_user, leave_type):
    LeavePolicy.objects.create(
        leave_type=leave_type, annual_entitlement=Decimal('99.00'), is_active=False,
    )
    assert compute_entitlement(employee_user, leave_type) == Decimal('28')  # system default


def test_fallback_to_system_default_when_no_policy(employee_user, leave_type):
    assert LeavePolicy.objects.filter(leave_type=leave_type).count() == 0
    assert compute_entitlement(employee_user, leave_type) == Decimal('28')


def test_compute_entitlement_never_crashes_on_missing_args(leave_type):
    assert compute_entitlement(None, leave_type) == Decimal('28')
    assert compute_entitlement(object(), None) == Decimal('28')


# --- auto-population on LeaveBalance creation ------------------------------


def test_first_balance_record_auto_populates_entitlement(employee_user, leave_type):
    LeavePolicy.objects.create(leave_type=leave_type, annual_entitlement=Decimal('25.00'))
    assert not LeaveBalance.objects.filter(employee=employee_user, leave_type=leave_type, period='2026').exists()

    balance = recalculate_balance(employee_user, leave_type, '2026')
    assert balance.entitlement == Decimal('25.00')
    assert balance.opening_balance == Decimal('0.00')


def test_first_balance_record_falls_back_to_default_without_policy(employee_user, leave_type):
    balance = recalculate_balance(employee_user, leave_type, '2027')
    assert balance.entitlement == Decimal('28')


def test_hr_override_preserved_on_recalculation(employee_user, leave_type):
    LeavePolicy.objects.create(leave_type=leave_type, annual_entitlement=Decimal('25.00'))
    balance = recalculate_balance(employee_user, leave_type, '2026')
    assert balance.entitlement == Decimal('25.00')

    # HR manually overrides the entitlement/opening_balance after creation.
    balance.entitlement = Decimal('40.00')
    balance.opening_balance = Decimal('3.00')
    balance.save(update_fields=['entitlement', 'opening_balance'])

    # Recalculating again (e.g. after a workflow transition) must not clobber
    # the HR override.
    balance2 = recalculate_balance(employee_user, leave_type, '2026')
    assert balance2.entitlement == Decimal('40.00')
    assert balance2.opening_balance == Decimal('3.00')


# --- LeaveBalanceSerializer computed vs overridden -------------------------


def test_balance_endpoint_shows_computed_and_overridden(as_user, employee_user, leave_type):
    LeavePolicy.objects.create(leave_type=leave_type, annual_entitlement=Decimal('25.00'))
    balance = recalculate_balance(employee_user, leave_type, '2026')
    balance.entitlement = Decimal('40.00')
    balance.save(update_fields=['entitlement'])

    resp = as_user(employee_user).get('/api/leave-balances/')
    assert resp.status_code == 200
    row = next(r for r in resp.data['results'] if r['id'] == balance.id)
    assert Decimal(row['computed_entitlement']) == Decimal('25.00')
    assert row['is_entitlement_overridden'] is True


# --- RBAC on LeavePolicy CRUD endpoints ------------------------------------


def test_employee_cannot_list_or_create_policy(as_user, employee_user, leave_type):
    resp = as_user(employee_user).get('/api/leave-policies/')
    assert resp.status_code == 403

    resp = as_user(employee_user).post('/api/leave-policies/', {
        'leave_type': leave_type.id, 'annual_entitlement': '30.00',
    }, format='json')
    assert resp.status_code == 403


def test_hr_admin_cannot_write_policy(as_user, hr_user, leave_type):
    resp = as_user(hr_user).post('/api/leave-policies/', {
        'leave_type': leave_type.id, 'annual_entitlement': '30.00',
    }, format='json')
    assert resp.status_code == 403


def test_system_admin_can_crud_policy(as_user, sysadmin_user, leave_type):
    client = as_user(sysadmin_user)
    resp = client.post('/api/leave-policies/', {
        'leave_type': leave_type.id, 'annual_entitlement': '30.00',
        'min_years_of_service': 0, 'max_years_of_service': 10,
    }, format='json')
    assert resp.status_code == 201, resp.data
    policy_id = resp.data['id']

    resp = client.get('/api/leave-policies/')
    assert resp.status_code == 200
    assert any(r['id'] == policy_id for r in resp.data['results'])

    resp = client.patch(f'/api/leave-policies/{policy_id}/', {'annual_entitlement': '35.00'}, format='json')
    assert resp.status_code == 200
    assert resp.data['annual_entitlement'] == '35.00'

    resp = client.delete(f'/api/leave-policies/{policy_id}/')
    assert resp.status_code == 204


def test_policy_max_less_than_min_rejected(as_user, sysadmin_user, leave_type):
    resp = as_user(sysadmin_user).post('/api/leave-policies/', {
        'leave_type': leave_type.id, 'annual_entitlement': '30.00',
        'min_years_of_service': 10, 'max_years_of_service': 5,
    }, format='json')
    assert resp.status_code == 400
