from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .dashboard import DashboardStatsView
from .reports import LeaveApplicationReportView
from .views import (
    HolidayViewSet, LeaveApplicationViewSet, LeaveBalanceViewSet,
    LeavePolicyViewSet, LeaveTypeViewSet, WorkingDaysPreviewView,
)

router = DefaultRouter()
router.register('leave-applications', LeaveApplicationViewSet, basename='leaveapplication')
router.register('leave-types', LeaveTypeViewSet, basename='leavetype')
router.register('holidays', HolidayViewSet, basename='holiday')
router.register('leave-balances', LeaveBalanceViewSet, basename='leavebalance')
router.register('leave-policies', LeavePolicyViewSet, basename='leavepolicy')

urlpatterns = [
    path('working-days-preview/', WorkingDaysPreviewView.as_view(), name='working-days-preview'),
    path('dashboard-stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('reports/leave-applications/', LeaveApplicationReportView.as_view(), name='report-leave-applications'),
    path('', include(router.urls)),
]
