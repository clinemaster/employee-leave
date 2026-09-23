"""
"My Applications" vs "Review Queue" data scope: My Applications is always
the caller's own submitted applications (all applications, for
SYSTEM_ADMIN); Review Queue/Recommendations/CAG/AAG queues/HR/AO Applications
use ?exclude_own=true to strip the caller's own submissions out of their
otherwise role-scoped visibility (see
apps.leave.views.LeaveApplicationViewSet.get_queryset).
"""
import datetime

import pytest

from apps.leave.models import LeaveApplication

pytestmark = pytest.mark.django_db

LIST_URL = '/api/leave-applications/'


def _make_application(employee, leave_type):
    return LeaveApplication.objects.create(
        employee=employee, leave_type=leave_type, full_name=employee.full_name,
        start_date=datetime.date(2026, 1, 5), last_date=datetime.date(2026, 1, 9),
    )


def test_employee_filter_returns_only_own_applications(as_user, employee_user, other_employee_user, leave_type):
    _make_application(employee_user, leave_type)
    _make_application(other_employee_user, leave_type)

    resp = as_user(employee_user).get(LIST_URL, {'employee': employee_user.id})
    assert resp.status_code == 200, resp.data
    ids = {row['employee'] for row in resp.data['results']}
    assert ids == {employee_user.id}


def test_employee_cannot_use_employee_filter_to_see_anothers_applications(
    as_user, employee_user, other_employee_user, leave_type,
):
    """visible_queryset_for is the base -- ?employee=<other> on top of it
    returns nothing, not another employee's data (IDOR protection)."""
    _make_application(other_employee_user, leave_type)

    resp = as_user(employee_user).get(LIST_URL, {'employee': other_employee_user.id})
    assert resp.status_code == 200, resp.data
    assert resp.data['results'] == []


def test_sysadmin_my_applications_sees_every_application(
    as_user, sysadmin_user, employee_user, other_employee_user, leave_type,
):
    _make_application(employee_user, leave_type)
    _make_application(other_employee_user, leave_type)

    resp = as_user(sysadmin_user).get(LIST_URL)
    assert resp.status_code == 200, resp.data
    assert resp.data['count'] >= 2


def test_exclude_own_removes_hods_own_application_from_their_review_scope(
    as_user, hod_user, employee_user, leave_type,
):
    """employee_user's manager is hod_user (see conftest), so hod_user is
    routed_hod_for employee_user's application -- it's in hod_user's scope.
    hod_user's OWN application must not be, once exclude_own is set."""
    routed_app = _make_application(employee_user, leave_type)
    own_app = _make_application(hod_user, leave_type)

    resp = as_user(hod_user).get(LIST_URL, {'exclude_own': 'true'})
    assert resp.status_code == 200, resp.data
    ids = {row['id'] for row in resp.data['results']}
    assert routed_app.id in ids
    assert own_app.id not in ids

    # Without exclude_own, the caller's own application is included (existing
    # behavior, unchanged) -- confirms exclude_own is additive/opt-in, not a
    # silent behavior change to the default list.
    resp = as_user(hod_user).get(LIST_URL)
    ids = {row['id'] for row in resp.data['results']}
    assert own_app.id in ids


def test_exclude_own_never_broadens_a_plain_employees_access(as_user, employee_user, other_employee_user, leave_type):
    """A plain employee's only visible application is their own -- with
    exclude_own, they see nothing (never someone else's, i.e. this can only
    narrow, never leak)."""
    _make_application(employee_user, leave_type)
    _make_application(other_employee_user, leave_type)

    resp = as_user(employee_user).get(LIST_URL, {'exclude_own': 'true'})
    assert resp.status_code == 200, resp.data
    assert resp.data['results'] == []


def test_exclude_own_removes_hr_admins_own_application(as_user, hr_user, employee_user, leave_type):
    """HR/AO have org-wide visibility (is_hr_admin/is_authorizing_officer
    short-circuit visible_queryset_for) -- exclude_own must still strip
    their own submission out of that broad set."""
    other_app = _make_application(employee_user, leave_type)
    own_app = _make_application(hr_user, leave_type)

    resp = as_user(hr_user).get(LIST_URL, {'exclude_own': 'true'})
    assert resp.status_code == 200, resp.data
    ids = {row['id'] for row in resp.data['results']}
    assert other_app.id in ids
    assert own_app.id not in ids
