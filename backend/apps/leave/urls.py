from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    HolidayViewSet, LeaveApplicationViewSet, LeaveBalanceViewSet,
    LeaveTypeViewSet, WorkingDaysPreviewView,
)

router = DefaultRouter()
router.register('leave-applications', LeaveApplicationViewSet, basename='leaveapplication')
router.register('leave-types', LeaveTypeViewSet, basename='leavetype')
router.register('holidays', HolidayViewSet, basename='holiday')
router.register('leave-balances', LeaveBalanceViewSet, basename='leavebalance')

urlpatterns = [
    path('working-days-preview/', WorkingDaysPreviewView.as_view(), name='working-days-preview'),
    path('', include(router.urls)),
]
