from rest_framework import serializers

from .models import (
    Department, Designation, Division, Section, SupportDivision, Unit, WorkStation,
)


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'name', 'code', 'is_active']


class DivisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Division
        fields = ['id', 'name', 'code', 'is_active']


class SupportDivisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportDivision
        fields = ['id', 'name', 'code', 'is_active']


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ['id', 'name', 'code', 'department', 'is_active']


class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = ['id', 'name', 'code', 'section', 'is_active']


class WorkStationSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkStation
        fields = ['id', 'name', 'code', 'address', 'is_active']


class DesignationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Designation
        fields = ['id', 'name', 'code', 'is_active']
