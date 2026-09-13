from django.utils import timezone
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.leave.permissions import IsSystemAdmin

from .models import (
    Department, Designation, Division, Section, SupportDivision, Unit, WorkStation,
)
from .serializers import (
    DepartmentSerializer, DesignationSerializer, DivisionSerializer, SectionSerializer,
    SupportDivisionSerializer, UnitSerializer, WorkStationSerializer,
)


class ReadAllWriteAdminMixin:
    """Any authenticated user may read; only SYSTEM_ADMIN may write."""

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        return [IsSystemAdmin()]


class SoftDeleteMixin:
    """DELETE marks the record deleted/inactive instead of removing the row,
    so existing FK references (e.g. employees) aren't orphaned mid-request."""

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.is_active = False
        instance.save(update_fields=['deleted_at', 'is_active'])


class DepartmentViewSet(SoftDeleteMixin, ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = Department.objects.filter(deleted_at__isnull=True)
    serializer_class = DepartmentSerializer
    filterset_fields = ['is_active']


class DivisionViewSet(SoftDeleteMixin, ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = Division.objects.filter(deleted_at__isnull=True)
    serializer_class = DivisionSerializer
    filterset_fields = ['is_active']


class SupportDivisionViewSet(SoftDeleteMixin, ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = SupportDivision.objects.filter(deleted_at__isnull=True)
    serializer_class = SupportDivisionSerializer
    filterset_fields = ['is_active']


class SectionViewSet(SoftDeleteMixin, ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = Section.objects.filter(deleted_at__isnull=True)
    serializer_class = SectionSerializer
    filterset_fields = ['department', 'is_active']


class UnitViewSet(SoftDeleteMixin, ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = Unit.objects.filter(deleted_at__isnull=True)
    serializer_class = UnitSerializer
    filterset_fields = ['section', 'is_active']


class WorkStationViewSet(SoftDeleteMixin, ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = WorkStation.objects.filter(deleted_at__isnull=True)
    serializer_class = WorkStationSerializer
    filterset_fields = ['is_active']


class DesignationViewSet(SoftDeleteMixin, ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = Designation.objects.filter(deleted_at__isnull=True)
    serializer_class = DesignationSerializer
    filterset_fields = ['is_active']
