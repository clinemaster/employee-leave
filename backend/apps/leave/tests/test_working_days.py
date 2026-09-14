"""
Leave-day calculation: every calendar day counted inclusive of both
endpoints, weekends included, correct across month/year boundaries.
"""
import datetime

import pytest

from apps.leave.workingdays import calculate_working_days

pytestmark = pytest.mark.django_db


def test_simple_mon_to_fri():
    # Mon 2026-01-05 to Fri 2026-01-09 -> 5 calendar days
    assert calculate_working_days(datetime.date(2026, 1, 5), datetime.date(2026, 1, 9)) == 5


def test_includes_weekends():
    # Mon 2026-01-05 to Sun 2026-01-11 -> 7 calendar days (weekend included)
    assert calculate_working_days(datetime.date(2026, 1, 5), datetime.date(2026, 1, 11)) == 7


def test_single_saturday_is_one_day():
    assert calculate_working_days(datetime.date(2026, 1, 10), datetime.date(2026, 1, 10)) == 1  # Saturday


def test_end_before_start_returns_zero():
    assert calculate_working_days(datetime.date(2026, 1, 10), datetime.date(2026, 1, 5)) == 0


def test_month_boundary_calculation():
    # Jan 28 (Wed) 2026 to Feb 3 (Tue) 2026 -> 7 calendar days
    days = calculate_working_days(datetime.date(2026, 1, 28), datetime.date(2026, 2, 3))
    assert days == 7


def test_working_days_preview_endpoint(as_user, employee_user):
    resp = as_user(employee_user).post(
        '/api/working-days-preview/',
        {'start_date': '2026-01-05', 'end_date': '2026-01-09'},
        format='json',
    )
    assert resp.status_code == 200, resp.data
    assert resp.data['working_days'] == 5


def test_working_days_preview_requires_auth(api_client):
    resp = api_client.post('/api/working-days-preview/', {'start_date': '2026-01-05', 'end_date': '2026-01-09'}, format='json')
    assert resp.status_code == 401


def test_application_total_working_days_synced_on_create(as_user, employee_user, leave_type):
    # POST responds with the Section-A write serializer (no total_working_days
    # field there), so verify the persisted value via the detail GET instead.
    client = as_user(employee_user)
    resp = client.post(
        '/api/leave-applications/',
        {
            'leave_type': leave_type.id,
            'start_date': '2026-01-05',
            'last_date': '2026-01-09',
        },
        format='json',
    )
    assert resp.status_code == 201, resp.data
    app_id = resp.data['id']

    detail = client.get(f'/api/leave-applications/{app_id}/')
    assert detail.status_code == 200
    assert detail.data['total_working_days'] == 5
