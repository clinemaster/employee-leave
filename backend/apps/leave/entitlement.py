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


def _policy_matches(policy, tenure_years, designation):
    if tenure_years is None:
        # Unknown tenure only matches flat (un-banded) policies.
        if policy.min_years_of_service is not None or policy.max_years_of_service is not None:
            return False
    else:
        if policy.min_years_of_service is not None and tenure_years < policy.min_years_of_service:
            return False
        if policy.max_years_of_service is not None and tenure_years > policy.max_years_of_service:
            return False
    if policy.designation:
        if not designation or policy.designation.strip().lower() != designation.strip().lower():
            return False
    return True


def _specificity(policy):
    """
    Number of non-null match criteria this policy applies (designation +
    tenure band), used to rank matches by specificity: a policy matching
    both designation and tenure band beats one matching only tenure or
    only designation, which beats a flat/default rule.
    """
    score = 0
    if policy.designation:
        score += 1
    if policy.min_years_of_service is not None or policy.max_years_of_service is not None:
        score += 1
    return score


def find_matching_policy(employee, leave_type, as_of=None):
    """
    Returns the most specific active LeavePolicy matching this employee's
    tenure and designation for `leave_type`, or None if none match.
    Specificity (designation + tenure band both matched beats either alone,
    beats a flat rule) is the primary ranking; `sort_order` (then `id`) is
    only the tiebreaker within equal specificity.
    """
    from .models import LeavePolicy

    tenure_years = years_of_service(employee, as_of=as_of)
    # employee.designation is now a FK to organization.Designation (was a
    # free-text field) — LeavePolicy.designation stays free text and is
    # matched case-insensitively against the designation's *name*.
    designation_obj = getattr(employee, 'designation', None)
    designation = designation_obj.name if designation_obj else None
    policies = LeavePolicy.objects.filter(
        leave_type=leave_type, is_active=True
    ).order_by('sort_order', 'id')
    matches = [p for p in policies if _policy_matches(p, tenure_years, designation)]
    if not matches:
        return None
    matches.sort(key=lambda p: (-_specificity(p), p.sort_order, p.id))
    return matches[0]


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
