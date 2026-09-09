from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import LoginView, UserViewSet

router = DefaultRouter()
router.register('users', UserViewSet, basename='user')

urlpatterns = [
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('', include(router.urls)),
]
