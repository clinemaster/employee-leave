"""
TOTP MFA endpoints (self-service only — see SECURITY.md "MFA" section):

- POST /api/auth/mfa/setup/          — generate a secret + provisioning URI (does not enable MFA)
- POST /api/auth/mfa/verify-setup/   — confirm the secret with a live code, enables MFA
- POST /api/auth/mfa/disable/        — turn MFA off (requires password re-entry)
- POST /api/auth/mfa/login-verify/   — second step of login when MFA is enabled

All four act only on the requesting user's own account (or, for
login-verify, the account named by the short-lived `mfa_token` issued at
step one of login) — there is no admin-bypass to set/clear MFA for someone
else in this phase.

Rate limiting: setup/verify-setup/disable require an authenticated user and
share the blanket authenticated-user throttle; verify-setup and
login-verify additionally use the tight `mfa_verify` ScopedRateThrottle
scope (default 5/min, see THROTTLE_RATE_MFA_VERIFY) since a 6-digit TOTP
code is brute-forceable (1e6 combinations) if unthrottled.
"""
from django.core import signing
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from . import mfa
from .models import User
from .serializers import (
    MfaDisableSerializer,
    MfaLoginVerifySerializer,
    MfaSetupResponseSerializer,
    MfaVerifySetupSerializer,
    TokenPairResponseSerializer,
    UserSerializer,
)

MFA_CHALLENGE_SALT = 'accounts.mfa.login-challenge'
MFA_CHALLENGE_MAX_AGE = 300  # seconds — the window to complete step two of login


def _issue_challenge_token(user) -> str:
    return signing.dumps({'uid': user.id}, salt=MFA_CHALLENGE_SALT)


def _resolve_challenge_token(token):
    """Returns the User for a valid, unexpired mfa_token, or None."""
    try:
        payload = signing.loads(token, salt=MFA_CHALLENGE_SALT, max_age=MFA_CHALLENGE_MAX_AGE)
    except signing.BadSignature:
        return None
    try:
        return User.objects.get(id=payload['uid'], deleted_at__isnull=True, is_active=True)
    except User.DoesNotExist:
        return None


class MfaSetupView(APIView):
    """Generates a new TOTP secret for the requesting user and stores it
    (encrypted) without enabling MFA yet — MFA only turns on once the user
    confirms possession of the authenticator app via /mfa/verify-setup/.

    Calling this again before verify-setup simply overwrites the pending
    secret (e.g. the user re-scans a fresh QR code).
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=MfaSetupResponseSerializer)
    def post(self, request):
        user = request.user
        secret = mfa.generate_secret()
        user.mfa_secret = mfa.encrypt_secret(secret)
        user.mfa_last_verified_step = None
        user.save(update_fields=['mfa_secret', 'mfa_last_verified_step'])
        return Response({
            'secret': secret,
            'provisioning_uri': mfa.provisioning_uri(secret, user.username),
        })


class MfaVerifySetupView(APIView):
    """User submits a code from their authenticator app to confirm setup
    and enable MFA. Does not touch mfa_enabled on failure."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'mfa_verify'

    @extend_schema(request=MfaVerifySetupSerializer, responses=UserSerializer)
    def post(self, request):
        serializer = MfaVerifySetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user

        plain_secret = mfa.decrypt_secret(user.mfa_secret)
        if not plain_secret:
            return Response(
                {'detail': 'No pending MFA setup — call /mfa/setup/ first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Deliberately does not consult/consume mfa_last_verified_step here:
        # that counter exists to stop a captured *login* code being replayed
        # against /mfa/login-verify/. Confirming setup is a separate action
        # from logging in, and requiring a brand-new code (skipping one that
        # was just used to confirm setup) would be confusing UX for no real
        # security benefit — the account isn't accessible via this endpoint.
        if not mfa.verify_code(plain_secret, serializer.validated_data['code']):
            return Response({'detail': 'Invalid or expired code.'}, status=status.HTTP_400_BAD_REQUEST)

        user.mfa_enabled = True
        user.save(update_fields=['mfa_enabled'])
        return Response(UserSerializer(user).data)


class MfaDisableView(APIView):
    """Requires the user's current password (defense against a hijacked,
    still-logged-in session turning MFA off silently)."""
    permission_classes = [IsAuthenticated]

    @extend_schema(request=MfaDisableSerializer, responses=UserSerializer)
    def post(self, request):
        serializer = MfaDisableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user

        if not user.check_password(serializer.validated_data['password']):
            return Response({'detail': 'Incorrect password.'}, status=status.HTTP_400_BAD_REQUEST)

        user.mfa_enabled = False
        user.mfa_secret = ''
        user.mfa_last_verified_step = None
        user.save(update_fields=['mfa_enabled', 'mfa_secret', 'mfa_last_verified_step'])
        return Response(UserSerializer(user).data)


class MfaLoginVerifyView(APIView):
    """Step two of login for an MFA-enabled user: exchange the short-lived
    `mfa_token` (from the /auth/login/ challenge response) plus a valid TOTP
    code for a real JWT pair."""
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'mfa_verify'

    @extend_schema(
        request=MfaLoginVerifySerializer,
        responses={200: TokenPairResponseSerializer, 400: OpenApiResponse(description='Invalid/expired challenge or code')},
    )
    def post(self, request):
        serializer = MfaLoginVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = _resolve_challenge_token(serializer.validated_data['mfa_token'])
        if user is None:
            return Response({'detail': 'Invalid or expired MFA challenge.'}, status=status.HTTP_400_BAD_REQUEST)

        if not user.mfa_enabled:
            # MFA was disabled between step one and step two of login.
            return Response({'detail': 'MFA is not enabled for this account.'}, status=status.HTTP_400_BAD_REQUEST)

        plain_secret = mfa.decrypt_secret(user.mfa_secret)
        step = mfa.verify_code_no_replay(plain_secret, serializer.validated_data['code'], user.mfa_last_verified_step)
        if step is None:
            return Response({'detail': 'Invalid or expired code.'}, status=status.HTTP_400_BAD_REQUEST)

        user.mfa_last_verified_step = step
        user.save(update_fields=['mfa_last_verified_step'])

        refresh = RefreshToken.for_user(user)
        full_user = User.objects.select_related(
            'department', 'division', 'work_station', 'section', 'designation',
        ).prefetch_related('additional_roles').get(pk=user.pk)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(full_user).data,
        })
