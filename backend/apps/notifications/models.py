from django.conf import settings
from django.db import models


class Notification(models.Model):
    """In-app notification for a user (e.g. 'Your leave application was approved')."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications',
        db_index=True,
    )
    message = models.CharField(max_length=500)
    is_read = models.BooleanField(default=False, db_index=True)
    related_application = models.ForeignKey(
        'leave.LeaveApplication', on_delete=models.CASCADE, null=True, blank=True,
        related_name='notifications',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read']),
        ]

    def __str__(self):
        return f'{self.user}: {self.message[:50]}'
