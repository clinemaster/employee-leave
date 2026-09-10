from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


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
    class Meta:
        model = User
        fields = [
            'id', 'username', 'full_name', 'email', 'official_email', 'role',
            'check_number', 'personnel_file_number', 'designation',
            'station', 'department', 'section', 'unit', 'manager',
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

    class Meta:
        model = User
        fields = [
            'id', 'username', 'password', 'full_name', 'email', 'official_email',
            'role', 'check_number', 'personnel_file_number', 'designation',
            'station', 'department', 'section', 'unit', 'manager',
            'phone_number', 'date_of_first_appointment', 'is_active',
        ]
        read_only_fields = ['id']

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User(**validated_data)
        user.set_password(password or User.objects.make_random_password())
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


# --- MFA request bodies (apps.accounts.mfa_views) -----------------------

class MfaVerifySetupSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=8, min_length=6)


class MfaDisableSerializer(serializers.Serializer):
    password = serializers.CharField()


class MfaLoginVerifySerializer(serializers.Serializer):
    mfa_token = serializers.CharField()
    code = serializers.CharField(max_length=8, min_length=6)
