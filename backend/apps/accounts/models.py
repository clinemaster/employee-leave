from django.contrib.auth.models import AbstractUser
from django.db import models


class Region(models.TextChoices):
    """Tanzania's regions (mikoa) — used for User.place_of_domicile."""
    ARUSHA = 'ARUSHA', 'Arusha'
    DAR_ES_SALAAM = 'DAR_ES_SALAAM', 'Dar es Salaam'
    DODOMA = 'DODOMA', 'Dodoma'
    GEITA = 'GEITA', 'Geita'
    IRINGA = 'IRINGA', 'Iringa'
    KAGERA = 'KAGERA', 'Kagera'
    KATAVI = 'KATAVI', 'Katavi'
    KIGOMA = 'KIGOMA', 'Kigoma'
    KILIMANJARO = 'KILIMANJARO', 'Kilimanjaro'
    LINDI = 'LINDI', 'Lindi'
    MANYARA = 'MANYARA', 'Manyara'
    MARA = 'MARA', 'Mara'
    MBEYA = 'MBEYA', 'Mbeya'
    MOROGORO = 'MOROGORO', 'Morogoro'
    MTWARA = 'MTWARA', 'Mtwara'
    MWANZA = 'MWANZA', 'Mwanza'
    NJOMBE = 'NJOMBE', 'Njombe'
    PEMBA_NORTH = 'PEMBA_NORTH', 'Pemba North'
    PEMBA_SOUTH = 'PEMBA_SOUTH', 'Pemba South'
    PWANI = 'PWANI', 'Pwani'
    RUKWA = 'RUKWA', 'Rukwa'
    RUVUMA = 'RUVUMA', 'Ruvuma'
    SHINYANGA = 'SHINYANGA', 'Shinyanga'
    SIMIYU = 'SIMIYU', 'Simiyu'
    SINGIDA = 'SINGIDA', 'Singida'
    SONGWE = 'SONGWE', 'Songwe'
    TABORA = 'TABORA', 'Tabora'
    TANGA = 'TANGA', 'Tanga'
    ZANZIBAR_NORTH = 'ZANZIBAR_NORTH', 'Zanzibar North'
    ZANZIBAR_SOUTH = 'ZANZIBAR_SOUTH', 'Zanzibar South'
    ZANZIBAR_WEST = 'ZANZIBAR_WEST', 'Zanzibar West'


class Role(models.TextChoices):
    EMPLOYEE = 'EMPLOYEE', 'Employee'
    HEAD_OF_DEPARTMENT = 'HEAD_OF_DEPARTMENT', 'Head of Department'
    DAG = 'DAG', 'DAG'
    HEAD_OF_SECTION = 'HEAD_OF_SECTION', 'Head of Section'
    HR_ADMIN = 'HR_ADMIN', 'HR Admin'
    AUTHORIZING_OFFICER = 'AUTHORIZING_OFFICER', 'Authorizing Officer'
    CAG = 'CAG', 'CAG'
    AAG = 'AAG', 'AAG'
    CHIEF_ACCOUNTANT = 'CHIEF_ACCOUNTANT', 'Chief Accountant'
    DAHRM = 'DAHRM', 'DAHRM'
    ADA = 'ADA', 'ADA'
    CHIEF_EXTERNAL_AUDITOR = 'CHIEF_EXTERNAL_AUDITOR', 'Chief External Auditor'
    SYSTEM_ADMIN = 'SYSTEM_ADMIN', 'SYSTEM_ADMIN'

# The role's full/official title, shown as the "Display Name" column on the
# SYSTEM_ADMIN Roles page (apps.accounts.views.RolePermissionsView) —
# deliberately separate from Role.choices' own label above (which is used
# elsewhere, e.g. Django admin's role dropdown, and stays unchanged). Falls
# back to the Role.choices label for any role not listed here.
ROLE_DISPLAY_NAMES = {
    Role.EMPLOYEE: 'Officer',
    Role.HEAD_OF_DEPARTMENT: 'HEAD OF DEPARTMENT',
    Role.DAG: 'Deputy Auditor General',
    Role.HEAD_OF_SECTION: 'HEAD OF SECTION',
    Role.HR_ADMIN: 'HR Admin',
    Role.AUTHORIZING_OFFICER: 'AUTHORIZING OFFICER',
    Role.CAG: 'Controller Auditor General',
    Role.AAG: 'Assistant Auditor General',
    Role.CHIEF_ACCOUNTANT: 'CHIEF_ACCOUNTANT',
    Role.DAHRM: 'Director Administration and Human Resource Management',
    Role.ADA: 'Assistant Director of Administration',
    Role.CHIEF_EXTERNAL_AUDITOR: 'CHIEF EXTERNAL AUDITOR',
    Role.SYSTEM_ADMIN: 'SYSTEM ADMINISTRATOR',
}

# Roles exempt from the "belongs to exactly one of department/division/work
# station" rule -- these are organization-wide, not tied to a single org
# unit. AAG and CHIEF_EXTERNAL_AUDITOR are deliberately NOT exempt: an AAG
# user is matched to a specific division (like DAG) to review that
# division's employees (see apps.leave.permissions.matched_aag_for), and a
# CEA is matched to a specific work station (matched_cea_for) -- both need
# their one org unit set for that matching to work.
ORG_UNIT_EXEMPT_ROLES = {
    Role.SYSTEM_ADMIN, Role.HR_ADMIN, Role.AUTHORIZING_OFFICER, Role.CAG,
    Role.CHIEF_ACCOUNTANT, Role.DAHRM, Role.ADA,
}

# Applicant roles for whom the leave workflow must route through CAG review
# instead of the normal Head of Department/Division stage (see
# apps.leave.permissions.needs_cag_review). These are leadership roles that
# sit at or above the normal HOD review layer, so a CAG reviewer stands in
# for that stage. CHIEF_EXTERNAL_AUDITOR is deliberately NOT included here --
# their own leave routes through AAG instead, matched by work station (see
# apps.leave.permissions.needs_aag_review/matched_aag_for), since they have
# no division to match by.
CAG_APPLICANT_ROLES = {
    Role.AUTHORIZING_OFFICER, Role.HEAD_OF_DEPARTMENT, Role.DAG,
    Role.AAG, Role.CHIEF_ACCOUNTANT, Role.DAHRM, Role.ADA,
}


class Permission(models.TextChoices):
    """
    Coarse, togglable capabilities -- see RolePermission. Each one gates a
    specific workflow action or admin capability (apps.leave.permissions/
    workflow.py, and the ReadAllWriteAdminMixin subclasses in
    apps.leave/organization/accounts views.py) in addition to the structural
    role-identity/routing checks, which stay hardcoded (e.g. "the AAG matched
    to this division" is a routing fact, not a togglable permission).
    """
    CREATE_LEAVE_APPLICATION = 'CREATE_LEAVE_APPLICATION', 'Create leave applications'
    RECOMMEND_LEAVE = 'RECOMMEND_LEAVE', 'Recommend leave (Section B1 - HOD)'
    CAG_REVIEW_LEAVE = 'CAG_REVIEW_LEAVE', 'CAG review'
    AAG_REVIEW_LEAVE = 'AAG_REVIEW_LEAVE', 'AAG review'
    VERIFY_LEAVE = 'VERIFY_LEAVE', 'Verify leave (Section B2 - HR)'
    APPROVE_LEAVE = 'APPROVE_LEAVE', 'Approve / deny leave (Section C - Authorizing Officer)'
    MANAGE_USERS = 'MANAGE_USERS', 'Manage users'
    MANAGE_LEAVE_TYPES = 'MANAGE_LEAVE_TYPES', 'Manage leave types'
    MANAGE_PERSON_TYPES = 'MANAGE_PERSON_TYPES', 'Manage person types'
    MANAGE_LEAVE_POLICIES = 'MANAGE_LEAVE_POLICIES', 'Manage leave policies'
    MANAGE_ORGANIZATION = 'MANAGE_ORGANIZATION', 'Manage organization structure'
    VIEW_REPORTS = 'VIEW_REPORTS', 'View / export reports'


class CustomRole(models.Model):
    """
    A role created by SYSTEM_ADMIN beyond the built-in Role choices (see the
    "Add Role" action on the Roles page). Behaves as a plain permission-
    holder -- permissions can be attached to it via RolePermission exactly
    like a built-in role -- but has none of the built-in roles' bespoke
    routing logic (matched_head_for/matched_aag_for/matched_cea_for,
    CAG_APPLICANT_ROLES, etc.); a user holding only a custom role is not
    automatically matched as anyone's reviewer. Exempt from the "belongs to
    exactly one department/division" rule, same as the other leadership-
    style roles -- see accounts.serializers._validate_single_org_unit.
    """
    code = models.CharField(max_length=32, unique=True, db_index=True)
    display_name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['display_name']

    def __str__(self):
        return f'{self.code} ({self.display_name})'


def role_choices():
    """Built-in Role.choices plus any SYSTEM_ADMIN-created CustomRole rows,
    as (code, display_name) pairs -- the full set of valid role values.
    Evaluated at call time (not import time), so a newly created custom role
    is valid immediately, no restart required."""
    built_in = [(code, ROLE_DISPLAY_NAMES.get(code, label)) for code, label in Role.choices]
    custom = list(CustomRole.objects.values_list('code', 'display_name'))
    return built_in + custom


def role_values():
    return {code for code, _ in role_choices()}


def is_custom_role(role):
    return CustomRole.objects.filter(code=role).exists()


class RolePermission(models.Model):
    """
    A Permission granted to a Role, editable via the SYSTEM_ADMIN-only Roles
    page (/api/role-permissions/). Existence of a row = granted; checked
    dynamically by role_has_permission() at the point of enforcement. Seeded
    by a data migration to match the previously-hardcoded behavior, so
    nothing changes on deploy until a SYSTEM_ADMIN edits the matrix.
    """
    # No `choices=` -- role may be a built-in Role or a SYSTEM_ADMIN-created
    # CustomRole; validated dynamically against role_values() at the point
    # of write (RolePermissionsView.put), not via static model choices.
    role = models.CharField(max_length=32)
    permission = models.CharField(max_length=64, choices=Permission.choices)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['role', 'permission'], name='uniq_role_permission')
        ]

    def __str__(self):
        return f'{self.role}: {self.permission}'


def role_has_permission(roles, permission):
    """
    True if any role in `roles` (an iterable of Role values, typically
    User.all_roles) has been granted `permission` via RolePermission.
    """
    return RolePermission.objects.filter(role__in=roles, permission=permission).exists()


class User(AbstractUser):
    """
    Custom user model. Extends AbstractUser (keeps username/password/email/
    is_staff/is_superuser/last_login/date_joined) and adds NAOT employee
    master-data fields plus the role used to drive workflow routing.
    """
    # No `choices=` -- role may be a built-in Role or a SYSTEM_ADMIN-created
    # CustomRole (see role_values()); validated dynamically in
    # UserWriteSerializer, not via static model choices.
    role = models.CharField(max_length=32, default=Role.EMPLOYEE, db_index=True)

    full_name = models.CharField(max_length=255)
    check_number = models.CharField(max_length=32, unique=True, db_index=True)
    personnel_file_number = models.CharField(max_length=64, blank=True)
    place_of_domicile = models.CharField(max_length=32, choices=Region.choices, blank=True)
    designation = models.ForeignKey(
        'organization.Designation', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )

    work_station = models.ForeignKey(
        'organization.WorkStation', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )
    department = models.ForeignKey(
        'organization.Department', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )
    division = models.ForeignKey(
        'organization.Division', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )
    section = models.ForeignKey(
        'organization.Section', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )

    official_email = models.EmailField(blank=True)
    date_of_first_appointment = models.DateField(null=True, blank=True)
    phone_number = models.CharField(max_length=32, blank=True)

    # Budget coding used to pre-fill leave applications' Section A.
    vote_code = models.CharField(max_length=32, blank=True)
    sub_vote = models.CharField(max_length=32, blank=True)

    # Supervisor/manager used to route applications to the correct
    # Head of Department/Section for review.
    manager = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='direct_reports',
    )

    deleted_at = models.DateTimeField(null=True, blank=True)

    # --- MFA (TOTP, opt-in per user) ---------------------------------
    # `mfa_secret` holds the Fernet-encrypted base32 TOTP secret (see
    # apps.accounts.mfa) — never plaintext at rest, and never serialized to
    # the API in either form (see serializers.UserSerializer). It is
    # populated by /api/auth/mfa/setup/ but `mfa_enabled` only flips to True
    # once the user proves possession of the authenticator via
    # /api/auth/mfa/verify-setup/.
    mfa_secret = models.CharField(max_length=255, blank=True, default='')
    mfa_enabled = models.BooleanField(default=False)
    # Replay protection: the last TOTP step number successfully consumed
    # (setup-verify or login-verify), so the same 6-digit code can't be
    # reused within its validity window.
    mfa_last_verified_step = models.BigIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['full_name']

    def __str__(self):
        return f'{self.full_name or self.username} ({self.check_number})'

    def has_role(self, role):
        """
        True if the user holds `role` either as their base `role` or as one
        of their additional_roles — every user is EMPLOYEE by default (the
        base role's own default), and may additionally be assigned e.g.
        HEAD_OF_DEPARTMENT to review applications without losing the ability
        to submit their own as an employee.
        """
        return role in self.all_roles

    @property
    def all_roles(self):
        """The full set of roles this user holds (base + additional).

        Cached on the instance: permission checks call has_role() repeatedly
        per request (DashboardStatsView alone tries up to 4 roles in
        sequence), and request.user is the same instance for the whole
        request, so without this each call re-queries additional_roles.
        """
        if not hasattr(self, '_all_roles_cache'):
            self._all_roles_cache = {self.role} | set(self.additional_roles.values_list('role', flat=True))
        return self._all_roles_cache


class UserAdditionalRole(models.Model):
    """
    A role held by a user in addition to their base `role` (e.g. an EMPLOYEE
    also designated HEAD_OF_DEPARTMENT to review their department's leave
    applications). See User.has_role / User.all_roles.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='additional_roles')
    # No `choices=` -- see User.role.
    role = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'role'], name='uniq_user_additional_role')
        ]

    def __str__(self):
        return f'{self.user} + {self.role}'
