from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.documents.models import LeaveDocument

from .models import Holiday, LeaveApplication, LeaveBalance, LeaveType
from .permissions import (
    CanAccessLeaveApplication, IsSystemAdmin, assert_can_edit_fields,
    can_view_application, visible_queryset_for,
)
from .serializers import (
    HolidaySerializer, LeaveApplicationSerializer, LeaveApplicationWriteSerializer,
    LeaveBalanceSerializer, LeaveTypeSerializer, WorkflowActionSerializer,
    WorkingDaysPreviewSerializer,
)
from .workflow import WorkflowError, perform_transition
from .workingdays import calculate_working_days


class ReadAllWriteAdminMixin:
    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        return [IsSystemAdmin()]


class LeaveTypeViewSet(ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = LeaveType.objects.filter(deleted_at__isnull=True)
    serializer_class = LeaveTypeSerializer
    filterset_fields = ['is_active']


class HolidayViewSet(ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = Holiday.objects.all()
    serializer_class = HolidaySerializer
    filterset_fields = ['is_recurring']


class LeaveBalanceViewSet(viewsets.ReadOnlyModelViewSet):
    """Employees see their own balances; HR/AO/SystemAdmin see everyone's."""
    serializer_class = LeaveBalanceSerializer
    filterset_fields = ['employee', 'leave_type', 'period']

    def get_queryset(self):
        user = self.request.user
        qs = LeaveBalance.objects.all()
        from .permissions import is_hr_admin, is_authorizing_officer, is_system_admin
        if is_hr_admin(user) or is_authorizing_officer(user) or is_system_admin(user):
            return qs
        return qs.filter(employee=user)


class WorkingDaysPreviewView(APIView):
    """POST /api/leave/working-days-preview/ {start_date, end_date} -> {working_days}.
    Standalone endpoint so the frontend can show a live total as the user
    picks dates, using the exact same server-authoritative calculation used
    on save."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = WorkingDaysPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        days = calculate_working_days(
            serializer.validated_data['start_date'], serializer.validated_data['end_date']
        )
        return Response({'working_days': days})


class _AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'application', 'user', 'user_name', 'role', 'action',
            'previous_status', 'new_status', 'timestamp', 'comments',
        ]


class _LeaveDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveDocument
        fields = [
            'id', 'application', 'document_type', 'file', 'generated_by',
            'is_active', 'created_at',
        ]


class LeaveApplicationViewSet(viewsets.ModelViewSet):
    """
    /api/leave-applications/            GET (list, scoped), POST (create DRAFT)
    /api/leave-applications/{id}/       GET, PUT/PATCH (Section-scoped edit)
    /api/leave-applications/{id}/submit/
    /api/leave-applications/{id}/recommend/
    /api/leave-applications/{id}/return/
    /api/leave-applications/{id}/verify/
    /api/leave-applications/{id}/approve/
    /api/leave-applications/{id}/deny/
    /api/leave-applications/{id}/generate-pdf/
    /api/leave-applications/{id}/documents/   GET
    /api/leave-applications/{id}/audit-trail/ GET
    """
    permission_classes = [IsAuthenticated, CanAccessLeaveApplication]
    filterset_fields = ['status', 'leave_type', 'employee']

    def get_queryset(self):
        qs = LeaveApplication.objects.select_related(
            'employee', 'leave_type', 'recommendation', 'hr_review', 'approval'
        ).prefetch_related('dependants')
        return visible_queryset_for(self.request.user, qs)

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return LeaveApplicationWriteSerializer
        return LeaveApplicationSerializer

    def perform_create(self, serializer):
        serializer.save()  # employee is set to request.user inside the serializer

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        assert_can_edit_fields(request.user, instance, request.data.keys())
        if instance.status not in ('DRAFT', 'RETURNED_TO_EMPLOYEE'):
            return Response(
                {'detail': 'Section A can only be edited while the application is DRAFT or RETURNED_TO_EMPLOYEE.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if not can_view_application(request.user, instance):
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return super().retrieve(request, *args, **kwargs)

    # --- Workflow actions -------------------------------------------------

    def _do_transition(self, request, pk, action_name, section_serializer_field=None, section_model=None):
        application = self.get_object()
        body = WorkflowActionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data

        # Persist the section object (B1/B2/C) for actions that carry a decision.
        if section_serializer_field and section_model is not None and 'decision' in data:
            decision_field_map = {
                'recommend': 'recommended', 'verify': 'verified',
                'approve': 'approved', 'deny': 'approved',
            }
            obj = getattr(application, section_serializer_field, None)
            if obj is None:
                obj = section_model.objects.create()
                setattr(application, section_serializer_field, obj)
            obj.reviewer = request.user
            obj.comments = data.get('comments', '')
            obj.signature_name = data.get('signature_name', '')
            obj.signature_designation = data.get('signature_designation', '')
            decision_value = data['decision']
            if action_name == 'deny':
                decision_value = False
            setattr(obj, decision_field_map.get(action_name, 'recommended'), decision_value)
            obj.save()
            application.save(update_fields=[section_serializer_field])

        try:
            application = perform_transition(application, request.user, action_name, comments=data.get('comments', ''))
        except WorkflowError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(LeaveApplicationSerializer(application).data)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        return self._do_transition(request, pk, 'submit')

    @action(detail=True, methods=['post'])
    def recommend(self, request, pk=None):
        from .models import LeaveRecommendation
        return self._do_transition(request, pk, 'recommend', 'recommendation', LeaveRecommendation)

    @action(detail=True, methods=['post'], url_path='return')
    def return_application(self, request, pk=None):
        return self._do_transition(request, pk, 'return_to_employee')

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        from .models import LeaveHRReview
        return self._do_transition(request, pk, 'verify', 'hr_review', LeaveHRReview)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        from .models import LeaveApproval
        data = request.data.copy()
        data.setdefault('decision', True)
        request._full_data = data
        return self._do_transition(request, pk, 'approve', 'approval', LeaveApproval)

    @action(detail=True, methods=['post'])
    def deny(self, request, pk=None):
        from .models import LeaveApproval
        return self._do_transition(request, pk, 'deny', 'approval', LeaveApproval)

    @action(detail=True, methods=['post'], url_path='generate-pdf')
    def generate_pdf(self, request, pk=None):
        application = self.get_object()
        from apps.documents.pdf import generate_leave_application_pdf
        try:
            document = generate_leave_application_pdf(application, request.user)
        except WorkflowError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_LeaveDocumentSerializer(document).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def documents(self, request, pk=None):
        application = self.get_object()
        docs = application.documents.filter(is_active=True)
        return Response(_LeaveDocumentSerializer(docs, many=True).data)

    @action(detail=True, methods=['get'], url_path='audit-trail')
    def audit_trail(self, request, pk=None):
        application = self.get_object()
        logs = application.audit_logs.all()
        return Response(_AuditLogSerializer(logs, many=True).data)
