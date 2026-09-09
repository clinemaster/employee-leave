from django.conf import settings
from django.db import models


class DocumentTemplate(models.Model):
    """
    Admin-manageable template used to render leave PDFs/forms. Actual
    rendering is the backend agent's job; this just stores the template
    metadata/content reference.
    """
    name = models.CharField(max_length=255, unique=True)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    template_file = models.FileField(upload_to='document_templates/', blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class LeaveDocument(models.Model):
    """A generated document (e.g. the leave application PDF) tied to an application."""

    class DocumentType(models.TextChoices):
        LEAVE_FORM_PDF = 'LEAVE_FORM_PDF', 'Leave Form PDF'
        SUPPORTING_ATTACHMENT = 'SUPPORTING_ATTACHMENT', 'Supporting Attachment'
        OTHER = 'OTHER', 'Other'

    application = models.ForeignKey(
        'leave.LeaveApplication', on_delete=models.CASCADE, related_name='documents'
    )
    template = models.ForeignKey(
        DocumentTemplate, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='documents',
    )
    document_type = models.CharField(
        max_length=32, choices=DocumentType.choices, default=DocumentType.LEAVE_FORM_PDF
    )
    file = models.FileField(upload_to='leave_documents/', blank=True, null=True)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='generated_documents',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_document_type_display()} for {self.application_id}'


class DocumentVersion(models.Model):
    """Version history for a LeaveDocument (e.g. regenerated after a correction)."""
    document = models.ForeignKey(
        LeaveDocument, on_delete=models.CASCADE, related_name='versions'
    )
    version_number = models.PositiveIntegerField()
    file = models.FileField(upload_to='document_versions/', blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='document_versions',
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['document', '-version_number']
        constraints = [
            models.UniqueConstraint(
                fields=['document', 'version_number'], name='uniq_version_per_document'
            )
        ]

    def __str__(self):
        return f'{self.document} v{self.version_number}'
