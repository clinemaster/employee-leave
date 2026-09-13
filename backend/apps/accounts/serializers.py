from django.utils.crypto import get_random_string
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import ORG_UNIT_EXEMPT_ROLES, Role, User, UserAdditionalRole


def _validate_single_org_unit(attrs, instance=None):
    """Every employee/head belongs to exactly one of department/division/
    support_division (roles in ORG_UNIT_EXEMPT_ROLES are organization-wide
    and exempt)."""
    def resolve(field):
        if field in attrs:
            return attrs[field]
        return getattr(instance, field) if instance else None

    role = attrs.get('role', getattr(instance, 'role', None))
    if role in ORG_UNIT_EXEMPT_ROLES:
        return

    org_units = [resolve('department'), resolve('division'), resolve('support_division')]
    set_count = sum(1 for u in org_units if u is not None)
    if set_count != 1:
        raise serializers.ValidationError(
            'A user must belong to exactly one of department, division or support division.'
        )


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
        data['user'] = UserSerializer(self.user).data
        return data


class UserSerializer(serializers.ModelSerializer):
    # Roles held in addition to the base `role` (e.g. an EMPLOYEE also
    # designated HEAD_OF_DEPARTMENT) — see User.has_role/all_roles.
    additional_roles = serializers.SlugRelatedField(
        slug_field='role', many=True, read_only=True,
    )
    # department/division/support_division/station/section/unit are exposed
    # above as FK ids (for forms that need to submit them back) — these
    # *_name companions are the human-readable names for display, e.g. in
    # the header or the leave application's read-only Section A.
    department_name = serializers.CharField(source='department.name', read_only=True, default=None)
    division_name = serializers.CharField(source='division.name', read_only=True, default=None)
    support_division_name = serializers.CharField(source='support_division.name', read_only=True, default=None)
    work_station_name = serializers.CharField(source='work_station.name', read_only=True, default=None)
    section_name = serializers.CharField(source='section.name', read_only=True, default=None)
    unit_name = serializers.CharField(source='unit.name', read_only=True, default=None)
    designation_name = serializers.CharField(source='designation.name', read_only=True, default=None)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'full_name', 'email', 'official_email', 'role',
            'additional_roles',
            'check_number', 'personnel_file_number', 'designation', 'designation_name',
            'work_station', 'work_station_name', 'department', 'department_name',
            'division', 'division_name', 'support_division', 'support_division_name',
            'section', 'section_name', 'unit', 'unit_name', 'manager',
            'phone_number', 'date_of_first_appointment', 'is_active',
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
    # plain list — to_representation() below re-adds it for output.
    additional_roles = serializers.ListField(
        child=serializers.ChoiceField(choices=Role.choices), required=False, write_only=True,
    )

    class Meta:
        model = User
        fields = [
            'id', 'username', 'password', 'full_name', 'email', 'official_email',
            'role', 'additional_roles', 'check_number', 'personnel_file_number',
            'designation', 'work_station', 'department', 'division', 'support_division',
            'section', 'unit', 'manager',
            'phone_number', 'date_of_first_appointment', 'is_active',
        ]
        read_only_fields = ['id']

    def validate(self, attrs):
        _validate_single_org_unit(attrs, self.instance)
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
