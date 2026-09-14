"""
Server-authoritative leave-day calculator.

Counts every calendar day in the range, inclusive of both endpoints —
weekends are included in the count. This is the single source of truth
used both when an application is created/updated and via the standalone
preview endpoint the frontend calls for live totals.
"""


def calculate_working_days(start_date, end_date):
    """
    Count calendar days (inclusive of both endpoints) between start_date and
    end_date, including weekends. Returns 0 if end_date < start_date.
    """
    if end_date < start_date:
        return 0
    return (end_date - start_date).days + 1
