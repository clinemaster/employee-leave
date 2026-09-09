from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = (
        'timestamp', 'application', 'user', 'role', 'action',
        'previous_status', 'new_status', 'ip_address',
    )
    list_filter = ('action', 'role')
    search_fields = ('application__application_number', 'user__full_name', 'action')
    readonly_fields = [f.name for f in AuditLog._meta.fields]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
