from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    EMPLOYEE = 'EMPLOYEE', 'Employee'
    HEAD_OF_DEPARTMENT = 'HEAD_OF_DEPARTMENT', 'Head of Department'
    HEAD_OF_SECTION = 'HEAD_OF_SECTION', 'Head of Section'
    HEAD_OF_UNIT = 'HEAD_OF_UNIT', 'Head of Unit'
    HR_ADMIN = 'HR_ADMIN', 'HR Admin'
    AUTHORIZING_OFFICER = 'AUTHORIZING_OFFICER', 'Authorizing Officer'
    SYSTEM_ADMIN = 'SYSTEM_ADMIN', 'System Admin'


class User(AbstractUser):
    """
    Custom user model. Extends AbstractUser (keeps username/password/email/
    is_staff/is_superuser/last_login/date_joined) and adds NAOT employee
    master-data fields plus the role used to drive workflow routing.
    """
    role = models.CharField(
        max_length=32, choices=Role.choices, default=Role.EMPLOYEE, db_index=True
    )

    full_name = models.CharField(max_length=255)
    check_number = models.CharField(max_length=32, unique=True, db_index=True)
    personnel_file_number = models.CharField(max_length=64, blank=True)
    designation = models.CharField(max_length=255, blank=True)

    station = models.ForeignKey(
        'organization.Station', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )
    department = models.ForeignKey(
        'organization.Department', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )
    section = models.ForeignKey(
        'organization.Section', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )
    unit = models.ForeignKey(
        'organization.Unit', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )

    official_email = models.EmailField(blank=True)
    date_of_first_appointment = models.DateField(null=True, blank=True)
    phone_number = models.CharField(max_length=32, blank=True)

    # Supervisor/manager used to route applications to the correct
    # Head of Department/Section/Unit for review.
    manager = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='direct_reports',
    )

    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['full_name']

    def __str__(self):
        return f'{self.full_name or self.username} ({self.check_number})'
