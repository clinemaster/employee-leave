"""
Role-scoped dashboard statistics (spec: per-role dashboard summary counts).
Single GET endpoint that returns different shapes depending on the caller's
role — mirrors the role-scoped visibility already enforced by
`visible_queryset_for` for the main leave-applications list, so a user never
sees counts for applications they couldn't otherwise view.
"""
from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ApplicationStatus as S
from .models import LeaveApplication
from .permissions import (
    is_authorizing_officer, is_hod, is_hr_admin, is_system_admin,
)


def _counts(qs, status_map):
    """status_map: {output_key: status or iterable of statuses}."""
    out = {}
    for key, statuses in status_map.items():
        if isinstance(statuses, str):
            statuses = (statuses,)
        out[key] = qs.filter(status__in=statuses).count()
    return out


class DashboardStatsView(APIView):
    """GET /api/dashboard-stats/ — counts scoped to the caller's role."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        if is_system_admin(user):
            return Response(self._admin_stats())
        if is_authorizing_officer(user):
            return Response(self._ao_stats(user))
        if is_hr_admin(user):
            return Response(self._hr_stats(user))
        if is_hod(user):
            return Response(self._hod_stats(user))
        return Response(self._employee_stats(user))

    # --- Per-role scopes ---------------------------------------------------

    def _employee_stats(self, user):
        qs = LeaveApplication.objects.filter(employee=user)
        return _counts(qs, {
            'draft': S.DRAFT,
            'pending': (
                S.PENDING_HOD_REVIEW, S.HOD_RECOMMENDED, S.PENDING_HR_REVIEW,
                S.RETURNED_TO_HOD, S.PENDING_AUTHORIZATION,
            ),
            'approved': (S.APPROVED, S.PDF_GENERATED, S.COMPLETED),
            'denied': S.DENIED,
            'returned': (S.RETURNED_TO_EMPLOYEE,),
        })

    def _hod_stats(self, user):
        qs = LeaveApplication.objects.filter(employee__manager=user)
        return _counts(qs, {
            'pending_recommendation': S.PENDING_HOD_REVIEW,
            'recommended': (S.HOD_RECOMMENDED, S.PENDING_HR_REVIEW, S.RETURNED_TO_HOD),
            'returned': S.RETURNED_TO_EMPLOYEE,
            'completed': (S.APPROVED, S.PDF_GENERATED, S.COMPLETED),
        })

    def _hr_stats(self, user):
        qs = LeaveApplication.objects.all()
        return _counts(qs, {
            'pending_verification': S.PENDING_HR_REVIEW,
            'verified': (S.HR_VERIFIED, S.PENDING_AUTHORIZATION),
            'returned': S.RETURNED_TO_HOD,
            'approved': (S.APPROVED, S.PDF_GENERATED, S.COMPLETED),
            'denied': S.DENIED,
        })

    def _ao_stats(self, user):
        qs = LeaveApplication.objects.all()
        return _counts(qs, {
            'pending_authorization': S.PENDING_AUTHORIZATION,
            'approved': (S.APPROVED, S.PDF_GENERATED, S.COMPLETED),
            'denied': S.DENIED,
            'returned': S.RETURNED_TO_HOD,
        })

    def _admin_stats(self):
        qs = LeaveApplication.objects.all()
        counts = _counts(qs, {
            'draft': S.DRAFT,
            'in_progress': (
                S.PENDING_HOD_REVIEW, S.HOD_RECOMMENDED, S.RETURNED_TO_EMPLOYEE,
                S.PENDING_HR_REVIEW, S.RETURNED_TO_HOD, S.PENDING_AUTHORIZATION,
            ),
            'approved': (S.APPROVED, S.PDF_GENERATED, S.COMPLETED),
            'denied': S.DENIED,
            'archived': S.ARCHIVED,
        })

        by_leave_type = list(
            qs.values('leave_type__name')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        by_department = list(
            qs.values('employee__department__name')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        by_station = list(
            qs.values('employee__station__name')
            .annotate(count=Count('id'))
            .order_by('-count')
        )

        # Average end-to-end processing time (submission -> a terminal
        # status), in hours, for applications that have actually finished.
        terminal = qs.filter(
            status__in=(S.APPROVED, S.DENIED, S.PDF_GENERATED, S.COMPLETED, S.ARCHIVED),
            submitted_at__isnull=False,
        ).annotate(
            processing_time=ExpressionWrapper(
                F('updated_at') - F('submitted_at'), output_field=DurationField()
            )
        )
        avg_duration = terminal.aggregate(avg=Avg('processing_time'))['avg']
        avg_processing_hours = round(avg_duration.total_seconds() / 3600, 2) if avg_duration else None

        counts.update({
            'total_applications': qs.count(),
            'applications_by_leave_type': [
                {'leave_type': row['leave_type__name'], 'count': row['count']} for row in by_leave_type
            ],
            'applications_by_department': [
                {'department': row['employee__department__name'], 'count': row['count']} for row in by_department
            ],
            'applications_by_station': [
                {'station': row['employee__station__name'], 'count': row['count']} for row in by_station
            ],
            'average_processing_time_hours': avg_processing_hours,
        })
        return counts
