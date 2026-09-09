"""
Server-authoritative working-day calculator.

Excludes Saturdays, Sundays, and Holiday dates (including recurring
month/day holidays, e.g. public holidays that repeat every year).
This is the single source of truth used both when an application is
created/updated and via the standalone preview endpoint the frontend
calls for live totals.
"""
from datetime import timedelta

from .models import Holiday


def _holiday_dates_in_range(start_date, end_date):
    """Return a set of all holiday dates (exact + recurring) that fall within [start_date, end_date]."""
    dates = set()
    holidays = Holiday.objects.all()
    for holiday in holidays:
        if holiday.is_recurring:
            for year in range(start_date.year, end_date.year + 1):
                try:
                    occurrence = holiday.date.replace(year=year)
                except ValueError:
                    # Feb 29 on a non-leap year — skip.
                    continue
                if start_date <= occurrence <= end_date:
                    dates.add(occurrence)
        else:
            if start_date <= holiday.date <= end_date:
                dates.add(holiday.date)
    return dates


def calculate_working_days(start_date, end_date):
    """
    Count working days (inclusive of both endpoints) between start_date and
    end_date, excluding Saturdays, Sundays, and public holidays.
    Returns 0 if end_date < start_date.
    """
    if end_date < start_date:
        return 0

    holiday_dates = _holiday_dates_in_range(start_date, end_date)

    count = 0
    current = start_date
    one_day = timedelta(days=1)
    while current <= end_date:
        if current.weekday() < 5 and current not in holiday_dates:  # Mon-Fri = 0-4
            count += 1
        current += one_day
    return count
