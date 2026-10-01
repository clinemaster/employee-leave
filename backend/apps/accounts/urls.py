from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .mfa_views import MfaLoginVerifyView
from .views import CustomRoleViewSet, LoginView, RolePermissionsView, UserViewSet

router = DefaultRouter()
router.register('users', UserViewSet, basename='user')
router.register('custom-roles', CustomRoleViewSet, basename='custom-role')

urlpatterns = [
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('auth/mfa/login-verify/', MfaLoginVerifyView.as_view(), name='auth-mfa-login-verify'),
    path('role-permissions/', RolePermissionsView.as_view(), name='role-permissions'),
    path('', include(router.urls)),
]
