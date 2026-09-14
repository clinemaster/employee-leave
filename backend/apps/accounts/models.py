from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    EMPLOYEE = 'EMPLOYEE', 'Employee'
    HEAD_OF_DEPARTMENT = 'HEAD_OF_DEPARTMENT', 'Head of Department'
    HEAD_OF_DIVISION = 'HEAD_OF_DIVISION', 'Head of Division'
    HEAD_OF_SUPPORT_DIVISION = 'HEAD_OF_SUPPORT_DIVISION', 'Head of Support Division'
    HEAD_OF_SECTION = 'HEAD_OF_SECTION', 'Head of Section'
    HEAD_OF_UNIT = 'HEAD_OF_UNIT', 'Head of Unit'
    HR_ADMIN = 'HR_ADMIN', 'HR Admin'
    AUTHORIZING_OFFICER = 'AUTHORIZING_OFFICER', 'Authorizing Officer'
    CAG = 'CAG', 'CAG'
    SYSTEM_ADMIN = 'SYSTEM_ADMIN', 'System Admin'

# Roles exempt from the "belongs to exactly one of department/division/
# support_division" rule -- these are organization-wide, not tied to a
# single org unit.
ORG_UNIT_EXEMPT_ROLES = {Role.SYSTEM_ADMIN, Role.HR_ADMIN, Role.AUTHORIZING_OFFICER, Role.CAG}

# Applicant roles for whom the leave workflow must route through CAG review
# instead of the normal Head of Department/Division/Support Division stage
# (see apps.leave.permissions.needs_cag_review). These are leadership roles
# that sit at or above the normal HOD review layer, so a CAG reviewer stands
# in for that stage.
CAG_APPLICANT_ROLES = {
    Role.AUTHORIZING_OFFICER, Role.HEAD_OF_DEPARTMENT,
    Role.HEAD_OF_SUPPORT_DIVISION, Role.HEAD_OF_DIVISION,
}


class User(AbstractUser):
    """
    Custom user model. Extends AbstractUser (keeps username/password/email/
    is_staff/is_superuser/last_login/date_joined) and adds NAOT employee
    master-data fields plus the role used to drive workflow routing.
    """
    role = models.CharField(
        max_length=32, choices=Role.choices, default=Role.EMPLOYEE, db_index=True
    )

    full_name = models.CharField(max_length=255)
    check_number = models.CharField(max_length=32, unique=True, db_index=True)
    personnel_file_number = models.CharField(max_length=64, blank=True)
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
    support_division = models.ForeignKey(
        'organization.SupportDivision', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )
    section = models.ForeignKey(
        'organization.Section', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )
    unit = models.ForeignKey(
        'organization.Unit', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )

    official_email = models.EmailField(blank=True)
    date_of_first_appointment = models.DateField(null=True, blank=True)
    phone_number = models.CharField(max_length=32, blank=True)

    # Budget coding used to pre-fill leave applications' Section A.
    vote_code = models.CharField(max_length=32, blank=True)
    sub_vote = models.CharField(max_length=32, blank=True)

    # Supervisor/manager used to route applications to the correct
    # Head of Department/Section/Unit for review.
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
        return self.role == role or self.additional_roles.filter(role=role).exists()

    @property
    def all_roles(self):
        """The full set of roles this user holds (base + additional)."""
        return {self.role} | set(self.additional_roles.values_list('role', flat=True))


class UserAdditionalRole(models.Model):
    """
    A role held by a user in addition to their base `role` (e.g. an EMPLOYEE
    also designated HEAD_OF_DEPARTMENT to review their department's leave
    applications). See User.has_role / User.all_roles.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='additional_roles')
    role = models.CharField(max_length=32, choices=Role.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'role'], name='uniq_user_additional_role')
        ]

    def __str__(self):
        return f'{self.user} + {self.role}'
