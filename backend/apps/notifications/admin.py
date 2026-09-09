from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'message', 'is_read', 'related_application', 'created_at')
    list_filter = ('is_read',)
    search_fields = ('user__full_name', 'message')
