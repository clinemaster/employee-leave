from rest_framework import serializers

from .models import (
    Holiday, LeaveApplication, LeaveApproval, LeaveBalance, LeaveDependant,
    LeaveHRReview, LeaveRecommendation, LeaveType,
)
from .workingdays import calculate_working_days


class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = ['id', 'name', 'code', 'is_active', 'sort_order']


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = ['id', 'date', 'name', 'is_recurring']


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


class LeaveApplicationSerializer(serializers.ModelSerializer):
    """Read serializer — full nested view of an application (all sections)."""
    dependants = LeaveDependantSerializer(many=True, read_only=True)
    recommendation = LeaveRecommendationSerializer(read_only=True)
    hr_review = LeaveHRReviewSerializer(read_only=True)
    approval = LeaveApprovalSerializer(read_only=True)
    leave_type_name = serializers.CharField(source='leave_type.name', read_only=True)
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    working_days_preview = serializers.SerializerMethodField()

    class Meta:
        model = LeaveApplication
        fields = [
            'id', 'application_number', 'status', 'employee', 'employee_name',
            'vote_code', 'sub_vote', 'check_number', 'personnel_file', 'full_name',
            'designation', 'station', 'division_department', 'phone_number', 'email',
            'contact_address', 'leave_type', 'leave_type_name', 'leave_number',
            'travel_assistance', 'start_date', 'last_date', 'total_working_days',
            'working_days_preview', 'dependants', 'recommendation', 'hr_review',
            'approval', 'submitted_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'application_number', 'status', 'employee', 'total_working_days',
            'submitted_at', 'created_at', 'updated_at',
        ]

    def get_working_days_preview(self, obj):
        if obj.start_date and obj.last_date:
            return calculate_working_days(obj.start_date, obj.last_date)
        return None


class LeaveApplicationWriteSerializer(serializers.ModelSerializer):
    """
    Section A write serializer, used by employees creating/editing DRAFT (or
    RETURNED_TO_EMPLOYEE) applications. Dependants are nested and fully
    replaced on each write. Role/section/status enforcement happens in the
    view (permissions.assert_can_edit_fields) before this is called.
    """
    dependants = LeaveDependantSerializer(many=True, required=False)

    class Meta:
        model = LeaveApplication
        fields = [
            'id', 'vote_code', 'sub_vote', 'check_number', 'personnel_file',
            'full_name', 'designation', 'station', 'division_department',
            'phone_number', 'email', 'contact_address', 'leave_type',
            'leave_number', 'travel_assistance', 'start_date', 'last_date',
            'dependants',
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
        validated_data['employee'] = self.context['request'].user
        application = LeaveApplication.objects.create(**validated_data)
        self._sync_working_days(application)
        for dep in dependants_data:
            LeaveDependant.objects.create(application=application, **dep)
        return application

    def update(self, instance, validated_data):
        dependants_data = validated_data.pop('dependants', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        self._sync_working_days(instance, save=False)
        instance.save()
        if dependants_data is not None:
            instance.dependants.all().delete()
            for dep in dependants_data:
                LeaveDependant.objects.create(application=instance, **dep)
        return instance

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


class LeaveBalanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveBalance
        fields = [
            'id', 'employee', 'leave_type', 'period', 'opening_balance',
            'entitlement', 'taken', 'pending', 'remaining',
        ]
        read_only_fields = ['id']


class WorkingDaysPreviewSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()

    def validate(self, attrs):
        if attrs['end_date'] < attrs['start_date']:
            raise serializers.ValidationError('end_date cannot be before start_date.')
        return attrs
