from django.contrib import admin

from .models import (
    LeaveType, Holiday, LeaveApplication, LeaveDependant,
    LeaveRecommendation, LeaveHRReview, LeaveApproval, LeaveBalance,
    LeavePolicy,
)


@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'is_active', 'sort_order')
    search_fields = ('name', 'code')
    list_filter = ('is_active',)


@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ('name', 'date', 'is_recurring')
    list_filter = ('is_recurring',)
    search_fields = ('name',)


class LeaveDependantInline(admin.TabularInline):
    model = LeaveDependant
    extra = 0


@admin.register(LeaveApplication)
class LeaveApplicationAdmin(admin.ModelAdmin):
    list_display = (
        'application_number', 'employee', 'leave_type', 'status',
        'start_date', 'last_date', 'total_working_days', 'created_at',
    )
    list_filter = ('status', 'leave_type', 'travel_assistance')
    search_fields = (
        'application_number', 'employee__full_name', 'employee__check_number',
        'full_name', 'check_number',
    )
    readonly_fields = ('application_number', 'created_at', 'updated_at')
    inlines = [LeaveDependantInline]
    date_hierarchy = 'created_at'


@admin.register(LeaveRecommendation)
class LeaveRecommendationAdmin(admin.ModelAdmin):
    list_display = ('id', 'reviewer', 'recommended', 'signature_date')


@admin.register(LeaveHRReview)
class LeaveHRReviewAdmin(admin.ModelAdmin):
    list_display = ('id', 'reviewer', 'verified', 'signature_date')


@admin.register(LeaveApproval)
class LeaveApprovalAdmin(admin.ModelAdmin):
    list_display = ('id', 'reviewer', 'approved', 'signature_date')


@admin.register(LeavePolicy)
class LeavePolicyAdmin(admin.ModelAdmin):
    list_display = (
        'leave_type', 'min_years_of_service', 'max_years_of_service',
        'annual_entitlement', 'is_active', 'sort_order',
    )
    list_filter = ('leave_type', 'is_active')
    ordering = ('leave_type', 'sort_order')


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = (
        'employee', 'leave_type', 'period', 'opening_balance',
        'entitlement', 'taken', 'pending', 'remaining',
    )
    list_filter = ('leave_type', 'period')
    search_fields = ('employee__full_name', 'employee__check_number')
