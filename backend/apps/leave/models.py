from decimal import Decimal

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


class ApplicationStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    SUBMITTED = 'SUBMITTED', 'Submitted'
    PENDING_HOD_REVIEW = 'PENDING_HOD_REVIEW', 'Pending HOD Review'
    HOD_RECOMMENDED = 'HOD_RECOMMENDED', 'HOD Recommended'
    PENDING_CAG_REVIEW = 'PENDING_CAG_REVIEW', 'Pending CAG Review'
    CAG_RECOMMENDED = 'CAG_RECOMMENDED', 'CAG Recommended'
    PENDING_AAG_REVIEW = 'PENDING_AAG_REVIEW', 'Pending AAG Review'
    AAG_RECOMMENDED = 'AAG_RECOMMENDED', 'AAG Recommended'
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


# Maps a workflow `status` to the human-facing "Current Location"/short
# status label. Module-level (not a stored field) so both
# LeaveApplication.current_location and the audit-trail serializer (which
# needs to label each transition's previous/new status the same way) share
# one source of truth — see requirements doc "Current Location must be
# derived from the workflow state, not stored as an independently editable
# field".
LOCATION_BY_STATUS = {
    ApplicationStatus.DRAFT: 'Employee',
    ApplicationStatus.SUBMITTED: 'HOD',
    ApplicationStatus.PENDING_HOD_REVIEW: 'HOD',
    ApplicationStatus.HOD_RECOMMENDED: 'HR',
    ApplicationStatus.PENDING_CAG_REVIEW: 'CAG',
    ApplicationStatus.CAG_RECOMMENDED: 'HR',
    ApplicationStatus.PENDING_AAG_REVIEW: 'AAG',
    ApplicationStatus.AAG_RECOMMENDED: 'HR',
    ApplicationStatus.RETURNED_TO_EMPLOYEE: 'Employee — Action Required',
    ApplicationStatus.PENDING_HR_REVIEW: 'HR',
    ApplicationStatus.HR_VERIFIED: 'Authorizing Officer',
    ApplicationStatus.RETURNED_TO_HOD: 'HOD — Action Required',
    ApplicationStatus.PENDING_AUTHORIZATION: 'Authorizing Officer',
    ApplicationStatus.APPROVED: 'Completed',
    ApplicationStatus.DENIED: 'Completed',
    ApplicationStatus.PDF_GENERATED: 'Completed',
    ApplicationStatus.COMPLETED: 'Completed',
    ApplicationStatus.ARCHIVED: 'Completed',
}

STATUS_LABEL_BY_STATUS = {
    ApplicationStatus.DRAFT: 'Draft',
    ApplicationStatus.SUBMITTED: 'Under Review',
    ApplicationStatus.PENDING_HOD_REVIEW: 'Under Review',
    ApplicationStatus.HOD_RECOMMENDED: 'Under Review',
    ApplicationStatus.PENDING_CAG_REVIEW: 'Under Review',
    ApplicationStatus.CAG_RECOMMENDED: 'Under Review',
    ApplicationStatus.PENDING_AAG_REVIEW: 'Under Review',
    ApplicationStatus.AAG_RECOMMENDED: 'Under Review',
    ApplicationStatus.RETURNED_TO_EMPLOYEE: 'Returned',
    ApplicationStatus.PENDING_HR_REVIEW: 'Under Review',
    ApplicationStatus.HR_VERIFIED: 'Under Review',
    ApplicationStatus.RETURNED_TO_HOD: 'Returned',
    ApplicationStatus.PENDING_AUTHORIZATION: 'Awaiting Authorization',
    ApplicationStatus.APPROVED: 'Approved',
    ApplicationStatus.DENIED: 'Rejected',
    ApplicationStatus.PDF_GENERATED: 'Approved',
    ApplicationStatus.COMPLETED: 'Approved',
    ApplicationStatus.ARCHIVED: 'Approved',
}


class LeaveRecommendation(models.Model):
    """Section B1 of the leave form: Head of Department/Section recommendation."""
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


class LeaveCAGReview(models.Model):
    """
    CAG review stage: mandatory for applicants holding one of
    accounts.models.CAG_APPLICANT_ROLES, standing in for Section B1 (HOD
    recommendation) for those roles. See apps.leave.workflow for routing.
    """
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='leave_cag_reviews',
    )
    recommended = models.BooleanField(null=True, blank=True)
    comments = models.TextField(blank=True)

    signature_name = models.CharField(max_length=255, blank=True)
    signature_designation = models.CharField(max_length=255, blank=True)
    signature_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'CAG Review #{self.pk}'


class LeaveAAGReview(models.Model):
    """
    AAG review stage: mandatory for employees who belong to a Division and
    whose role does not itself require CAG review (see
    apps.leave.permissions.needs_aag_review) -- standing in for Section B1
    (line-manager recommendation) for those employees, matched to the AAG
    assigned to their specific division. See apps.leave.workflow for routing.
    """
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='leave_aag_reviews',
    )
    recommended = models.BooleanField(null=True, blank=True)
    comments = models.TextField(blank=True)

    signature_name = models.CharField(max_length=255, blank=True)
    signature_designation = models.CharField(max_length=255, blank=True)
    signature_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'AAG Review #{self.pk}'


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
    cag_review = models.OneToOneField(
        LeaveCAGReview, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='application',
    )
    aag_review = models.OneToOneField(
        LeaveAAGReview, on_delete=models.SET_NULL, null=True, blank=True,
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

    # --- Current location / status label (derived, read-only) -------------
    # Deliberately NOT a stored field: it must always be an exact function of
    # `status` so nobody can set it independently of the workflow (see
    # requirements doc "Current Location must be derived from the workflow
    # state, not stored as an independently editable field").
    @property
    def current_location(self):
        return LOCATION_BY_STATUS.get(self.status, self.status)

    @property
    def current_status_label(self):
        return STATUS_LABEL_BY_STATUS.get(self.status, self.status)

    @property
    def requires_cag_review(self):
        """
        True if this applicant's role routes through CAG review instead of
        the normal HOD stage (see apps.leave.permissions.needs_cag_review).
        Derived from the employee's role, never stored, so it can't drift
        from the routing rule itself.
        """
        from .permissions import needs_cag_review
        return needs_cag_review(self.employee)

    @property
    def requires_aag_review(self):
        """
        True if this applicant belongs to a Division and doesn't already
        require CAG review (see apps.leave.permissions.needs_aag_review) --
        CAG takes priority, so a Division employee whose role also requires
        CAG review still follows the CAG track, never both.
        """
        from .permissions import needs_aag_review
        return needs_aag_review(self.employee)

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

    # --- Travel payment request (JEDWALI 1) computed totals ---------------
    # Grand totals for the "JEDWALI 1: MCHANGANUO WA MAOMBI YA MALIPO" travel
    # payment breakdown. Never stored — always summed live from the nested
    # travel_routes/taxi_expenses/mizigo_items rows, to avoid drift.

    @property
    def naule_grand_total(self):
        return sum((route.naule_total for route in self.travel_routes.all()), Decimal('0'))

    @property
    def taxi_grand_total(self):
        return sum((expense.total for expense in self.taxi_expenses.all()), Decimal('0'))

    @property
    def mizigo_grand_total(self):
        return sum((item.total for item in self.mizigo_items.all()), Decimal('0'))

    @property
    def travel_payment_grand_total(self):
        """JUMLA KUU: NAULI + TAXI + MIZIGO grand total."""
        return self.naule_grand_total + self.taxi_grand_total + self.mizigo_grand_total


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


class PersonType(models.Model):
    """
    Configurable/admin-manageable catalog of traveler/person categories used
    on the "JEDWALI 1: MCHANGANUO WA MAOMBI YA MALIPO" travel payment
    breakdown (Wahusika). Copy of LeaveType's shape — same CRUD/reorder
    pattern applies (see PersonTypeViewSet).
    """
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


class TravelRoute(models.Model):
    """
    One NAULI (fare) route row of the travel payment breakdown (Section A /
    JEDWALI 1-A). `fare_per_person` is charged once per ONE_WAY trip or
    twice per ROUND_TRIP (see `trips`).
    """

    class TripType(models.TextChoices):
        ONE_WAY = 'ONE_WAY', 'One Way'
        ROUND_TRIP = 'ROUND_TRIP', 'Round Trip'

    application = models.ForeignKey(
        LeaveApplication, on_delete=models.CASCADE, related_name='travel_routes'
    )
    from_place = models.CharField(max_length=255)
    to_place = models.CharField(max_length=255)
    fare_per_person = models.DecimalField(max_digits=12, decimal_places=2)
    trip_type = models.CharField(max_length=16, choices=TripType.choices, default=TripType.ONE_WAY)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.from_place} -> {self.to_place}'

    @property
    def trips(self):
        """Number of fare charges per person: 1 for one-way, 2 for round-trip.
        Never stored — always derived from trip_type to avoid drift."""
        return 2 if self.trip_type == self.TripType.ROUND_TRIP else 1

    @property
    def naule_total(self):
        """Sum of this route's passenger totals (NAULI subtotal for this row)."""
        return sum((p.total for p in self.passengers.all()), Decimal('0'))


class TravelRoutePassenger(models.Model):
    """One Wahusika (person type) row within a TravelRoute, with Idadi (count)."""
    route = models.ForeignKey(TravelRoute, on_delete=models.CASCADE, related_name='passengers')
    person_type = models.ForeignKey(PersonType, on_delete=models.PROTECT, related_name='travel_route_passengers')
    idadi = models.PositiveIntegerField()

    def __str__(self):
        return f'{self.person_type} x{self.idadi}'

    @property
    def total(self):
        return self.route.fare_per_person * self.idadi * self.route.trips


class TaxiExpense(models.Model):
    """One TAXI row of the travel payment breakdown (JEDWALI 1-B)."""
    application = models.ForeignKey(
        LeaveApplication, on_delete=models.CASCADE, related_name='taxi_expenses'
    )
    description = models.CharField(max_length=255, blank=True)
    number_of_trips = models.PositiveIntegerField()
    cost_per_trip = models.DecimalField(max_digits=12, decimal_places=2)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']

    def __str__(self):
        return self.description or f'Taxi expense #{self.pk}'

    @property
    def total(self):
        return self.number_of_trips * self.cost_per_trip


class MizigoItem(models.Model):
    """One MIZIGO (luggage) row of the travel payment breakdown (JEDWALI 1-C)."""
    application = models.ForeignKey(
        LeaveApplication, on_delete=models.CASCADE, related_name='mizigo_items'
    )
    description = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']

    def __str__(self):
        return self.description

    @property
    def total(self):
        return self.quantity * self.unit_cost


class LeavePolicy(models.Model):
    """
    Admin-configurable rule mapping a LeaveType (+ optional tenure band) to
    an annual entitlement in days (spec section 9: leave types/entitlements
    are configurable, not hardcoded).

    `min_years_of_service`/`max_years_of_service` are optional (nullable)
    bounds on the employee's tenure, in whole years, computed from
    `User.date_of_first_appointment`. A flat, non-tenure-banded policy for a
    leave type simply leaves both null. `designation` is an optional
    (blank) free-text match against `accounts.User.designation`
    (case-insensitive exact match); blank means the policy applies to any
    designation. When multiple policies could match the same employee, the
    most specific one wins (see `apps/leave/entitlement.py:_specificity`) —
    a policy matching both designation and tenure band beats one matching
    only tenure, which beats a flat/default rule; `sort_order` is only the
    tiebreaker within equal specificity.
    """
    leave_type = models.ForeignKey(
        LeaveType, on_delete=models.CASCADE, related_name='policies'
    )
    designation = models.CharField(
        max_length=255, blank=True,
        help_text=(
            'Optional job grade/designation this rule applies to (matched '
            'case-insensitively against the employee\'s designation). '
            'Leave blank to apply to all designations.'
        ),
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
        desig = f' ({self.designation})' if self.designation else ''
        return f'{self.leave_type}{desig}{band}: {self.annual_entitlement} days'


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
        ordering = ['-period', 'employee_id', 'leave_type_id']
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
