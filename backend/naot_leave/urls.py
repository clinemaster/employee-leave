"""
naot_leave URL Configuration.

The backend agent owns the REST API routing (views/serializers). This file
only wires up the Django admin for now; add `path('api/', include(...))`
entries here as the backend agent builds out apps.accounts.urls etc.
"""
from django.contrib import admin
from django.urls import path

urlpatterns = [
    path('admin/', admin.site.urls),
]
