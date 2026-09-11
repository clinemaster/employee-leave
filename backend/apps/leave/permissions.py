"""
RBAC enforcement for the leave workflow. This is the single, server-side
source of truth for who may read/write which section of a LeaveApplication
and which workflow actions they may invoke. The frontend has its own
role-based UI gating, but it MUST NOT be trusted — every check here is
re-verified independently of anything the client sends.

Role -> access matrix (spec):
  EMPLOYEE              create/edit own DRAFT applications, edit Section A only, submit.
  HOD (*)               read-only Section A, edit Section B1 only, only on applications
                         routed to them (i.e. applicant.manager == them).
  HR_ADMIN               read-only A+B1, edit Section B2 only.
  AUTHORIZING_OFFICER    read-only A+B1+B2, edit Section C only.
  SYSTEM_ADMIN            manage leave types, holidays, org units, users (not the
                          workflow sections themselves).
"""
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied

from apps.accounts.models import Role

HOD_ROLES = {Role.HEAD_OF_DEPARTMENT, Role.HEAD_OF_SECTION, Role.HEAD_OF_UNIT}

# Fields that belong to each section of the paper form. Used to reject
# unauthorized field edits regardless of what the frontend sends.
SECTION_A_FIELDS = {
    'vote_code', 'sub_vote', 'check_number', 'personnel_file', 'full_name',
    'designation', 'station', 'division_department', 'phone_number', 'email',
    'contact_address', 'leave_type', 'leave_number', 'travel_assistance',
    'start_date', 'last_date', 'dependants',
    'travel_routes', 'taxi_expenses', 'mizigo_items',
}
SECTION_B1_FIELDS = {'recommendation'}  # LeaveRecommendation nested writable fields
SECTION_B2_FIELDS = {'hr_review'}  # LeaveHRReview nested writable fields
SECTION_C_FIELDS = {'approval'}  # LeaveApproval nested writable fields


def is_hod(user):
    return user.is_authenticated and user.role in HOD_ROLES


def is_hr_admin(user):
    return user.is_authenticated and user.role == Role.HR_ADMIN


def is_authorizing_officer(user):
    return user.is_authenticated and user.role == Role.AUTHORIZING_OFFICER


def is_system_admin(user):
    return user.is_authenticated and (user.role == Role.SYSTEM_ADMIN or user.is_superuser)


def is_employee_role(user):
    return user.is_authenticated and user.role == Role.EMPLOYEE


def routed_hod_for(application):
    """The HOD/HOS/HOU who should review this application: the employee's manager."""
    employee = application.employee
    return getattr(employee, 'manager', None)


def can_view_application(user, application):
    """
    IDOR protection: a user may fetch an application only if they are the
    applicant, the routed HOD/reviewer for it, or hold a role with
    organization-wide visibility (HR_ADMIN, AUTHORIZING_OFFICER, SYSTEM_ADMIN).
    """
    if is_system_admin(user):
        return True
    if application.employee_id == user.id:
        return True
    if is_hod(user) and routed_hod_for(application) is not None and routed_hod_for(application).id == user.id:
        return True
    if is_hr_admin(user) or is_authorizing_officer(user):
        return True
    return False


def visible_queryset_for(user, queryset):
    """Row-level filter applied to list endpoints so users only see what they're allowed to."""
    from django.db.models import Q

    if is_system_admin(user) or is_hr_admin(user) or is_authorizing_officer(user):
        return queryset
    if is_hod(user):
        return queryset.filter(Q(employee=user) | Q(employee__manager=user))
    return queryset.filter(employee=user)


def assert_can_edit_fields(user, application, incoming_fields):
    """
    Raise PermissionDenied if `user` is attempting to write any field not
    allowed for their role/section, or if they are not currently authorized
    to edit this application at all given its status/routing.
    """
    incoming_fields = set(incoming_fields)

    if is_system_admin(user):
        return  # system admins manage master data, not form sections directly

    if is_employee_role(user) or application.employee_id == user.id:
        if application.employee_id != user.id:
            raise PermissionDenied('You may only edit your own applications.')
        disallowed = incoming_fields - SECTION_A_FIELDS
        if disallowed:
            raise PermissionDenied(f'You may only edit Section A fields. Disallowed: {sorted(disallowed)}')
        return

    if is_hod(user):
        hod = routed_hod_for(application)
        if hod is None or hod.id != user.id:
            raise PermissionDenied('This application is not routed to you.')
        disallowed = incoming_fields - SECTION_B1_FIELDS
        if disallowed:
            raise PermissionDenied(f'You may only edit Section B1 (recommendation). Disallowed: {sorted(disallowed)}')
        return

    if is_hr_admin(user):
        disallowed = incoming_fields - SECTION_B2_FIELDS
        if disallowed:
            raise PermissionDenied(f'You may only edit Section B2 (HR review). Disallowed: {sorted(disallowed)}')
        return

    if is_authorizing_officer(user):
        disallowed = incoming_fields - SECTION_C_FIELDS
        if disallowed:
            raise PermissionDenied(f'You may only edit Section C (approval). Disallowed: {sorted(disallowed)}')
        return

    raise PermissionDenied('You are not authorized to edit this application.')


class IsAuthenticatedAndRole(permissions.BasePermission):
    """Generic DRF permission: require one of `allowed_roles` (or superuser)."""
    allowed_roles = ()

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser:
            return True
        return user.role in self.allowed_roles


class IsSystemAdmin(IsAuthenticatedAndRole):
    allowed_roles = (Role.SYSTEM_ADMIN,)


class CanAccessLeaveApplication(permissions.BasePermission):
    """Object-level permission for the LeaveApplication viewset (IDOR guard)."""

    def has_object_permission(self, request, view, obj):
        return can_view_application(request.user, obj)
