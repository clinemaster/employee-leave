from django.conf import settings
from django.db import models, transaction
from django.utils import timezone


class LeaveType(models.Model):
    """Configurable/admin-manageable leave type (Annual, Sick, Maternity, etc.)."""
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class Holiday(models.Model):
    """Admin-manageable public holiday, used for working-day calculations."""
    date = models.DateField()
    name = models.CharField(max_length=255)
    is_recurring = models.BooleanField(
        default=False, help_text='Recurs every year on this month/day (e.g. Christmas).'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['date']
        constraints = [
            models.UniqueConstraint(fields=['date', 'name'], name='uniq_holiday_date_name')
        ]

    def __str__(self):
        return f'{self.name} ({self.date})'


class ApplicationStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    SUBMITTED = 'SUBMITTED', 'Submitted'
    PENDING_HOD_REVIEW = 'PENDING_HOD_REVIEW', 'Pending HOD Review'
    HOD_RECOMMENDED = 'HOD_RECOMMENDED', 'HOD Recommended'
    RETURNED_TO_EMPLOYEE = 'RETURNED_TO_EMPLOYEE', 'Returned to Employee'
    PENDING_HR_REVIEW = 'PENDING_HR_REVIEW', 'Pending HR Review'
    HR_VERIFIED = 'HR_VERIFIED', 'HR Verified'
    RETURNED_TO_HOD = 'RETURNED_TO_HOD', 'Returned to HOD'
    PENDING_AUTHORIZATION = 'PENDING_AUTHORIZATION', 'Pending Authorization'
    APPROVED = 'APPROVED', 'Approved'
    DENIED = 'DENIED', 'Denied'
    PDF_GENERATED = 'PDF_GENERATED', 'PDF Generated'
    COMPLETED = 'COMPLETED', 'Completed'
    ARCHIVED = 'ARCHIVED', 'Archived'


class LeaveRecommendation(models.Model):
    """Section B1 of the leave form: Head of Department/Section/Unit recommendation."""
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='leave_recommendations',
    )
    recommended = models.BooleanField(null=True, blank=True)
    comments = models.TextField(blank=True)

    # Plain-text signature-area placeholders (paper-form fields; no digital signature)
    signature_name = models.CharField(max_length=255, blank=True)
    signature_designation = models.CharField(max_length=255, blank=True)
    signature_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Recommendation #{self.pk}'


class LeaveHRReview(models.Model):
    """Section B2 of the leave form: HR verification of leave balance/records."""
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='leave_hr_reviews',
    )
    verified = models.BooleanField(null=True, blank=True)
    leave_balance_confirmed = models.CharField(max_length=100, blank=True)
    comments = models.TextField(blank=True)

    signature_name = models.CharField(max_length=255, blank=True)
    signature_designation = models.CharField(max_length=255, blank=True)
    signature_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'HR Review #{self.pk}'


class LeaveApproval(models.Model):
    """Section C of the leave form: final authorization decision."""
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='leave_approvals',
    )
    approved = models.BooleanField(null=True, blank=True)
    comments = models.TextField(blank=True)

    signature_name = models.CharField(max_length=255, blank=True)
    signature_designation = models.CharField(max_length=255, blank=True)
    signature_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Approval #{self.pk}'


def _current_year():
    return timezone.now().year


class LeaveApplication(models.Model):
    """
    One record spans the whole leave workflow (Sections A/B1/B2/C of the
    paper form). `status` drives the state machine; the backend agent's
    views/serializers enforce the allowed transitions.
    """

    application_number = models.CharField(max_length=32, unique=True, db_index=True, editable=False)
    status = models.CharField(
        max_length=32, choices=ApplicationStatus.choices,
        default=ApplicationStatus.DRAFT, db_index=True,
    )

    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='leave_applications',
        db_index=True,
    )

    # --- Section A: application details (as filled by the employee) ---
    vote_code = models.CharField(max_length=32, blank=True)
    sub_vote = models.CharField(max_length=32, blank=True)
    check_number = models.CharField(max_length=32, blank=True)
    personnel_file = models.CharField(max_length=64, blank=True)
    full_name = models.CharField(max_length=255, blank=True)
    designation = models.CharField(max_length=255, blank=True)
    station = models.CharField(max_length=255, blank=True)
    division_department = models.CharField(max_length=255, blank=True)
    phone_number = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    contact_address = models.CharField(max_length=255, blank=True)

    leave_type = models.ForeignKey(
        LeaveType, on_delete=models.PROTECT, related_name='applications'
    )
    leave_number = models.CharField(max_length=32, blank=True)
    travel_assistance = models.BooleanField(default=False)

    start_date = models.DateField()
    last_date = models.DateField()
    total_working_days = models.PositiveIntegerField(null=True, blank=True)

    # --- Sections B1 / B2 / C ---
    recommendation = models.OneToOneField(
        LeaveRecommendation, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='application',
    )
    hr_review = models.OneToOneField(
        LeaveHRReview, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='application',
    )
    approval = models.OneToOneField(
        LeaveApproval, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='application',
    )

    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['employee']),
            models.Index(fields=['application_number']),
        ]

    def __str__(self):
        return self.application_number or f'Draft application #{self.pk}'

    def save(self, *args, **kwargs):
        if not self.application_number:
            self.application_number = self._generate_application_number()
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_application_number():
        """
        Generates NAOT-LV-<year>-NNNNNN, sequential per calendar year.
        Wrapped in a transaction with select_for_update to avoid duplicate
        numbers under concurrent submissions.
        """
        year = _current_year()
        prefix = f'NAOT-LV-{year}-'
        with transaction.atomic():
            last = (
                LeaveApplication.objects
                .select_for_update()
                .filter(application_number__startswith=prefix)
                .order_by('-application_number')
                .first()
            )
            next_seq = 1
            if last:
                try:
                    next_seq = int(last.application_number.rsplit('-', 1)[-1]) + 1
                except ValueError:
                    next_seq = 1
            return f'{prefix}{next_seq:06d}'


class LeaveDependant(models.Model):
    """Dependant declared on a leave application (for travel/family leave)."""
    application = models.ForeignKey(
        LeaveApplication, on_delete=models.CASCADE, related_name='dependants'
    )
    name = models.CharField(max_length=255)
    relationship = models.CharField(max_length=100)
    date_of_birth = models.DateField(null=True, blank=True)

    def __str__(self):
        return f'{self.name} ({self.relationship})'


class LeavePolicy(models.Model):
    """
    Admin-configurable rule mapping a LeaveType (+ optional tenure band) to
    an annual entitlement in days (spec section 9: leave types/entitlements
    are configurable, not hardcoded).

    `min_years_of_service`/`max_years_of_service` are optional (nullable)
    bounds on the employee's tenure, in whole years, computed from
    `User.date_of_first_appointment`. A flat, non-tenure-banded policy for a
    leave type simply leaves both null. When multiple policies exist for the
    same leave type, the most specific (tenure-banded) ones should be
    ordered first via `sort_order` — matching is first-match-wins, see
    `apps/leave/entitlement.py`.
    """
    leave_type = models.ForeignKey(
        LeaveType, on_delete=models.CASCADE, related_name='policies'
    )
    min_years_of_service = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Inclusive lower bound on years of service. Leave blank for no lower bound.',
    )
    max_years_of_service = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Inclusive upper bound on years of service. Leave blank for no upper bound.',
    )
    annual_entitlement = models.DecimalField(
        max_digits=6, decimal_places=2,
        help_text='Annual leave entitlement in days granted by this rule.',
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(
        default=0,
        help_text='Lower sort_order is matched first. Put more specific (tenure-banded) rules before flat ones.',
    )
    description = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name_plural = 'Leave policies'

    def __str__(self):
        band = ''
        if self.min_years_of_service is not None or self.max_years_of_service is not None:
            band = f' [{self.min_years_of_service or 0}-{self.max_years_of_service if self.max_years_of_service is not None else "+"} yrs]'
        return f'{self.leave_type}{band}: {self.annual_entitlement} days'


class LeaveBalance(models.Model):
    """Per-employee, per-leave-type, per-period balance ledger."""
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='leave_balances'
    )
    leave_type = models.ForeignKey(
        LeaveType, on_delete=models.PROTECT, related_name='balances'
    )
    period = models.CharField(
        max_length=9, help_text='Balance period, e.g. calendar year "2026".'
    )

    opening_balance = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    entitlement = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    taken = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    pending = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    remaining = models.DecimalField(max_digits=6, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['employee', 'leave_type', 'period'],
                name='uniq_balance_per_employee_type_period',
            )
        ]
        indexes = [
            models.Index(fields=['employee', 'leave_type', 'period']),
        ]

    def __str__(self):
        return f'{self.employee} - {self.leave_type} ({self.period})'
