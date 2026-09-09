from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.leave.permissions import IsSystemAdmin

from .models import Department, Section, Station, Unit
from .serializers import (
    DepartmentSerializer, SectionSerializer, StationSerializer, UnitSerializer,
)


class ReadAllWriteAdminMixin:
    """Any authenticated user may read; only SYSTEM_ADMIN may write."""

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        return [IsSystemAdmin()]


class DepartmentViewSet(ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = Department.objects.filter(deleted_at__isnull=True)
    serializer_class = DepartmentSerializer
    filterset_fields = ['is_active']


class SectionViewSet(ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = Section.objects.filter(deleted_at__isnull=True)
    serializer_class = SectionSerializer
    filterset_fields = ['department', 'is_active']


class UnitViewSet(ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = Unit.objects.filter(deleted_at__isnull=True)
    serializer_class = UnitSerializer
    filterset_fields = ['section', 'is_active']


class StationViewSet(ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = Station.objects.filter(deleted_at__isnull=True)
    serializer_class = StationSerializer
    filterset_fields = ['is_active']
