from django.contrib import admin

from .models import Department, Section, Unit, Station


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'is_active', 'created_at')
    search_fields = ('name', 'code')
    list_filter = ('is_active',)


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'department', 'is_active')
    search_fields = ('name', 'code')
    list_filter = ('is_active', 'department')


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'section', 'is_active')
    search_fields = ('name', 'code')
    list_filter = ('is_active', 'section')


@admin.register(Station)
class StationAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'is_active')
    search_fields = ('name', 'code')
    list_filter = ('is_active',)
