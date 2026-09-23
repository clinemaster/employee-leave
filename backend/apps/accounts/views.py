from django.contrib.auth import authenticate
from django.db import transaction
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import PolymorphicProxySerializer, extend_schema
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.leave.permissions import CanManageUsers, IsSystemAdmin

from .mfa_views import _issue_challenge_token
from .models import (
    ROLE_DISPLAY_NAMES, CustomRole, Permission, Role, RolePermission, User, role_values,
)
from .serializers import (
    CustomRoleSerializer,
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
        'department', 'division', 'work_station', 'section', 'designation',
    ).prefetch_related('additional_roles')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = [
        'role', 'department', 'division', 'section',
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
        return [CanManageUsers()]

    @action(detail=False, methods=['get'], url_path='me')
    def me(self, request):
        return Response(UserSerializer(request.user).data)


class RolePermissionsView(APIView):
    """
    GET/PUT /api/role-permissions/ — the "Roles" page: lets SYSTEM_ADMIN
    attach/detach coarse permissions (see accounts.models.Permission) to
    each role, enforced dynamically wherever a workflow action or admin
    capability is gated (see apps.leave.permissions.HasPermission and its
    CanManage*/CanViewReports subclasses, and the extra role_has_permission
    checks in apps.leave.workflow._check_role_for_action).

    Deliberately gated on `IsSystemAdmin` itself rather than a dynamic
    permission — this endpoint configures the permission system, so gating
    it dynamically would let a role grant itself more power (privilege
    escalation).
    """
    permission_classes = [IsSystemAdmin]

    def get(self, request):
        roles = [
            {'code': code, 'label': label, 'display_name': ROLE_DISPLAY_NAMES.get(code, label)}
            for code, label in Role.choices
        ] + [
            {'code': cr.code, 'label': cr.display_name, 'display_name': cr.display_name}
            for cr in CustomRole.objects.all()
        ]
        matrix = {r['code']: [] for r in roles}
        for role, permission in RolePermission.objects.values_list('role', 'permission'):
            matrix.setdefault(role, []).append(permission)
        return Response({
            'roles': roles,
            'permissions': [{'code': code, 'label': label} for code, label in Permission.choices],
            'matrix': matrix,
        })

    def put(self, request):
        """Body: {"role": "HR_ADMIN", "permissions": ["VERIFY_LEAVE", ...]}.
        Fully replaces that role's permission set (not merged)."""
        role = request.data.get('role')
        new_permissions = request.data.get('permissions')
        if role not in role_values():
            raise ValidationError({'role': 'Invalid role.'})
        if role == Role.SYSTEM_ADMIN:
            raise ValidationError({'role': 'SYSTEM_ADMIN permissions cannot be changed.'})
        if not isinstance(new_permissions, list) or any(p not in Permission.values for p in new_permissions):
            raise ValidationError({'permissions': 'Must be a list of valid permission codes.'})

        with transaction.atomic():
            RolePermission.objects.filter(role=role).exclude(permission__in=new_permissions).delete()
            existing = set(RolePermission.objects.filter(role=role).values_list('permission', flat=True))
            RolePermission.objects.bulk_create([
                RolePermission(role=role, permission=p) for p in new_permissions if p not in existing
            ])
        return self.get(request)


class CustomRoleViewSet(viewsets.ModelViewSet):
    """
    GET|POST /api/custom-roles/, GET|DELETE /api/custom-roles/{id}/ — the
    "Add Role" action on the Roles page. SYSTEM_ADMIN only. A newly created
    role behaves as a plain permission-holder (see accounts.models.CustomRole
    for what it does and doesn't get); permissions are attached separately
    via RolePermissionsView, same as for a built-in role. PUT/PATCH are
    deliberately unsupported (a role's `code` is the identity other rows
    reference by string — renaming it would silently orphan them; delete and
    recreate instead).
    """
    queryset = CustomRole.objects.all()
    serializer_class = CustomRoleSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']
    permission_classes = [IsSystemAdmin]

    def perform_destroy(self, instance):
        in_use = (
            User.objects.filter(role=instance.code).exists()
            or User.objects.filter(additional_roles__role=instance.code).exists()
        )
        if in_use:
            raise ValidationError(
                'This role is currently assigned to one or more users — reassign them before deleting it.'
            )
        RolePermission.objects.filter(role=instance.code).delete()
        instance.delete()
