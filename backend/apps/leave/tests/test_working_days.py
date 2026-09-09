"""
Working-days calculation: weekends excluded, holidays excluded (including
recurring holidays), correct across month/year boundaries.
"""
import datetime

import pytest

from apps.leave.models import Holiday
from apps.leave.workingdays import calculate_working_days

pytestmark = pytest.mark.django_db


def test_simple_mon_to_fri_no_holidays():
    # Mon 2026-01-05 to Fri 2026-01-09 -> 5 working days
    assert calculate_working_days(datetime.date(2026, 1, 5), datetime.date(2026, 1, 9)) == 5


def test_excludes_weekends():
    # Mon 2026-01-05 to Sun 2026-01-11 -> 5 working days (weekend excluded)
    assert calculate_working_days(datetime.date(2026, 1, 5), datetime.date(2026, 1, 11)) == 5


def test_single_saturday_is_zero_working_days():
    assert calculate_working_days(datetime.date(2026, 1, 10), datetime.date(2026, 1, 10)) == 0  # Saturday


def test_end_before_start_returns_zero():
    assert calculate_working_days(datetime.date(2026, 1, 10), datetime.date(2026, 1, 5)) == 0


def test_excludes_non_recurring_holiday(db):
    Holiday.objects.create(date=datetime.date(2026, 1, 7), name='Special Day', is_recurring=False)
    # Mon 5 - Fri 9, minus Wed 7 -> 4 working days
    assert calculate_working_days(datetime.date(2026, 1, 5), datetime.date(2026, 1, 9)) == 4


def test_excludes_recurring_holiday_every_year(db):
    Holiday.objects.create(date=datetime.date(2020, 12, 25), name='Christmas', is_recurring=True)
    # 2026-12-25 is a Friday
    assert datetime.date(2026, 12, 25).weekday() == 4
    days = calculate_working_days(datetime.date(2026, 12, 21), datetime.date(2026, 12, 25))
    # Mon 21 - Fri 25 = 5 weekdays, minus recurring Christmas -> 4
    assert days == 4


def test_recurring_holiday_applies_across_year_boundary(db):
    Holiday.objects.create(date=datetime.date(2020, 1, 1), name='New Year', is_recurring=True)
    # Range spans Dec 2026 -> Jan 2027, should exclude both instances of Jan 1
    # if they fall in range. Here only 2027-01-01 (Friday) is in range.
    start = datetime.date(2026, 12, 28)  # Monday
    end = datetime.date(2027, 1, 2)      # Saturday
    days = calculate_working_days(start, end)
    # Weekdays in range: Dec28(Mon),29(Tue),30(Wed),31(Thu), Jan1(Fri,holiday-excluded), Jan2(Sat-excluded)
    assert days == 4


def test_recurring_holiday_feb29_skipped_on_non_leap_year(db):
    Holiday.objects.create(date=datetime.date(2020, 2, 29), name='Leap Day Holiday', is_recurring=True)
    # 2026 is not a leap year; ensure no crash and no exclusion happens improperly
    days = calculate_working_days(datetime.date(2026, 2, 23), datetime.date(2026, 2, 27))
    # Mon23-Fri27, all weekdays, no Feb 29 in 2026 -> 5
    assert days == 5


def test_month_boundary_calculation():
    # Jan 28 (Wed) 2026 to Feb 3 (Tue) 2026
    days = calculate_working_days(datetime.date(2026, 1, 28), datetime.date(2026, 2, 3))
    # Weekdays: Jan28(Wed),29(Thu),30(Fri), Jan31(Sat-x), Feb1(Sun-x), Feb2(Mon), Feb3(Tue) -> 5
    assert days == 5


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
