"""
Real leave-balance calculation (spec section 40), derived from historical
LeaveApplication records rather than being manually maintained.

`taken` = sum of total_working_days for this employee/leave_type/period
          across applications that reached a final "used" state (approved,
          PDF generated, completed).
`pending` = sum of total_working_days for applications still in-flight
          through the workflow (submitted through pending-authorization).
`remaining` = opening_balance + entitlement - taken - pending.

`period` is the calendar year (as a string, e.g. "2026") of the
application's start_date — balances are tracked per employee/leave
type/year, matching LeaveBalance.Meta.unique_together.
"""
from django.db.models import Sum

from .models import ApplicationStatus as S
from .models import LeaveApplication, LeaveBalance

# "Taken" is keyed off the Section C decision (approval.approved=True) rather
# than current status, so it stays correct even after the application moves
# on to PDF_GENERATED/COMPLETED/ARCHIVED housekeeping statuses.
PENDING_STATUSES = {
    S.PENDING_HOD_REVIEW, S.HOD_RECOMMENDED, S.PENDING_HR_REVIEW,
    S.RETURNED_TO_HOD, S.PENDING_AUTHORIZATION,
}


def recalculate_balance(employee, leave_type, period):
    """
    Recompute (and persist) the LeaveBalance row for one
    employee/leave_type/period from LeaveApplication history. Creates the
    row (with zero opening_balance/entitlement, to be set separately by
    HR/admin) if it doesn't exist yet. Returns the LeaveBalance instance.
    """
    year = str(period)
    apps_qs = LeaveApplication.objects.filter(
        employee=employee, leave_type=leave_type, start_date__year=int(year),
    )
    taken = apps_qs.filter(approval__approved=True).aggregate(
        s=Sum('total_working_days')
    )['s'] or 0
    pending = apps_qs.filter(status__in=PENDING_STATUSES).aggregate(
        s=Sum('total_working_days')
    )['s'] or 0

    balance, _ = LeaveBalance.objects.get_or_create(
        employee=employee, leave_type=leave_type, period=year,
    )
    balance.taken = taken
    balance.pending = pending
    balance.remaining = (balance.opening_balance or 0) + (balance.entitlement or 0) - taken - pending
    balance.save(update_fields=['taken', 'pending', 'remaining', 'updated_at'])
    return balance


def recalculate_for_application(application):
    """Convenience wrapper: recalc the balance touched by one application."""
    if not application.start_date:
        return None
    return recalculate_balance(
        application.employee, application.leave_type, application.start_date.year
    )


def recalculate_all_for_employee(employee):
    """Recompute every leave_type/period combo this employee has applications for."""
    combos = (
        LeaveApplication.objects.filter(employee=employee)
        .values_list('leave_type_id', 'start_date__year')
        .distinct()
    )
    results = []
    for leave_type_id, year in combos:
        if leave_type_id is None or year is None:
            continue
        results.append(recalculate_balance(employee, leave_type_id, year))
    return results
