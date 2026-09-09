"""
Leave-entitlement policy engine (spec section 9: leave types are
configurable; section 40: leave balance spec).

Determines the annual entitlement (in days) for a given employee + leave
type + period by matching `LeavePolicy` rules against the employee's tenure
(years of service, computed from `User.date_of_first_appointment`). Falls
back to a system-default entitlement if no policy matches — this function
must never raise for missing configuration.
"""
from decimal import Decimal

from django.conf import settings

DEFAULT_ANNUAL_ENTITLEMENT_DAYS = Decimal(
    str(getattr(settings, 'LEAVE_DEFAULT_ENTITLEMENT_DAYS', 28))
)


def years_of_service(employee, as_of=None):
    """
    Whole years of service as of `as_of` (default: today), based on
    `employee.date_of_first_appointment`. Returns None if that field isn't
    set, so callers can decide whether to treat it as "unknown" (matches
    only flat/un-banded policies).
    """
    start = getattr(employee, 'date_of_first_appointment', None)
    if not start:
        return None
    from django.utils import timezone
    today = as_of or timezone.now().date()
    years = today.year - start.year - (
        (today.month, today.day) < (start.month, start.day)
    )
    return max(years, 0)


def _policy_matches(policy, tenure_years):
    if tenure_years is None:
        # Unknown tenure only matches flat (un-banded) policies.
        return policy.min_years_of_service is None and policy.max_years_of_service is None
    if policy.min_years_of_service is not None and tenure_years < policy.min_years_of_service:
        return False
    if policy.max_years_of_service is not None and tenure_years > policy.max_years_of_service:
        return False
    return True


def find_matching_policy(employee, leave_type, as_of=None):
    """
    Returns the first (lowest sort_order) active LeavePolicy matching this
    employee's tenure for `leave_type`, or None if none match.
    """
    from .models import LeavePolicy

    tenure_years = years_of_service(employee, as_of=as_of)
    policies = LeavePolicy.objects.filter(
        leave_type=leave_type, is_active=True
    ).order_by('sort_order', 'id')
    for policy in policies:
        if _policy_matches(policy, tenure_years):
            return policy
    return None


def compute_entitlement(employee, leave_type, period=None, as_of=None):
    """
    Returns the Decimal annual entitlement in days for employee/leave_type,
    as of `as_of` (default: today). Uses the first matching LeavePolicy;
    falls back to DEFAULT_ANNUAL_ENTITLEMENT_DAYS if none matches or
    leave_type/employee is missing. Never raises.
    """
    if employee is None or leave_type is None:
        return DEFAULT_ANNUAL_ENTITLEMENT_DAYS
    try:
        policy = find_matching_policy(employee, leave_type, as_of=as_of)
    except Exception:
        return DEFAULT_ANNUAL_ENTITLEMENT_DAYS
    if policy is not None:
        return policy.annual_entitlement
    return DEFAULT_ANNUAL_ENTITLEMENT_DAYS
