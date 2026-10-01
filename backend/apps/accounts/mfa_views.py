"""
TOTP MFA login endpoint (see SECURITY.md "MFA" section):

- POST /api/auth/mfa/login-verify/   — second step of login when MFA is enabled

Acts only on the account named by the short-lived `mfa_token` issued at
step one of login. The self-service setup/verify-setup/disable endpoints
have been removed, so there is no in-app way to enable or disable MFA.

Rate limiting: login-verify uses the tight `mfa_verify` ScopedRateThrottle
scope (default 5/min, see THROTTLE_RATE_MFA_VERIFY) since a 6-digit TOTP
code is brute-forceable (1e6 combinations) if unthrottled.
"""
from django.core import signing
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from . import mfa
from .models import User
from .serializers import (
    MfaLoginVerifySerializer,
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
