from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .entitlement import compute_entitlement
from .models import (
    LeaveApplication, LeaveApproval, LeaveBalance, LeaveCAGReview,
    LeaveDependant, LeaveHRReview, LeavePolicy, LeaveRecommendation, LeaveType,
    MizigoItem, PersonType, TaxiExpense, TravelRoute, TravelRoutePassenger,
)
from .workingdays import calculate_working_days


class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = ['id', 'name', 'code', 'is_active', 'sort_order']


class PersonTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonType
        fields = ['id', 'name', 'code', 'is_active', 'sort_order']


class LeaveDependantSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveDependant
        fields = ['id', 'name', 'relationship', 'date_of_birth']


class LeaveRecommendationSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveRecommendation
        fields = [
            'id', 'reviewer', 'recommended', 'comments',
            'signature_name', 'signature_designation', 'signature_date',
        ]
        read_only_fields = ['id', 'reviewer']


class LeaveCAGReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveCAGReview
        fields = [
            'id', 'reviewer', 'recommended', 'comments',
            'signature_name', 'signature_designation', 'signature_date',
        ]
        read_only_fields = ['id', 'reviewer']


class LeaveHRReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveHRReview
        fields = [
            'id', 'reviewer', 'verified', 'leave_balance_confirmed', 'comments',
            'signature_name', 'signature_designation', 'signature_date',
        ]
        read_only_fields = ['id', 'reviewer']


class LeaveApprovalSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveApproval
        fields = [
            'id', 'reviewer', 'approved', 'comments',
            'signature_name', 'signature_designation', 'signature_date',
        ]
        read_only_fields = ['id', 'reviewer']


class TravelRoutePassengerSerializer(serializers.ModelSerializer):
    """Read/write serializer for one Wahusika (person type) row on a TravelRoute."""
    person_type_name = serializers.CharField(source='person_type.name', read_only=True)
    total = serializers.SerializerMethodField()

    class Meta:
        model = TravelRoutePassenger
        fields = ['id', 'person_type', 'person_type_name', 'idadi', 'total']
        read_only_fields = ['id']

    @extend_schema_field(OpenApiTypes.DECIMAL)
    def get_total(self, obj):
        return obj.total


class TravelRouteSerializer(serializers.ModelSerializer):
    """Read/write serializer for one NAULI route row, nested with its passengers."""
    passengers = TravelRoutePassengerSerializer(many=True, required=False)
    trips = serializers.ReadOnlyField()
    naule_total = serializers.SerializerMethodField()

    class Meta:
        model = TravelRoute
        fields = [
            'id', 'from_place', 'to_place', 'fare_per_person', 'trip_type',
            'sort_order', 'trips', 'naule_total', 'passengers',
        ]
        read_only_fields = ['id']

    @extend_schema_field(OpenApiTypes.DECIMAL)
    def get_naule_total(self, obj):
        return obj.naule_total


class TaxiExpenseSerializer(serializers.ModelSerializer):
    total = serializers.SerializerMethodField()

    class Meta:
        model = TaxiExpense
        fields = ['id', 'description', 'number_of_trips', 'cost_per_trip', 'sort_order', 'total']
        read_only_fields = ['id']

    @extend_schema_field(OpenApiTypes.DECIMAL)
    def get_total(self, obj):
        return obj.total


class MizigoItemSerializer(serializers.ModelSerializer):
    total = serializers.SerializerMethodField()

    class Meta:
        model = MizigoItem
        fields = ['id', 'description', 'quantity', 'unit_cost', 'sort_order', 'total']
        read_only_fields = ['id']

    @extend_schema_field(OpenApiTypes.DECIMAL)
    def get_total(self, obj):
        return obj.total


class LeaveApplicationSerializer(serializers.ModelSerializer):
    """Read serializer — full nested view of an application (all sections)."""
    dependants = LeaveDependantSerializer(many=True, read_only=True)
    recommendation = LeaveRecommendationSerializer(read_only=True)
    cag_review = LeaveCAGReviewSerializer(read_only=True)
    hr_review = LeaveHRReviewSerializer(read_only=True)
    approval = LeaveApprovalSerializer(read_only=True)
    leave_type_name = serializers.CharField(source='leave_type.name', read_only=True)
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    working_days_preview = serializers.SerializerMethodField()
    # Derived from `status` (see LeaveApplication.current_location/
    # current_status_label) — never independently settable, so no write path
    # exists for either of these.
    current_location = serializers.CharField(read_only=True)
    current_status_label = serializers.CharField(read_only=True)
    # Derived from the employee's role (see LeaveApplication.requires_cag_review)
    # — tells the frontend whether to show the CAG stage in the stepper.
    requires_cag_review = serializers.BooleanField(read_only=True)

    # Travel payment request (JEDWALI 1)
    travel_routes = TravelRouteSerializer(many=True, read_only=True)
    taxi_expenses = TaxiExpenseSerializer(many=True, read_only=True)
    mizigo_items = MizigoItemSerializer(many=True, read_only=True)
    naule_grand_total = serializers.SerializerMethodField()
    taxi_grand_total = serializers.SerializerMethodField()
    mizigo_grand_total = serializers.SerializerMethodField()
    travel_payment_grand_total = serializers.SerializerMethodField()

    class Meta:
        model = LeaveApplication
        fields = [
            'id', 'application_number', 'status', 'current_location', 'current_status_label',
            'requires_cag_review',
            'employee', 'employee_name',
            'vote_code', 'sub_vote', 'check_number', 'personnel_file', 'full_name',
            'designation', 'station', 'division_department', 'phone_number', 'email',
            'contact_address', 'leave_type', 'leave_type_name', 'leave_number',
            'travel_assistance', 'start_date', 'last_date', 'total_working_days',
            'working_days_preview', 'dependants', 'recommendation', 'cag_review', 'hr_review',
            'approval', 'travel_routes', 'taxi_expenses', 'mizigo_items',
            'naule_grand_total', 'taxi_grand_total', 'mizigo_grand_total',
            'travel_payment_grand_total', 'submitted_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'application_number', 'status', 'current_location', 'current_status_label',
            'requires_cag_review',
            'employee', 'total_working_days', 'submitted_at', 'created_at', 'updated_at',
        ]

    @extend_schema_field(OpenApiTypes.INT)
    def get_working_days_preview(self, obj):
        if obj.start_date and obj.last_date:
            return calculate_working_days(obj.start_date, obj.last_date)
        return None

    @extend_schema_field(OpenApiTypes.DECIMAL)
    def get_naule_grand_total(self, obj):
        return obj.naule_grand_total

    @extend_schema_field(OpenApiTypes.DECIMAL)
    def get_taxi_grand_total(self, obj):
        return obj.taxi_grand_total

    @extend_schema_field(OpenApiTypes.DECIMAL)
    def get_mizigo_grand_total(self, obj):
        return obj.mizigo_grand_total

    @extend_schema_field(OpenApiTypes.DECIMAL)
    def get_travel_payment_grand_total(self, obj):
        return obj.travel_payment_grand_total


class LeaveApplicationWriteSerializer(serializers.ModelSerializer):
    """
    Section A write serializer, used by employees creating/editing DRAFT (or
    RETURNED_TO_EMPLOYEE) applications. Dependants are nested and fully
    replaced on each write. Role/section/status enforcement happens in the
    view (permissions.assert_can_edit_fields) before this is called.
    """
    dependants = LeaveDependantSerializer(many=True, required=False)
    travel_routes = TravelRouteSerializer(many=True, required=False)
    taxi_expenses = TaxiExpenseSerializer(many=True, required=False)
    mizigo_items = MizigoItemSerializer(many=True, required=False)

    class Meta:
        model = LeaveApplication
        fields = [
            'id', 'vote_code', 'sub_vote', 'check_number', 'personnel_file',
            'full_name', 'designation', 'station', 'division_department',
            'phone_number', 'email', 'contact_address', 'leave_type',
            'leave_number', 'travel_assistance', 'start_date', 'last_date',
            'dependants', 'travel_routes', 'taxi_expenses', 'mizigo_items',
        ]
        read_only_fields = ['id']

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('last_date', getattr(self.instance, 'last_date', None))
        if start and end and end < start:
            raise serializers.ValidationError('last_date cannot be before start_date.')
        return attrs

    def create(self, validated_data):
        dependants_data = validated_data.pop('dependants', [])
        travel_routes_data = validated_data.pop('travel_routes', [])
        taxi_expenses_data = validated_data.pop('taxi_expenses', [])
        mizigo_items_data = validated_data.pop('mizigo_items', [])
        validated_data['employee'] = self.context['request'].user
        application = LeaveApplication.objects.create(**validated_data)
        self._sync_working_days(application)
        for dep in dependants_data:
            LeaveDependant.objects.create(application=application, **dep)
        self._sync_travel_routes(application, travel_routes_data)
        self._sync_taxi_expenses(application, taxi_expenses_data)
        self._sync_mizigo_items(application, mizigo_items_data)
        return application

    def update(self, instance, validated_data):
        dependants_data = validated_data.pop('dependants', None)
        travel_routes_data = validated_data.pop('travel_routes', None)
        taxi_expenses_data = validated_data.pop('taxi_expenses', None)
        mizigo_items_data = validated_data.pop('mizigo_items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        self._sync_working_days(instance, save=False)
        instance.save()
        if dependants_data is not None:
            instance.dependants.all().delete()
            for dep in dependants_data:
                LeaveDependant.objects.create(application=instance, **dep)
        if travel_routes_data is not None:
            self._sync_travel_routes(instance, travel_routes_data)
        if taxi_expenses_data is not None:
            self._sync_taxi_expenses(instance, taxi_expenses_data)
        if mizigo_items_data is not None:
            self._sync_mizigo_items(instance, mizigo_items_data)
        return instance

    @staticmethod
    def _sync_travel_routes(application, routes_data):
        """Delete-all-and-recreate, same pattern as dependants (two levels
        of nesting: each route recreates its own passengers)."""
        application.travel_routes.all().delete()
        for route_data in routes_data:
            passengers_data = route_data.pop('passengers', [])
            route = TravelRoute.objects.create(application=application, **route_data)
            for passenger_data in passengers_data:
                TravelRoutePassenger.objects.create(route=route, **passenger_data)

    @staticmethod
    def _sync_taxi_expenses(application, taxi_data):
        application.taxi_expenses.all().delete()
        for expense_data in taxi_data:
            TaxiExpense.objects.create(application=application, **expense_data)

    @staticmethod
    def _sync_mizigo_items(application, mizigo_data):
        application.mizigo_items.all().delete()
        for item_data in mizigo_data:
            MizigoItem.objects.create(application=application, **item_data)

    @staticmethod
    def _sync_working_days(application, save=True):
        if application.start_date and application.last_date:
            application.total_working_days = calculate_working_days(
                application.start_date, application.last_date
            )
            if save:
                application.save(update_fields=['total_working_days'])


class WorkflowActionSerializer(serializers.Serializer):
    """Body for POST .../recommend/, .../verify/, .../approve/, .../deny/, .../return/."""
    comments = serializers.CharField(required=False, allow_blank=True, default='')
    decision = serializers.BooleanField(required=False)  # recommended/verified/approved flag
    signature_name = serializers.CharField(required=False, allow_blank=True, default='')
    signature_designation = serializers.CharField(required=False, allow_blank=True, default='')


class LeavePolicySerializer(serializers.ModelSerializer):
    leave_type_name = serializers.CharField(source='leave_type.name', read_only=True)

    class Meta:
        model = LeavePolicy
        fields = [
            'id', 'leave_type', 'leave_type_name', 'designation',
            'min_years_of_service', 'max_years_of_service',
            'annual_entitlement', 'is_active',
            'sort_order', 'description', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, attrs):
        min_y = attrs.get('min_years_of_service', getattr(self.instance, 'min_years_of_service', None))
        max_y = attrs.get('max_years_of_service', getattr(self.instance, 'max_years_of_service', None))
        if min_y is not None and max_y is not None and max_y < min_y:
            raise serializers.ValidationError(
                'max_years_of_service cannot be less than min_years_of_service.'
            )
        return attrs


class LeaveBalanceSerializer(serializers.ModelSerializer):
    computed_entitlement = serializers.SerializerMethodField()
    is_entitlement_overridden = serializers.SerializerMethodField()

    class Meta:
        model = LeaveBalance
        fields = [
            'id', 'employee', 'leave_type', 'period', 'opening_balance',
            'entitlement', 'taken', 'pending', 'remaining',
            'computed_entitlement', 'is_entitlement_overridden',
        ]
        read_only_fields = ['id']

    @extend_schema_field(OpenApiTypes.INT)
    def get_computed_entitlement(self, obj):
        """What the policy engine would currently compute for this
        employee/leave_type — for comparison against the stored (possibly
        HR-overridden) `entitlement` value.

        Cached on the instance: both this field and is_entitlement_overridden
        need it, and compute_entitlement() isn't free (queries LeavePolicy).
        """
        if not hasattr(obj, '_computed_entitlement_cache'):
            obj._computed_entitlement_cache = compute_entitlement(obj.employee, obj.leave_type, period=obj.period)
        return obj._computed_entitlement_cache

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_is_entitlement_overridden(self, obj):
        return obj.entitlement != self.get_computed_entitlement(obj)


class WorkingDaysPreviewSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()

    def validate(self, attrs):
        if attrs['end_date'] < attrs['start_date']:
            raise serializers.ValidationError('end_date cannot be before start_date.')
        return attrs


class WorkingDaysPreviewResponseSerializer(serializers.Serializer):
    """Documentation-only: describes WorkingDaysPreviewView's response shape."""
    working_days = serializers.IntegerField()
