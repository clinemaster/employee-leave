from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    DepartmentViewSet, DesignationViewSet, DivisionViewSet, SectionViewSet,
    WorkStationViewSet,
)

router = DefaultRouter()
router.register('departments', DepartmentViewSet, basename='department')
router.register('divisions', DivisionViewSet, basename='division')
router.register('sections', SectionViewSet, basename='section')
router.register('work-stations', WorkStationViewSet, basename='work-station')
router.register('designations', DesignationViewSet, basename='designation')

urlpatterns = [
    path('', include(router.urls)),
]
