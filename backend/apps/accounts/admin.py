from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = (
        'username', 'full_name', 'check_number', 'role', 'department',
        'station', 'manager', 'is_active', 'is_staff',
    )
    list_filter = ('role', 'is_active', 'is_staff', 'department', 'station')
    search_fields = ('username', 'full_name', 'check_number', 'official_email')
    fieldsets = DjangoUserAdmin.fieldsets + (
        ('NAOT Employee Details', {
            'fields': (
                'role', 'full_name', 'check_number', 'personnel_file_number',
                'designation', 'station', 'department', 'section', 'unit',
                'official_email', 'date_of_first_appointment', 'phone_number',
                'manager', 'deleted_at',
            )
        }),
    )
