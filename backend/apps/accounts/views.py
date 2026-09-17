from django.contrib.auth import authenticate
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import PolymorphicProxySerializer, extend_schema
from rest_framework import filters, status, viewsets
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
        # Cheap indexed lookup (no password hashing) to see whether this
        # account even has MFA on, before paying for a hash comparison. Most
        # logins are non-MFA, so this keeps them to the single authenticate()
        # call `super().post()` already does via the token serializer instead
        # of hashing the password twice per request.
        username = request.data.get('username')
        password = request.data.get('password')
        if username and password:
            mfa_on = User.objects.filter(username=username, mfa_enabled=True).exists()
            if mfa_on:
                user = authenticate(request, username=username, password=password)
                if user is not None and user.mfa_enabled:
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
    # Mirrors NaotTokenObtainPairSerializer.validate()'s query shape — the
    # UserSerializer reads 7 FK *_name fields plus additional_roles, so
    # without this every list page is 1+8N queries.
    queryset = User.objects.filter(deleted_at__isnull=True).select_related(
        'department', 'division', 'support_division', 'work_station', 'section', 'unit', 'designation',
    ).prefetch_related('additional_roles')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = [
        'role', 'department', 'division', 'support_division', 'section', 'unit',
        'work_station', 'designation', 'is_active',
    ]
    # ?search= matches any of these (DRF SearchFilter), on top of the exact
    # filterset_fields above.
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
