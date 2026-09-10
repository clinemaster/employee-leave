"""
naot_leave URL Configuration.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.permissions import AllowAny
from drf_spectacular.views import (
    SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView,
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('apps.accounts.urls')),
    path('api/', include('apps.organization.urls')),
    path('api/', include('apps.leave.urls')),
    path('api/', include('apps.notifications.urls')),

    # OpenAPI schema + interactive docs. /api/docs/ is Swagger UI (the one
    # most people mean by "Swagger docs"); /api/redoc/ is an alternative
    # read-only reference view some find easier to navigate. Explicitly
    # public (AllowAny): these describe endpoint shapes only, no data, and
    # requiring a login just to read API docs is poor DX. Reconsider if the
    # schema itself is ever judged sensitive for this deployment.
    path('api/schema/', SpectacularAPIView.as_view(permission_classes=[AllowAny]), name='schema'),
    path(
        'api/docs/',
        SpectacularSwaggerView.as_view(url_name='schema', permission_classes=[AllowAny]),
        name='swagger-ui',
    ),
    path(
        'api/redoc/',
        SpectacularRedocView.as_view(url_name='schema', permission_classes=[AllowAny]),
        name='redoc',
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
