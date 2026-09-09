from django.contrib import admin

from .models import DocumentTemplate, LeaveDocument, DocumentVersion


@admin.register(DocumentTemplate)
class DocumentTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'is_active', 'updated_at')
    search_fields = ('name', 'code')
    list_filter = ('is_active',)


class DocumentVersionInline(admin.TabularInline):
    model = DocumentVersion
    extra = 0


@admin.register(LeaveDocument)
class LeaveDocumentAdmin(admin.ModelAdmin):
    list_display = ('id', 'application', 'document_type', 'template', 'generated_by', 'created_at')
    list_filter = ('document_type', 'is_active')
    search_fields = ('application__application_number',)
    inlines = [DocumentVersionInline]


@admin.register(DocumentVersion)
class DocumentVersionAdmin(admin.ModelAdmin):
    list_display = ('document', 'version_number', 'created_by', 'created_at')
