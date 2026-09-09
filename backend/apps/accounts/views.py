from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.leave.permissions import IsSystemAdmin

from .models import User
from .serializers import NaotTokenObtainPairSerializer, UserSerializer, UserWriteSerializer


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/ — obtain JWT access+refresh tokens (username/password)."""
    serializer_class = NaotTokenObtainPairSerializer


class UserViewSet(viewsets.ModelViewSet):
    """
    /api/users/ — SYSTEM_ADMIN manages accounts.
    /api/users/me/ — any authenticated user reads their own profile.
    """
    queryset = User.objects.filter(deleted_at__isnull=True)
    filterset_fields = ['role', 'department', 'section', 'unit', 'station', 'is_active']
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
