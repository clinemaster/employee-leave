"""
RBAC enforcement for the leave workflow. This is the single, server-side
source of truth for who may read/write which section of a LeaveApplication
and which workflow actions they may invoke. The frontend has its own
role-based UI gating, but it MUST NOT be trusted — every check here is
re-verified independently of anything the client sends.

Role -> access matrix (spec):
  EMPLOYEE              create/edit own DRAFT applications, edit Section A only, submit.
  HOD (*)               read-only Section A, edit Section B1 only, only on applications
                         routed to them: matched by department (see matched_head_for),
                         else legacy manager-based routing, else (vacant post) the
                         CHIEF_EXTERNAL_AUDITOR at the employee's work station acting
                         as "head of work station" (see matched_cea_for), else a
                         fallback HR Admin/Authorizing Officer. Department employees
                         only — Division employees go through AAG instead (see below).
  CAG                    stands in for Section B1 for applicants whose role requires it
                         (see needs_cag_review) — org-wide, not matched per org unit.
  AAG                    stands in for Section B1 for Division employees whose role
                         doesn't itself require CAG review (see needs_aag_review),
                         matched to the employee's specific division (matched_aag_for)
                         — CAG takes priority over AAG when both would apply. Also
                         stands in for CHIEF_EXTERNAL_AUDITOR, matched by work
                         station instead (that role has no division).
  HR_ADMIN               read-only A+B1, edit Section B2 only.
  AUTHORIZING_OFFICER    read-only A+B1+B2, edit Section C only.
  SYSTEM_ADMIN            manage leave types, org units, users (not the
                          workflow sections themselves).
"""
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied

from apps.accounts.models import CAG_APPLICANT_ROLES, Role

HOD_ROLES = {
    Role.HEAD_OF_DEPARTMENT, Role.DAG, Role.HEAD_OF_SECTION, Role.CHIEF_EXTERNAL_AUDITOR,
}

# For each org-unit field an employee may belong to, the role that reviews
# their leave applications and the matching FK on the reviewing user.
_ORG_UNIT_HEAD_ROLES = (
    ('department_id', Role.HEAD_OF_DEPARTMENT, 'department_id'),
    ('division_id', Role.DAG, 'division_id'),
)

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
SECTION_CAG_FIELDS = {'cag_review'}  # LeaveCAGReview nested writable fields
SECTION_AAG_FIELDS = {'aag_review'}  # LeaveAAGReview nested writable fields
SECTION_B2_FIELDS = {'hr_review'}  # LeaveHRReview nested writable fields
SECTION_C_FIELDS = {'approval'}  # LeaveApproval nested writable fields


def is_hod(user):
    return user.is_authenticated and any(user.has_role(r) for r in HOD_ROLES)


def is_hr_admin(user):
    return user.is_authenticated and user.has_role(Role.HR_ADMIN)


def is_authorizing_officer(user):
    return user.is_authenticated and user.has_role(Role.AUTHORIZING_OFFICER)


def is_system_admin(user):
    return user.is_authenticated and (user.has_role(Role.SYSTEM_ADMIN) or user.is_superuser)


def is_employee_role(user):
    return user.is_authenticated and user.has_role(Role.EMPLOYEE)


def is_cag_reviewer(user):
    return user.is_authenticated and user.has_role(Role.CAG)


def is_aag_reviewer(user):
    return user.is_authenticated and user.has_role(Role.AAG)


def needs_cag_review(employee):
    """
    True if this applicant's role requires the mandatory CAG review stage
    instead of the normal HOD stage (spec: AUTHORIZING_OFFICER,
    HEAD_OF_DEPARTMENT, DAG, AAG, CHIEF_ACCOUNTANT, DAHRM, ADA). Checked
    against the employee's full role set (base + additional_roles), same as
    every other role gate in this module.
    """
    return any(employee.has_role(r) for r in CAG_APPLICANT_ROLES)


def needs_aag_review(employee):
    """
    True if this applicant belongs to a Division, or holds
    CHIEF_EXTERNAL_AUDITOR (matched by work station instead of division --
    see matched_aag_for, since that role has no division to match by), and
    doesn't already need CAG review (needs_cag_review takes priority — an
    employee whose role is itself a CAG_APPLICANT_ROLE always follows the
    CAG track). Department employees are unaffected and keep the normal HOD
    stage (matched_head_for).
    """
    if needs_cag_review(employee):
        return False
    return employee.division_id is not None or employee.has_role(Role.CHIEF_EXTERNAL_AUDITOR)


def matched_aag_for(employee):
    """
    The AAG reviewer for this employee: matched by the employee's specific
    division (mirrors matched_head_for's division branch, but for AAG
    instead of DAG), or — for CHIEF_EXTERNAL_AUDITOR, who has no division
    (org-unit exempt) — matched two ways, in priority order:

      1. An AAG assigned directly to the CEA's own work station (the
         original "same workstation" routing this was built with).
      2. Falling back to the AAG already assigned to the Division that is
         the CEA's work station's parent (see organization.models.
         WorkStation.division) -- reuses the existing Division-to-AAG
         mapping instead of a separate CEA-to-AAG or Workstation-to-AAG
         link. Only used when (1) finds no one, so existing work-station-
         direct configurations keep working exactly as before.

    Returns None if vacant (no AAG found by either match).
    """
    from django.db.models import Q

    from apps.accounts.models import User

    if employee.division_id is not None:
        return User.objects.filter(
            Q(role=Role.AAG) | Q(additional_roles__role=Role.AAG),
            is_active=True, division_id=employee.division_id,
        ).distinct().order_by('id').first()
    if employee.has_role(Role.CHIEF_EXTERNAL_AUDITOR) and employee.work_station_id is not None:
        direct = User.objects.filter(
            Q(role=Role.AAG) | Q(additional_roles__role=Role.AAG),
            is_active=True, work_station_id=employee.work_station_id,
        ).distinct().order_by('id').first()
        if direct is not None:
            return direct
        division_id = employee.work_station.division_id
        if division_id is not None:
            return User.objects.filter(
                Q(role=Role.AAG) | Q(additional_roles__role=Role.AAG),
                is_active=True, division_id=division_id,
            ).distinct().order_by('id').first()
    return None


def matched_head_for(employee):
    """
    The Head of Department/Division whose org unit matches the employee's,
    found by role rather than by manual assignment (an employee belongs to
    exactly one of department/division — see
    accounts.serializers._validate_single_org_unit). Returns None if that
    org unit currently has no one holding the matching head role (vacant post).
    """
    from django.db.models import Q

    from apps.accounts.models import User

    for employee_field, head_role, head_field in _ORG_UNIT_HEAD_ROLES:
        org_unit_id = getattr(employee, employee_field)
        if org_unit_id is None:
            continue
        return User.objects.filter(
            Q(role=head_role) | Q(additional_roles__role=head_role),
            is_active=True, **{head_field: org_unit_id},
        ).distinct().order_by('id').first()
    return None


def matched_cea_for(employee):
    """
    The CHIEF_EXTERNAL_AUDITOR sharing the employee's work station, used as a
    "head of work station" fallback Section B1 reviewer (see routed_hod_for)
    for employees whose department/division has no matched head and no
    manager set. Returns None if the employee has no work station or no CEA
    shares it.
    """
    from django.db.models import Q

    from apps.accounts.models import User

    if employee.work_station_id is None:
        return None
    return User.objects.filter(
        Q(role=Role.CHIEF_EXTERNAL_AUDITOR) | Q(additional_roles__role=Role.CHIEF_EXTERNAL_AUDITOR),
        is_active=True, work_station_id=employee.work_station_id,
    ).distinct().order_by('id').first()


def routed_hod_for(application):
    """
    The reviewer for Section B1 of this application: the head of the
    employee's department/division (matched_head_for); else, for legacy
    Section-level routing not covered by that match, the employee's
    manually-assigned `manager`; else the CHIEF_EXTERNAL_AUDITOR at the
    employee's work station (matched_cea_for), acting as "head of work
    station" for otherwise-unmatched employees. Department/division heads
    always take priority over the CEA fallback.
    """
    employee = application.employee
    head = matched_head_for(employee)
    if head is not None:
        return head
    manager = getattr(employee, 'manager', None)
    if manager is not None:
        return manager
    return matched_cea_for(employee)


def fallback_reviewer_for(application):
    """
    Organization-wide fallback reviewer used only when routed_hod_for finds
    nothing at all (no department/division head, no manager, and no CEA at
    the employee's work station) — routes to HR Admin, then Authorizing
    Officer, rather than leaving the application stuck.
    """
    from django.db.models import Q

    from apps.accounts.models import User

    if routed_hod_for(application) is not None:
        return None

    def _first_with_role(role):
        return User.objects.filter(
            Q(role=role) | Q(additional_roles__role=role), is_active=True
        ).distinct().order_by('id').first()

    return _first_with_role(Role.HR_ADMIN) or _first_with_role(Role.AUTHORIZING_OFFICER)


def effective_reviewer_for(application):
    """The user who should act on Section B1: routed_hod_for, else fallback_reviewer_for."""
    return routed_hod_for(application) or fallback_reviewer_for(application)


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
    if is_cag_reviewer(user) and needs_cag_review(application.employee):
        return True
    if is_aag_reviewer(user) and needs_aag_review(application.employee):
        matched = matched_aag_for(application.employee)
        if matched is not None and matched.id == user.id:
            return True
    if is_hr_admin(user) or is_authorizing_officer(user):
        return True
    return False


def hod_scope_q(user):
    """
    Q object matching applications from employees this head reviews: those
    whose department/division matches the head's own (role-derived routing),
    plus legacy manager-based routing (Section heads, or any head manually
    assigned as someone's manager), plus — for a CHIEF_EXTERNAL_AUDITOR —
    employees at their work station who either (a) belong directly to a
    work station with no department/division at all (an employee's primary
    org assignment may now be Workstation -- see
    accounts.serializers._validate_single_org_unit), or (b) belong to a
    department/division whose head post is vacant (the same "vacant post"
    condition routed_hod_for falls back on; see matched_cea_for). Both cases
    additionally require no manager set.
    """
    from django.db.models import Exists, OuterRef, Q

    from apps.accounts.models import User

    q = Q(employee__manager=user)
    role_to_field = {
        Role.HEAD_OF_DEPARTMENT: 'department',
        Role.DAG: 'division',
    }
    for role, field in role_to_field.items():
        if not user.has_role(role):
            continue
        org_unit_id = getattr(user, f'{field}_id')
        if org_unit_id is not None:
            q |= Q(**{f'employee__{field}_id': org_unit_id})

    if user.has_role(Role.CHIEF_EXTERNAL_AUDITOR) and user.work_station_id is not None:
        def _no_active_head(role, org_unit_field):
            return ~Exists(
                User.objects.filter(
                    Q(role=role) | Q(additional_roles__role=role),
                    is_active=True,
                ).filter(**{org_unit_field: OuterRef(f'employee__{org_unit_field}')})
            )

        vacant_post = Q(employee__manager__isnull=True) & (
            (Q(employee__department__isnull=True) & Q(employee__division__isnull=True))
            | (Q(employee__department__isnull=False) & _no_active_head(Role.HEAD_OF_DEPARTMENT, 'department_id'))
            | (Q(employee__division__isnull=False) & _no_active_head(Role.DAG, 'division_id'))
        )
        q |= Q(employee__work_station_id=user.work_station_id) & vacant_post

    return q


def aag_scope_q(user):
    """
    Q object matching applications from employees this AAG reviews: those in
    the AAG's own division (division-matched AAG track), plus
    CHIEF_EXTERNAL_AUDITOR employees at the AAG's own work station
    (work-station-matched AAG track, since that role has no division to
    match by — see needs_aag_review/matched_aag_for), plus CEA employees
    whose work station's parent Division is this AAG's division (only when
    no AAG is directly assigned to that work station — mirrors
    matched_aag_for's priority, so an application is never listed in two
    different AAGs' queues at once). Excludes employees whose role is
    itself a CAG_APPLICANT_ROLE — CAG track takes priority.
    """
    from django.db.models import Exists, OuterRef, Q

    from apps.accounts.models import User

    cea_q = Q(employee__role=Role.CHIEF_EXTERNAL_AUDITOR) | Q(employee__additional_roles__role=Role.CHIEF_EXTERNAL_AUDITOR)

    q = Q(pk__in=[])
    if user.division_id is not None:
        q |= Q(employee__division_id=user.division_id)
        no_direct_workstation_aag = ~Exists(
            User.objects.filter(
                Q(role=Role.AAG) | Q(additional_roles__role=Role.AAG),
                is_active=True, work_station_id=OuterRef('employee__work_station_id'),
            )
        )
        q |= (
            cea_q & Q(employee__work_station__division_id=user.division_id) & no_direct_workstation_aag
        )
    if user.work_station_id is not None:
        q |= cea_q & Q(employee__work_station_id=user.work_station_id)

    not_cag_track = ~(
        Q(employee__role__in=CAG_APPLICANT_ROLES)
        | Q(employee__additional_roles__role__in=CAG_APPLICANT_ROLES)
    )
    return q & not_cag_track


def visible_queryset_for(user, queryset):
    """Row-level filter applied to list endpoints so users only see what they're allowed to."""
    from django.db.models import Q

    if is_system_admin(user) or is_hr_admin(user) or is_authorizing_officer(user):
        return queryset
    if is_cag_reviewer(user):
        cag_applicants = Q(employee__role__in=CAG_APPLICANT_ROLES) | Q(
            employee__additional_roles__role__in=CAG_APPLICANT_ROLES
        )
        return queryset.filter(Q(employee=user) | cag_applicants).distinct()
    if is_aag_reviewer(user):
        return queryset.filter(Q(employee=user) | aag_scope_q(user)).distinct()
    if is_hod(user):
        return queryset.filter(Q(employee=user) | hod_scope_q(user))
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

    if incoming_fields and incoming_fields <= SECTION_B1_FIELDS:
        # Section B1 (recommendation) belongs to whoever is actually routed
        # to review this application -- the matched Head of Department/
        # Division/Section, or (vacant post) the fallback HR Admin/
        # Authorizing Officer -- not gated by role alone, since the fallback
        # reviewer may not hold a HOD_ROLES role.
        reviewer = effective_reviewer_for(application)
        if reviewer is None or reviewer.id != user.id:
            raise PermissionDenied('This application is not routed to you.')
        return

    if incoming_fields and incoming_fields <= SECTION_CAG_FIELDS:
        if not is_cag_reviewer(user):
            raise PermissionDenied('Only a CAG reviewer may act here.')
        if not needs_cag_review(application.employee):
            raise PermissionDenied('This application is not routed to CAG.')
        return

    if incoming_fields and incoming_fields <= SECTION_AAG_FIELDS:
        if not is_aag_reviewer(user):
            raise PermissionDenied('Only an AAG reviewer may act here.')
        if not needs_aag_review(application.employee):
            raise PermissionDenied('This application is not routed to AAG.')
        matched = matched_aag_for(application.employee)
        if matched is None or matched.id != user.id:
            raise PermissionDenied('This application is not routed to you.')
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
        return any(user.has_role(r) for r in self.allowed_roles)


class IsSystemAdmin(IsAuthenticatedAndRole):
    allowed_roles = (Role.SYSTEM_ADMIN,)


class HasPermission(permissions.BasePermission):
    """
    Generic DRF permission: require `permission_code` (see
    accounts.models.Permission) granted to one of the user's roles via the
    SYSTEM_ADMIN-configurable RolePermission table (see
    accounts.models.role_has_permission) -- or superuser. Subclass and set
    `permission_code` (see CanManage* below) rather than instantiating
    directly, so it works as a plain DRF `permission_classes` entry.
    """
    permission_code = None

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser:
            return True
        from apps.accounts.models import role_has_permission
        return role_has_permission(user.all_roles, self.permission_code)


class CanManageUsers(HasPermission):
    permission_code = 'MANAGE_USERS'


class CanManageLeaveTypes(HasPermission):
    permission_code = 'MANAGE_LEAVE_TYPES'


class CanManagePersonTypes(HasPermission):
    permission_code = 'MANAGE_PERSON_TYPES'


class CanManageLeavePolicies(HasPermission):
    permission_code = 'MANAGE_LEAVE_POLICIES'


class CanManageOrganization(HasPermission):
    permission_code = 'MANAGE_ORGANIZATION'


class CanViewReports(HasPermission):
    permission_code = 'VIEW_REPORTS'


class CanAccessLeaveApplication(permissions.BasePermission):
    """Object-level permission for the LeaveApplication viewset (IDOR guard)."""

    def has_object_permission(self, request, view, obj):
        return can_view_application(request.user, obj)
