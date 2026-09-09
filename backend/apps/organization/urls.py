from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DepartmentViewSet, SectionViewSet, StationViewSet, UnitViewSet

router = DefaultRouter()
router.register('departments', DepartmentViewSet, basename='department')
router.register('sections', SectionViewSet, basename='section')
router.register('units', UnitViewSet, basename='unit')
router.register('stations', StationViewSet, basename='station')

urlpatterns = [
    path('', include(router.urls)),
]
