from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class NaotTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds basic profile/role claims to the JWT response body (not the token itself)."""

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
        ]
        read_only_fields = ['id']


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
