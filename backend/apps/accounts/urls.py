from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .mfa_views import MfaDisableView, MfaLoginVerifyView, MfaSetupView, MfaVerifySetupView
from .views import LoginView, UserViewSet

router = DefaultRouter()
router.register('users', UserViewSet, basename='user')

urlpatterns = [
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('auth/mfa/setup/', MfaSetupView.as_view(), name='auth-mfa-setup'),
    path('auth/mfa/verify-setup/', MfaVerifySetupView.as_view(), name='auth-mfa-verify-setup'),
    path('auth/mfa/disable/', MfaDisableView.as_view(), name='auth-mfa-disable'),
    path('auth/mfa/login-verify/', MfaLoginVerifyView.as_view(), name='auth-mfa-login-verify'),
    path('', include(router.urls)),
]
