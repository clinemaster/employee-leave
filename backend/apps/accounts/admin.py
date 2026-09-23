from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User, UserAdditionalRole


class UserAdditionalRoleInline(admin.TabularInline):
    model = UserAdditionalRole
    extra = 0


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    inlines = [UserAdditionalRoleInline]
    list_display = (
        'username', 'full_name', 'check_number', 'role', 'department',
        'division', 'work_station', 'manager', 'is_active', 'is_staff',
    )
    list_filter = (
        'role', 'is_active', 'is_staff', 'department', 'division', 'work_station',
    )
    search_fields = ('username', 'full_name', 'check_number', 'official_email')
    fieldsets = DjangoUserAdmin.fieldsets + (
        ('NAOT Employee Details', {
            'fields': (
                'role', 'full_name', 'check_number', 'personnel_file_number',
                'place_of_domicile', 'designation', 'work_station', 'department', 'division',
                'section', 'official_email', 'date_of_first_appointment',
                'phone_number', 'manager', 'deleted_at',
            )
        }),
    )
