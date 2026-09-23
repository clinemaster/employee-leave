"""
Tests for the Travel Payment Request feature ("JEDWALI 1: MCHANGANUO WA
MAOMBI YA MALIPO"): PersonType CRUD + reorder, nested create/update of
travel routes/passengers/taxi/mizigo via the leave-applications write
endpoint, computed total arithmetic, RBAC, and PDF generation.
"""
import io
from decimal import Decimal

import pytest

from apps.leave.models import (
    MizigoItem, PersonType, TaxiExpense, TravelRoute, TravelRoutePassenger,
)

pytestmark = pytest.mark.django_db

PERSON_TYPES_URL = '/api/person-types/'
REORDER_URL = '/api/person-types/reorder/'


# --- PersonType CRUD + reorder ------------------------------------------


def test_seed_data_migration_created_four_person_types(db):
    codes = set(PersonType.objects.values_list('code', flat=True))
    assert {'SELF', 'SPOUSE', 'DEPENDANTS', 'HOUSE_HELP'} <= codes


def test_any_authenticated_user_can_list_person_types(as_user, employee_user):
    resp = as_user(employee_user).get(PERSON_TYPES_URL)
    assert resp.status_code == 200, resp.data


def test_sysadmin_can_create_person_type(as_user, sysadmin_user):
    resp = as_user(sysadmin_user).post(PERSON_TYPES_URL, {
        'name': 'Mgeni', 'code': 'GUEST', 'sort_order': 5,
    }, format='json')
    assert resp.status_code == 201, resp.data


@pytest.mark.parametrize('role_fixture', ['employee_user', 'hod_user', 'hr_user', 'ao_user'])
def test_non_admin_cannot_write_person_type(request, as_user, role_fixture):
    user = request.getfixturevalue(role_fixture)
    resp = as_user(user).post(PERSON_TYPES_URL, {
        'name': 'Mgeni', 'code': 'GUEST2', 'sort_order': 5,
    }, format='json')
    assert resp.status_code == 403, resp.data


@pytest.fixture
def three_person_types(db):
    a = PersonType.objects.create(name='Kwanza', code='FIRST', sort_order=10)
    b = PersonType.objects.create(name='Pili', code='SECOND', sort_order=11)
    c = PersonType.objects.create(name='Tatu', code='THIRD', sort_order=12)
    return a, b, c


def test_sysadmin_can_reorder_person_types(as_user, sysadmin_user, three_person_types):
    a, b, c = three_person_types
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


def test_reorder_rejects_unknown_id(as_user, sysadmin_user, three_person_types):
    a, b, c = three_person_types
    resp = as_user(sysadmin_user).post(REORDER_URL, [{'id': 999999, 'sort_order': 0}], format='json')
    assert resp.status_code == 400, resp.data


def test_non_admin_cannot_reorder_person_types(as_user, employee_user, three_person_types):
    resp = as_user(employee_user).post(REORDER_URL, [{'id': three_person_types[0].id, 'sort_order': 0}], format='json')
    assert resp.status_code == 403, resp.data


# --- Nested create/update via leave-applications ------------------------


@pytest.fixture
def person_types():
    return {p.code: p for p in PersonType.objects.filter(code__in=['SELF', 'SPOUSE', 'DEPENDANTS', 'HOUSE_HELP'])}


def _travel_payload(person_types):
    """NAULI (routes) only -- TAXI/MIZIGO are no longer client-writable, see
    the TravelPaymentSettings fixed-amount tests below."""
    self_id = person_types['SELF'].id
    spouse_id = person_types['SPOUSE'].id
    dependants_id = person_types['DEPENDANTS'].id
    house_help_id = person_types['HOUSE_HELP'].id
    return {
        'travel_routes': [
            {
                'from_place': 'Dodoma', 'to_place': 'Musoma Mjini',
                'fare_per_person': '85000.00', 'trip_type': 'ROUND_TRIP', 'sort_order': 0,
                'passengers': [
                    {'person_type': self_id, 'idadi': 1},
                    {'person_type': spouse_id, 'idadi': 1},
                    {'person_type': dependants_id, 'idadi': 4},
                    {'person_type': house_help_id, 'idadi': 1},
                ],
            },
            {
                'from_place': 'Musoma Mjini', 'to_place': 'Buhemba',
                'fare_per_person': '40000.00', 'trip_type': 'ROUND_TRIP', 'sort_order': 1,
                'passengers': [
                    {'person_type': self_id, 'idadi': 2},
                ],
            },
        ],
    }


def test_create_application_with_travel_payment_breakdown(as_user, employee_user, leave_type, person_types):
    payload = {
        'leave_type': leave_type.id,
        'start_date': '2026-01-05',
        'last_date': '2026-01-09',
        'travel_assistance': True,
        **_travel_payload(person_types),
    }
    resp = as_user(employee_user).post('/api/leave-applications/', payload, format='json')
    assert resp.status_code == 201, resp.data
    app_id = resp.data['id']
    assert TravelRoute.objects.filter(application_id=app_id).count() == 2
    assert TravelRoutePassenger.objects.filter(route__application_id=app_id).count() == 5
    # No SYSTEM_ADMIN-configured TAXI/MIZIGO amount yet -> no rows.
    assert TaxiExpense.objects.filter(application_id=app_id).count() == 0
    assert MizigoItem.objects.filter(application_id=app_id).count() == 0


def test_update_replaces_travel_routes(as_user, draft_application, employee_user, person_types):
    route = TravelRoute.objects.create(
        application=draft_application, from_place='Old', to_place='Place',
        fare_per_person=Decimal('1000.00'), trip_type='ONE_WAY',
    )
    TravelRoutePassenger.objects.create(route=route, person_type=person_types['SELF'], idadi=1)

    resp = as_user(employee_user).patch(
        f'/api/leave-applications/{draft_application.id}/',
        _travel_payload(person_types),
        format='json',
    )
    assert resp.status_code == 200, resp.data

    routes = list(TravelRoute.objects.filter(application=draft_application))
    assert len(routes) == 2
    assert TravelRoute.objects.filter(application=draft_application, from_place='Old').count() == 0


def test_read_serializer_exposes_computed_totals(as_user, draft_application, employee_user, person_types):
    as_user(employee_user).patch(
        f'/api/leave-applications/{draft_application.id}/',
        {'travel_assistance': True, **_travel_payload(person_types)},
        format='json',
    )
    resp = as_user(employee_user).get(f'/api/leave-applications/{draft_application.id}/')
    assert resp.status_code == 200, resp.data
    data = resp.data
    assert len(data['travel_routes']) == 2
    route0 = data['travel_routes'][0]
    assert route0['naule_total'] is not None
    assert len(route0['passengers']) == 4
    for passenger in route0['passengers']:
        assert passenger['total'] is not None
    assert Decimal(str(data['naule_grand_total'])) > 0
    # No SYSTEM_ADMIN-configured TAXI/MIZIGO amount -> both contribute 0.
    assert Decimal(str(data['taxi_grand_total'])) == Decimal('0')
    assert Decimal(str(data['mizigo_grand_total'])) == Decimal('0')
    assert Decimal(str(data['travel_payment_grand_total'])) == Decimal(str(data['naule_grand_total']))


# --- Computed arithmetic (worked example numbers) ------------------------


def test_worked_example_arithmetic(draft_application, person_types):
    route1 = TravelRoute.objects.create(
        application=draft_application, from_place='Dodoma', to_place='Musoma Mjini',
        fare_per_person=Decimal('85000.00'), trip_type='ROUND_TRIP', sort_order=0,
    )
    assert route1.trips == 2
    p_self = TravelRoutePassenger.objects.create(route=route1, person_type=person_types['SELF'], idadi=1)
    p_spouse = TravelRoutePassenger.objects.create(route=route1, person_type=person_types['SPOUSE'], idadi=1)
    p_deps = TravelRoutePassenger.objects.create(route=route1, person_type=person_types['DEPENDANTS'], idadi=4)
    p_help = TravelRoutePassenger.objects.create(route=route1, person_type=person_types['HOUSE_HELP'], idadi=1)

    assert p_self.total == Decimal('170000.00')
    assert p_spouse.total == Decimal('170000.00')
    assert p_deps.total == Decimal('680000.00')
    assert p_help.total == Decimal('170000.00')
    assert route1.naule_total == Decimal('1190000.00')

    route2 = TravelRoute.objects.create(
        application=draft_application, from_place='Musoma Mjini', to_place='Buhemba',
        fare_per_person=Decimal('40000.00'), trip_type='ROUND_TRIP', sort_order=1,
    )
    p2 = TravelRoutePassenger.objects.create(route=route2, person_type=person_types['SELF'], idadi=2)
    assert p2.total == Decimal('160000.00')

    taxi = TaxiExpense.objects.create(
        application=draft_application, number_of_trips=2, cost_per_trip=Decimal('100000.00'),
    )
    assert taxi.total == Decimal('200000.00')

    mizigo = MizigoItem.objects.create(
        application=draft_application, description='Mizigo', quantity=1, unit_cost=Decimal('100000.00'),
    )
    assert mizigo.total == Decimal('100000.00')

    draft_application.refresh_from_db()
    expected_naule = route1.naule_total + route2.naule_total
    assert draft_application.naule_grand_total == expected_naule
    assert draft_application.taxi_grand_total == Decimal('200000.00')
    assert draft_application.mizigo_grand_total == Decimal('100000.00')
    assert draft_application.travel_payment_grand_total == (
        draft_application.naule_grand_total
        + draft_application.taxi_grand_total
        + draft_application.mizigo_grand_total
    )

    # internal consistency: every passenger total = fare x idadi x trips,
    # every route total = sum of its passengers, grand NAULI = sum of routes,
    # JUMLA KUU = NAULI + TAXI + MIZIGO.
    for passenger in TravelRoutePassenger.objects.filter(route__application=draft_application):
        assert passenger.total == passenger.route.fare_per_person * passenger.idadi * passenger.route.trips
    for route in TravelRoute.objects.filter(application=draft_application):
        assert route.naule_total == sum((p.total for p in route.passengers.all()), Decimal('0'))


# --- RBAC ------------------------------------------------------------


def test_hod_cannot_edit_travel_routes(as_user, draft_application, hod_user, person_types):
    resp = as_user(hod_user).patch(
        f'/api/leave-applications/{draft_application.id}/',
        {'travel_routes': _travel_payload(person_types)['travel_routes']},
        format='json',
    )
    assert resp.status_code == 403, resp.data


def test_hr_cannot_edit_travel_routes_via_patch(as_user, draft_application, hr_user, person_types):
    resp = as_user(hr_user).patch(
        f'/api/leave-applications/{draft_application.id}/',
        {'travel_routes': _travel_payload(person_types)['travel_routes']},
        format='json',
    )
    assert resp.status_code == 403, resp.data


def test_ao_cannot_edit_travel_routes_via_patch(as_user, draft_application, ao_user, person_types):
    resp = as_user(ao_user).patch(
        f'/api/leave-applications/{draft_application.id}/',
        {'travel_routes': _travel_payload(person_types)['travel_routes']},
        format='json',
    )
    assert resp.status_code == 403, resp.data


def test_other_employee_cannot_edit_travel_routes_idor(as_user, draft_application, other_employee_user, person_types):
    resp = as_user(other_employee_user).patch(
        f'/api/leave-applications/{draft_application.id}/',
        {'travel_routes': _travel_payload(person_types)['travel_routes']},
        format='json',
    )
    assert resp.status_code in (403, 404), resp.data


def test_owner_cannot_edit_travel_routes_once_not_draft(as_user, draft_application, employee_user, person_types):
    draft_application.status = 'PENDING_HOD_REVIEW'
    draft_application.save(update_fields=['status'])
    resp = as_user(employee_user).patch(
        f'/api/leave-applications/{draft_application.id}/',
        {'travel_routes': _travel_payload(person_types)['travel_routes']},
        format='json',
    )
    assert resp.status_code == 400, resp.data


# --- PDF generation --------------------------------------------------


def _approve_application(application, hod_user, hr_user, ao_user, as_user):
    as_user(application.employee).post(f'/api/leave-applications/{application.id}/submit/')
    as_user(hod_user).post(
        f'/api/leave-applications/{application.id}/recommend/',
        {'decision': True}, format='json',
    )
    as_user(hr_user).post(
        f'/api/leave-applications/{application.id}/verify/',
        {'decision': True}, format='json',
    )
    resp = as_user(ao_user).post(
        f'/api/leave-applications/{application.id}/approve/',
        {'decision': True}, format='json',
    )
    application.refresh_from_db()
    return resp


def test_pdf_includes_jedwali_page_when_travel_data_present(
    as_user, draft_application, employee_user, hod_user, hr_user, ao_user, person_types,
):
    as_user(employee_user).patch(
        f'/api/leave-applications/{draft_application.id}/',
        _travel_payload(person_types),
        format='json',
    )
    _approve_application(draft_application, hod_user, hr_user, ao_user, as_user)
    assert draft_application.status == 'APPROVED'

    resp = as_user(employee_user).post(f'/api/leave-applications/{draft_application.id}/generate-pdf/')
    assert resp.status_code == 201, resp.data

    from apps.documents.models import LeaveDocument
    document = LeaveDocument.objects.get(pk=resp.data['id'])
    document.file.open('rb')
    pdf_bytes = document.file.read()
    document.file.close()

    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(pdf_bytes))
    assert len(reader.pages) == 3
    text = reader.pages[2].extract_text()
    assert 'JEDWALI 1' in text
    assert 'JUMLA KUU' in text


def test_pdf_skips_jedwali_page_when_no_travel_data(
    as_user, draft_application, employee_user, hod_user, hr_user, ao_user,
):
    _approve_application(draft_application, hod_user, hr_user, ao_user, as_user)
    assert draft_application.status == 'APPROVED'

    resp = as_user(employee_user).post(f'/api/leave-applications/{draft_application.id}/generate-pdf/')
    assert resp.status_code == 201, resp.data

    from apps.documents.models import LeaveDocument
    document = LeaveDocument.objects.get(pk=resp.data['id'])
    document.file.open('rb')
    pdf_bytes = document.file.read()
    document.file.close()

    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(pdf_bytes))
    assert len(reader.pages) == 2


def test_pdf_generation_does_not_crash_with_route_missing_passengers(
    as_user, draft_application, employee_user, hod_user, hr_user, ao_user,
):
    TravelRoute.objects.create(
        application=draft_application, from_place='A', to_place='B',
        fare_per_person=Decimal('1000.00'), trip_type='ONE_WAY',
    )
    _approve_application(draft_application, hod_user, hr_user, ao_user, as_user)
    resp = as_user(employee_user).post(f'/api/leave-applications/{draft_application.id}/generate-pdf/')
    assert resp.status_code == 201, resp.data


# --- TravelPaymentSettings: SYSTEM_ADMIN-configurable TAXI/MIZIGO caps --

SETTINGS_URL = '/api/travel-payment-settings/'


def test_settings_default_to_unconfigured(as_user, employee_user):
    resp = as_user(employee_user).get(SETTINGS_URL)
    assert resp.status_code == 200, resp.data
    assert resp.data['taxi_amount'] is None
    assert resp.data['mizigo_amount'] is None


def test_sysadmin_can_set_fixed_amounts(as_user, sysadmin_user):
    resp = as_user(sysadmin_user).put(SETTINGS_URL, {
        'taxi_amount': '100000.00', 'mizigo_amount': '100000.00',
    }, format='json')
    assert resp.status_code == 200, resp.data
    assert Decimal(resp.data['taxi_amount']) == Decimal('100000.00')
    assert Decimal(resp.data['mizigo_amount']) == Decimal('100000.00')

    # Persisted -- a fresh GET reflects it.
    resp = as_user(sysadmin_user).get(SETTINGS_URL)
    assert Decimal(resp.data['taxi_amount']) == Decimal('100000.00')


@pytest.mark.parametrize('role_fixture', ['employee_user', 'hod_user', 'hr_user', 'ao_user'])
def test_non_admin_cannot_set_fixed_amounts(request, as_user, role_fixture):
    user = request.getfixturevalue(role_fixture)
    resp = as_user(user).put(SETTINGS_URL, {'taxi_amount': '1.00'}, format='json')
    assert resp.status_code == 403, resp.data


def test_travel_assistance_auto_populates_configured_fixed_amounts(
    as_user, sysadmin_user, draft_application, employee_user,
):
    as_user(sysadmin_user).put(SETTINGS_URL, {
        'taxi_amount': '100000.00', 'mizigo_amount': '75000.00',
    }, format='json')

    resp = as_user(employee_user).patch(
        f'/api/leave-applications/{draft_application.id}/', {'travel_assistance': True}, format='json',
    )
    assert resp.status_code == 200, resp.data

    taxi = TaxiExpense.objects.get(application=draft_application)
    assert taxi.number_of_trips == 1
    assert taxi.cost_per_trip == Decimal('100000.00')
    mizigo = MizigoItem.objects.get(application=draft_application)
    assert mizigo.quantity == 1
    assert mizigo.unit_cost == Decimal('75000.00')


def test_no_travel_assistance_means_no_taxi_or_mizigo_regardless_of_configured_amount(
    as_user, sysadmin_user, draft_application, employee_user,
):
    as_user(sysadmin_user).put(SETTINGS_URL, {
        'taxi_amount': '100000.00', 'mizigo_amount': '100000.00',
    }, format='json')

    resp = as_user(employee_user).patch(
        f'/api/leave-applications/{draft_application.id}/', {'travel_assistance': False}, format='json',
    )
    assert resp.status_code == 200, resp.data
    assert not TaxiExpense.objects.filter(application=draft_application).exists()
    assert not MizigoItem.objects.filter(application=draft_application).exists()


def test_unconfigured_category_contributes_nothing(as_user, sysadmin_user, draft_application, employee_user):
    """Only TAXI configured -- MIZIGO stays unconfigured and gets no row."""
    as_user(sysadmin_user).put(SETTINGS_URL, {'taxi_amount': '100000.00'}, format='json')

    resp = as_user(employee_user).patch(
        f'/api/leave-applications/{draft_application.id}/', {'travel_assistance': True}, format='json',
    )
    assert resp.status_code == 200, resp.data
    assert TaxiExpense.objects.filter(application=draft_application).exists()
    assert not MizigoItem.objects.filter(application=draft_application).exists()


def test_toggling_travel_assistance_off_clears_previously_populated_amounts(
    as_user, sysadmin_user, draft_application, employee_user,
):
    as_user(sysadmin_user).put(SETTINGS_URL, {'taxi_amount': '100000.00', 'mizigo_amount': '100000.00'}, format='json')
    as_user(employee_user).patch(
        f'/api/leave-applications/{draft_application.id}/', {'travel_assistance': True}, format='json',
    )
    assert TaxiExpense.objects.filter(application=draft_application).exists()

    resp = as_user(employee_user).patch(
        f'/api/leave-applications/{draft_application.id}/', {'travel_assistance': False}, format='json',
    )
    assert resp.status_code == 200, resp.data
    assert not TaxiExpense.objects.filter(application=draft_application).exists()
    assert not MizigoItem.objects.filter(application=draft_application).exists()


def test_client_supplied_taxi_and_mizigo_input_is_ignored(as_user, sysadmin_user, employee_user, leave_type):
    """taxi_expenses/mizigo_items are not client-writable -- only the
    SYSTEM_ADMIN-configured fixed amount is ever used, regardless of what
    (if anything) the client sends for those keys."""
    as_user(sysadmin_user).put(SETTINGS_URL, {'taxi_amount': '100000.00', 'mizigo_amount': '100000.00'}, format='json')

    resp = as_user(employee_user).post('/api/leave-applications/', {
        'leave_type': leave_type.id, 'start_date': '2026-01-05', 'last_date': '2026-01-09',
        'travel_assistance': True,
        'taxi_expenses': [{'description': 'Client attempt', 'number_of_trips': 99, 'cost_per_trip': '1.00'}],
        'mizigo_items': [{'description': 'Client attempt', 'quantity': 99, 'unit_cost': '1.00'}],
    }, format='json')
    assert resp.status_code == 201, resp.data

    taxi = TaxiExpense.objects.get(application_id=resp.data['id'])
    assert taxi.number_of_trips == 1
    assert taxi.cost_per_trip == Decimal('100000.00')


def test_admin_amount_change_is_reflected_on_next_save(
    as_user, sysadmin_user, draft_application, employee_user,
):
    as_user(sysadmin_user).put(SETTINGS_URL, {'taxi_amount': '100000.00'}, format='json')
    as_user(employee_user).patch(
        f'/api/leave-applications/{draft_application.id}/', {'travel_assistance': True}, format='json',
    )
    assert TaxiExpense.objects.get(application=draft_application).cost_per_trip == Decimal('100000.00')

    as_user(sysadmin_user).put(SETTINGS_URL, {'taxi_amount': '150000.00'}, format='json')
    as_user(employee_user).patch(
        f'/api/leave-applications/{draft_application.id}/', {'contact_address': 'updated'}, format='json',
    )
    assert TaxiExpense.objects.get(application=draft_application).cost_per_trip == Decimal('150000.00')


def test_submit_succeeds_with_configured_fixed_amounts(
    as_user, sysadmin_user, draft_application, employee_user,
):
    as_user(sysadmin_user).put(SETTINGS_URL, {'taxi_amount': '100000.00', 'mizigo_amount': '100000.00'}, format='json')
    as_user(employee_user).patch(
        f'/api/leave-applications/{draft_application.id}/', {'travel_assistance': True}, format='json',
    )

    resp = as_user(employee_user).post(f'/api/leave-applications/{draft_application.id}/submit/')
    assert resp.status_code == 200, resp.data
