from rest_framework import serializers

from .models import Department, Designation, Division, Section, WorkStation


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'name', 'code', 'is_active']


class DivisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Division
        fields = ['id', 'name', 'code', 'is_active']


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ['id', 'name', 'code', 'department', 'is_active']


class WorkStationSerializer(serializers.ModelSerializer):
    division_name = serializers.CharField(source='division.name', read_only=True, default=None)

    class Meta:
        model = WorkStation
        fields = ['id', 'name', 'code', 'address', 'division', 'division_name', 'is_active']


class DesignationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Designation
        fields = ['id', 'name', 'code', 'is_active']
