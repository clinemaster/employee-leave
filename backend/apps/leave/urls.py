from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .dashboard import DashboardStatsView
from .reports import LeaveApplicationReportView
from .views import (
    LeaveApplicationViewSet, LeaveBalanceViewSet,
    LeavePolicyViewSet, LeaveTypeViewSet, PersonTypeViewSet, TravelPaymentSettingsView,
    WorkingDaysPreviewView,
)

router = DefaultRouter()
router.register('leave-applications', LeaveApplicationViewSet, basename='leaveapplication')
router.register('leave-types', LeaveTypeViewSet, basename='leavetype')
router.register('person-types', PersonTypeViewSet, basename='persontype')
router.register('leave-balances', LeaveBalanceViewSet, basename='leavebalance')
router.register('leave-policies', LeavePolicyViewSet, basename='leavepolicy')

urlpatterns = [
    path('working-days-preview/', WorkingDaysPreviewView.as_view(), name='working-days-preview'),
    path('travel-payment-settings/', TravelPaymentSettingsView.as_view(), name='travel-payment-settings'),
    path('dashboard-stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('reports/leave-applications/', LeaveApplicationReportView.as_view(), name='report-leave-applications'),
    path('', include(router.urls)),
]
