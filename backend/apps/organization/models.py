from django.db import models


class TimeStampedSoftDeleteModel(models.Model):
    """Shared abstract base: created/updated timestamps + soft-delete."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True


class Department(TimeStampedSoftDeleteModel):
    """Top-level organizational unit (e.g. a Directorate/Department)."""
    name = models.CharField(max_length=255, unique=True)
    code = models.CharField(max_length=32, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Division(TimeStampedSoftDeleteModel):
    """Top-level organizational unit, parallel to Department, for staff who
    belong to a Division rather than a Department."""
    name = models.CharField(max_length=255, unique=True)
    code = models.CharField(max_length=32, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Section(TimeStampedSoftDeleteModel):
    """A Section belongs to a Department."""
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=32)
    department = models.ForeignKey(
        Department, on_delete=models.PROTECT, related_name='sections'
    )

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['department', 'code'], name='uniq_section_code_per_department'
            )
        ]

    def __str__(self):
        return f'{self.name} ({self.department.name})'


class WorkStation(TimeStampedSoftDeleteModel):
    """Physical duty station (e.g. a regional office) -- every employee belongs to one."""
    name = models.CharField(max_length=255, unique=True)
    code = models.CharField(max_length=32, unique=True)
    address = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Designation(TimeStampedSoftDeleteModel):
    """A job title/grade (e.g. Auditor General, Clerk) that a User may hold."""
    name = models.CharField(max_length=255, unique=True)
    code = models.CharField(max_length=32, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name
