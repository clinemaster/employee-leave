from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """
    Immutable-by-design audit trail entry. Only created_at is tracked (no
    updated_at) — updates/deletes should never be exposed via the API; that
    enforcement lives in the backend agent's viewset (e.g. no PUT/PATCH/
    DELETE routes registered for this model).
    """
    application = models.ForeignKey(
        'leave.LeaveApplication', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='audit_logs',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='audit_logs',
    )
    role = models.CharField(max_length=32, blank=True)
    action = models.CharField(max_length=100)
    previous_status = models.CharField(max_length=32, blank=True)
    new_status = models.CharField(max_length=32, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    comments = models.TextField(blank=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['application']),
            models.Index(fields=['user']),
            models.Index(fields=['timestamp']),
        ]

    def __str__(self):
        return f'{self.action} on {self.application_id} by {self.user} @ {self.timestamp}'
