from django.contrib.auth import authenticate
from drf_spectacular.utils import PolymorphicProxySerializer, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.leave.permissions import IsSystemAdmin

from .mfa_views import _issue_challenge_token
from .models import User
from .serializers import (
    MfaChallengeResponseSerializer,
    NaotTokenObtainPairSerializer,
    TokenPairResponseSerializer,
    UserSerializer,
    UserWriteSerializer,
)


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/ — obtain JWT access+refresh tokens (username/password).

    Throttled tightly (default 5/min per IP, see THROTTLE_RATE_LOGIN) as
    brute-force / credential-stuffing protection — this is the one endpoint
    every unauthenticated attacker can hit repeatedly.

    MFA (opt-in per user, see apps.accounts.mfa_views): if the user has
    `mfa_enabled=True`, credentials alone are not enough — this returns a
    partial challenge response (`{"mfa_required": true, "mfa_token": "..."}`,
    no JWT pair) instead of calling into the normal token-issuing serializer.
    The client then calls POST /api/auth/mfa/login-verify/ with that token
    plus a TOTP code to get the real access/refresh pair.
    """
    serializer_class = NaotTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    @extend_schema(
        responses={200: PolymorphicProxySerializer(
            component_name='LoginResponse',
            serializers=[TokenPairResponseSerializer, MfaChallengeResponseSerializer],
            resource_type_field_name=None,
        )},
    )
    def post(self, request, *args, **kwargs):
        username = request.data.get('username')
        password = request.data.get('password')
        if username and password:
            user = authenticate(request, username=username, password=password)
            if user is not None and getattr(user, 'mfa_enabled', False):
                return Response({
                    'mfa_required': True,
                    'mfa_token': _issue_challenge_token(user),
                }, status=status.HTTP_200_OK)
        return super().post(request, *args, **kwargs)


class UserViewSet(viewsets.ModelViewSet):
    """
    /api/users/ — SYSTEM_ADMIN manages accounts.
    /api/users/me/ — any authenticated user reads their own profile.
    """
    queryset = User.objects.filter(deleted_at__isnull=True)
    filterset_fields = [
        'role', 'department', 'division', 'support_division', 'section', 'unit',
        'work_station', 'designation', 'is_active',
    ]
    search_fields = ['full_name', 'username', 'check_number', 'email']

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return UserWriteSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action == 'me':
            return [IsAuthenticated()]
        return [IsSystemAdmin()]

    @action(detail=False, methods=['get'], url_path='me')
    def me(self, request):
        return Response(UserSerializer(request.user).data)
