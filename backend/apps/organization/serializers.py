from rest_framework import serializers

from .models import Department, Section, Station, Unit


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'name', 'code', 'is_active']


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ['id', 'name', 'code', 'department', 'is_active']


class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = ['id', 'name', 'code', 'section', 'is_active']


class StationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Station
        fields = ['id', 'name', 'code', 'address', 'is_active']
