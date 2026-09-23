import re

from django.db.models import Q
from django.utils.crypto import get_random_string
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import (
    ORG_UNIT_EXEMPT_ROLES, CustomRole, Role, User, UserAdditionalRole, is_custom_role, role_values,
)

_ROLE_CODE_RE = re.compile(r'^[A-Z][A-Z0-9_]*$')

# Reviewer roles matched to a single org unit each -- see
# apps.leave.permissions.matched_head_for/matched_aag_for/matched_cea_for,
# which only ever return one match per unit. Assigning a second active
# holder of the same role to the same unit would silently strand one of
# them with no applications ever routed to them (this mirrors a real bug
# fixed by hand earlier: 3 users held HEAD_OF_DEPARTMENT for one department).
_UNIQUE_REVIEWER_ROLES = {
    Role.HEAD_OF_DEPARTMENT: 'department',
    Role.DAG: 'division',
    Role.AAG: 'division',
    Role.CHIEF_EXTERNAL_AUDITOR: 'work_station',
}


def _validate_single_org_unit(attrs, instance=None):
    """Every employee/head belongs to exactly one of department, division,
    or work station (roles in ORG_UNIT_EXEMPT_ROLES are organization-wide
    and exempt, as is any SYSTEM_ADMIN-created CustomRole -- see
    accounts.models.CustomRole)."""
    def resolve(field):
        if field in attrs:
            return attrs[field]
        return getattr(instance, field) if instance else None

    role = attrs.get('role', getattr(instance, 'role', None))
    if role in ORG_UNIT_EXEMPT_ROLES or is_custom_role(role):
        return

    org_units = [resolve('department'), resolve('division'), resolve('work_station')]
    set_count = sum(1 for u in org_units if u is not None)
    if set_count != 1:
        raise serializers.ValidationError(
            'A user must belong to exactly one of department, division, or work station.'
        )


def _validate_unique_reviewer_per_org_unit(attrs, instance=None):
    """At most one active user may hold HEAD_OF_DEPARTMENT/DAG/AAG/
    CHIEF_EXTERNAL_AUDITOR for the same org unit at a time -- see
    _UNIQUE_REVIEWER_ROLES."""
    def resolve(field):
        if field in attrs:
            return attrs[field]
        return getattr(instance, field) if instance else None

    if resolve('is_active') is False:
        return

    base_role = resolve('role')
    if 'additional_roles' in attrs:
        extra_roles = attrs['additional_roles']
    elif instance:
        extra_roles = list(instance.additional_roles.values_list('role', flat=True))
    else:
        extra_roles = []
    held_roles = {r for r in [base_role, *extra_roles] if r}

    for role, field in _UNIQUE_REVIEWER_ROLES.items():
        if role not in held_roles:
            continue
        org_unit_id = resolve(field)
        if org_unit_id is None:
            continue
        clash = User.objects.filter(
            Q(role=role) | Q(additional_roles__role=role),
            is_active=True, **{f'{field}_id': org_unit_id},
        ).distinct()
        if instance is not None:
            clash = clash.exclude(pk=instance.pk)
        if clash.exists():
            raise serializers.ValidationError(
                f'Another active user already holds {role} for this {field.replace("_", " ")}.'
            )


def _validate_hod_requires_existing_department_member(attrs, instance=None):
    """HEAD_OF_DEPARTMENT may only be granted to a user who already belongs
    to that department -- never on creation (a brand-new user has no prior
    department to have belonged to), and never in the same write that also
    changes the user's department (that would let an admin transplant
    someone into a department and make them its head in one step). The
    admin must first place the person in the department as a plain
    EMPLOYEE, then grant HEAD_OF_DEPARTMENT as a separate, later update."""
    base_role = attrs.get('role', getattr(instance, 'role', None) if instance else None)
    if 'additional_roles' in attrs:
        extra_roles = attrs['additional_roles']
    elif instance:
        extra_roles = list(instance.additional_roles.values_list('role', flat=True))
    else:
        extra_roles = []
    held_roles = {r for r in [base_role, *extra_roles] if r}

    if Role.HEAD_OF_DEPARTMENT not in held_roles:
        return

    if instance is None:
        raise serializers.ValidationError(
            'HEAD_OF_DEPARTMENT cannot be granted when creating a new user. Create them as '
            'EMPLOYEE in the department first, then grant the role as a separate update.'
        )

    if 'department' in attrs:
        new_department = attrs['department']
        new_department_id = new_department.pk if new_department is not None else None
    else:
        new_department_id = instance.department_id

    if new_department_id is None or new_department_id != instance.department_id:
        raise serializers.ValidationError(
            'HEAD_OF_DEPARTMENT can only be granted to a user who already belongs to that '
            'department. Assign them to the department first, then grant the role as a '
            'separate update.'
        )


def _validate_role_values(attrs, instance=None):
    """`role`/`additional_roles` must each be a built-in Role or an existing
    CustomRole code (see accounts.models.role_values) -- checked here rather
    than via a static DRF ChoiceField so a newly created custom role is
    immediately assignable without a restart."""
    valid = role_values()
    role = attrs.get('role', getattr(instance, 'role', None) if instance else None)
    if role is not None and role not in valid:
        raise serializers.ValidationError({'role': f'"{role}" is not a valid role.'})
    for extra in attrs.get('additional_roles') or []:
        if extra not in valid:
            raise serializers.ValidationError({'additional_roles': f'"{extra}" is not a valid role.'})


class NaotTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds basic profile/role claims to the JWT response body (not the token itself).

    If the authenticating user has MFA enabled, `validate()` is never
    reached with full token issuance — see `apps.accounts.views.LoginView`,
    which intercepts MFA-enabled users before calling `super().post()` and
    returns a challenge response instead. This serializer only ever runs
    for non-MFA users or the second-step `/mfa/login-verify/` flow.
    """

    def validate(self, attrs):
        data = super().validate(attrs)
        # super().validate() leaves self.user as a plain fetch with no
        # select_related/prefetch_related, but UserSerializer reads 7 FK
        # *_name fields plus additional_roles — without this, each one is a
        # separate query on every login.
        user = User.objects.select_related(
            'department', 'division', 'work_station', 'section', 'designation',
        ).prefetch_related('additional_roles').get(pk=self.user.pk)
        data['user'] = UserSerializer(user).data
        return data


class UserSerializer(serializers.ModelSerializer):
    # Roles held in addition to the base `role` (e.g. an EMPLOYEE also
    # designated HEAD_OF_DEPARTMENT) — see User.has_role/all_roles.
    additional_roles = serializers.SlugRelatedField(
        slug_field='role', many=True, read_only=True,
    )
    # department/division/station/section are exposed above as FK ids (for
    # forms that need to submit them back) — these *_name companions are the
    # human-readable names for display, e.g. in the header or the leave
    # application's read-only Section A.
    department_name = serializers.CharField(source='department.name', read_only=True, default=None)
    division_name = serializers.CharField(source='division.name', read_only=True, default=None)
    work_station_name = serializers.CharField(source='work_station.name', read_only=True, default=None)
    section_name = serializers.CharField(source='section.name', read_only=True, default=None)
    designation_name = serializers.CharField(source='designation.name', read_only=True, default=None)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'full_name', 'email', 'official_email', 'role',
            'additional_roles',
            'check_number', 'personnel_file_number', 'place_of_domicile',
            'designation', 'designation_name',
            'work_station', 'work_station_name', 'department', 'department_name',
            'division', 'division_name',
            'section', 'section_name', 'manager',
            'phone_number', 'date_of_first_appointment', 'is_active',
            'vote_code', 'sub_vote',
            'mfa_enabled',
        ]
        # mfa_secret is deliberately never listed here — not even write_only —
        # so it can never be read OR set via the standard user serializers.
        # It is only ever touched by apps.accounts.mfa_views.
        read_only_fields = ['id', 'mfa_enabled']


class UserWriteSerializer(serializers.ModelSerializer):
    """SYSTEM_ADMIN-only create/update of user accounts."""
    password = serializers.CharField(write_only=True, required=False)
    # A flat list of extra role codes, e.g. ["HEAD_OF_DEPARTMENT"] — fully
    # replaces the user's additional roles on each write (not merged).
    # write_only because the model field is a reverse FK manager, not a
    # plain list — to_representation() below re-adds it for output. Not a
    # ChoiceField: valid values (built-in Role + CustomRole) are dynamic, so
    # they're checked in validate() -> _validate_role_values() instead of a
    # static choice list.
    additional_roles = serializers.ListField(
        child=serializers.CharField(), required=False, write_only=True,
    )

    class Meta:
        model = User
        fields = [
            'id', 'username', 'password', 'full_name', 'email', 'official_email',
            'role', 'additional_roles', 'check_number', 'personnel_file_number',
            'place_of_domicile',
            'designation', 'work_station', 'department', 'division',
            'section', 'manager',
            'phone_number', 'date_of_first_appointment', 'is_active',
            'vote_code', 'sub_vote',
        ]
        read_only_fields = ['id']

    def validate(self, attrs):
        _validate_role_values(attrs, self.instance)
        _validate_single_org_unit(attrs, self.instance)
        _validate_unique_reviewer_per_org_unit(attrs, self.instance)
        _validate_hod_requires_existing_department_member(attrs, self.instance)
        return attrs

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        rep['additional_roles'] = list(instance.additional_roles.values_list('role', flat=True))
        return rep

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        additional_roles = validated_data.pop('additional_roles', [])
        user = User(**validated_data)
        # BaseUserManager.make_random_password() was removed in Django 5.1 —
        # generate a random temp password ourselves when the admin leaves the
        # field blank (the account is created inactive-of-real-password until
        # reset via the normal password flow).
        user.set_password(password or get_random_string(32))
        user.save()
        self._sync_additional_roles(user, additional_roles)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        additional_roles = validated_data.pop('additional_roles', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        if additional_roles is not None:
            self._sync_additional_roles(instance, additional_roles)
        return instance

    @staticmethod
    def _sync_additional_roles(user, roles):
        roles = set(roles)
        user.additional_roles.exclude(role__in=roles).delete()
        existing = set(user.additional_roles.values_list('role', flat=True))
        UserAdditionalRole.objects.bulk_create([
            UserAdditionalRole(user=user, role=role) for role in roles - existing
        ])


class CustomRoleSerializer(serializers.ModelSerializer):
    """SYSTEM_ADMIN "Add Role" action — see accounts.models.CustomRole /
    accounts.views.CustomRoleViewSet. `code` is normalized (uppercased,
    spaces -> underscores) and must not collide with a built-in Role or an
    existing CustomRole."""

    class Meta:
        model = CustomRole
        fields = ['id', 'code', 'display_name', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_code(self, value):
        normalized = value.strip().upper().replace(' ', '_').replace('-', '_')
        if not _ROLE_CODE_RE.match(normalized):
            raise serializers.ValidationError(
                'Must start with a letter and contain only letters, numbers, and underscores.'
            )
        if normalized in Role.values:
            raise serializers.ValidationError(f'"{normalized}" is already a built-in role.')
        existing = CustomRole.objects.filter(code=normalized)
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError(f'"{normalized}" already exists.')
        return normalized

    def validate_display_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Display name is required.')
        return value


# --- MFA request bodies (apps.accounts.mfa_views) -----------------------

class MfaVerifySetupSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=8, min_length=6)


class MfaDisableSerializer(serializers.Serializer):
    password = serializers.CharField()


class MfaLoginVerifySerializer(serializers.Serializer):
    mfa_token = serializers.CharField()
    code = serializers.CharField(max_length=8, min_length=6)


# --- MFA / auth response shapes (documentation only — never used to parse
# incoming data, only to describe outgoing shapes for the OpenAPI schema) --

class MfaSetupResponseSerializer(serializers.Serializer):
    secret = serializers.CharField()
    provisioning_uri = serializers.CharField()


class TokenPairResponseSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()
    user = UserSerializer()


class MfaChallengeResponseSerializer(serializers.Serializer):
    mfa_required = serializers.BooleanField()
    mfa_token = serializers.CharField()
