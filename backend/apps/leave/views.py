from django.db import transaction
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.documents.models import LeaveDocument

from .models import Holiday, LeaveApplication, LeaveBalance, LeavePolicy, LeaveType
from .permissions import (
    CanAccessLeaveApplication, IsSystemAdmin, assert_can_edit_fields,
    can_view_application, visible_queryset_for,
)
from .serializers import (
    HolidaySerializer, LeaveApplicationSerializer, LeaveApplicationWriteSerializer,
    LeaveBalanceSerializer, LeavePolicySerializer, LeaveTypeSerializer,
    WorkflowActionSerializer, WorkingDaysPreviewSerializer,
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

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """
        POST /api/leave-types/reorder/
        Body: `[{"id": 1, "sort_order": 0}, {"id": 2, "sort_order": 1}, ...]`
        SYSTEM_ADMIN only (enforced by ReadAllWriteAdminMixin.get_permissions,
        since 'reorder' isn't 'list'/'retrieve'). Atomic, all-or-nothing:
        validates every id exists (among non-deleted LeaveTypes) and that
        there are no duplicate ids before writing anything; a single invalid
        entry rejects the whole request with 400 and leaves sort_order
        untouched. Returns the reordered list.
        """
        payload = request.data
        if not isinstance(payload, list) or not payload:
            raise ValidationError('Expected a non-empty list of {"id", "sort_order"} objects.')

        entries = []
        seen_ids = set()
        for item in payload:
            if not isinstance(item, dict) or 'id' not in item or 'sort_order' not in item:
                raise ValidationError('Each entry must be an object with "id" and "sort_order".')
            try:
                type_id = int(item['id'])
                sort_order = int(item['sort_order'])
            except (TypeError, ValueError):
                raise ValidationError('"id" and "sort_order" must be integers.')
            if type_id in seen_ids:
                raise ValidationError(f'Duplicate id: {type_id}.')
            seen_ids.add(type_id)
            entries.append((type_id, sort_order))

        existing = LeaveType.objects.filter(deleted_at__isnull=True, id__in=seen_ids)
        existing_ids = set(existing.values_list('id', flat=True))
        missing_ids = seen_ids - existing_ids
        if missing_ids:
            raise ValidationError(f'Unknown leave type id(s): {sorted(missing_ids)}.')

        with transaction.atomic():
            for type_id, sort_order in entries:
                LeaveType.objects.filter(id=type_id).update(sort_order=sort_order)

        reordered = LeaveType.objects.filter(id__in=seen_ids).order_by('sort_order', 'name')
        return Response(LeaveTypeSerializer(reordered, many=True).data)


class HolidayViewSet(ReadAllWriteAdminMixin, viewsets.ModelViewSet):
    queryset = Holiday.objects.all()
    serializer_class = HolidaySerializer
    filterset_fields = ['is_recurring']


class LeavePolicyViewSet(viewsets.ModelViewSet):
    """
    Admin-only CRUD for annual-entitlement policy rules (spec section 9's
    configurable leave types). GET|POST /api/leave-policies/,
    GET|PUT|PATCH|DELETE /api/leave-policies/{id}/.
    """
    queryset = LeavePolicy.objects.select_related('leave_type').all()
    serializer_class = LeavePolicySerializer
    permission_classes = [IsSystemAdmin]
    filterset_fields = ['leave_type', 'is_active']


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

    @action(detail=False, methods=['post'])
    def recalculate(self, request):
        """
        POST /api/leave-balances/recalculate/
        Body: `{employee?, leave_type?, period?}`. Recomputes taken/pending/
        remaining from LeaveApplication history (spec section 40).
        - An employee may only recalculate their own balances (employee is
          forced to self, other fields optional).
        - HR_ADMIN / AUTHORIZING_OFFICER / SYSTEM_ADMIN may target any
          employee (or omit `employee` to recalculate every combo they
          currently have a LeaveBalance row for).
        """
        from .balances import recalculate_all_for_employee, recalculate_balance
        from .permissions import is_authorizing_officer, is_hr_admin, is_system_admin

        user = request.user
        privileged = is_hr_admin(user) or is_authorizing_officer(user) or is_system_admin(user)
        employee_id = request.data.get('employee')
        leave_type_id = request.data.get('leave_type')
        period = request.data.get('period')

        if not privileged:
            employee_id = user.id

        if employee_id and leave_type_id and period:
            balance = recalculate_balance(employee_id, leave_type_id, period)
            return Response(LeaveBalanceSerializer(balance).data)

        from apps.accounts.models import User
        if employee_id:
            targets = [employee_id]
        elif privileged:
            targets = LeaveBalance.objects.values_list('employee_id', flat=True).distinct()
        else:
            targets = [user.id]

        results = []
        for emp_id in targets:
            employee = User.objects.filter(pk=emp_id).first()
            if employee:
                results.extend(recalculate_all_for_employee(employee))
        return Response(LeaveBalanceSerializer(results, many=True).data)


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
    # Declared so the `throttle_scope=...` kwarg on individual @action
    # decorators (generate_pdf, upload_document) is a valid DRF initkwarg —
    # DRF's ViewSet.as_view() requires hasattr(cls, key) for every kwarg an
    # @action passes through. Unused at the class level (each action
    # overrides throttle_classes/throttle_scope itself); default-permissive
    # value only, not a design change to the throttling scheme.
    throttle_scope = None

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

    @action(detail=True, methods=['post'], url_path='resubmit-to-hr')
    def resubmit_to_hr(self, request, pk=None):
        """HOD resubmits (after correcting Section B1) from RETURNED_TO_HOD -> PENDING_HR_REVIEW."""
        return self._do_transition(request, pk, 'resubmit_to_hr')

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """PDF_GENERATED -> COMPLETED (terminal, successful)."""
        return self._do_transition(request, pk, 'complete')

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """DENIED or COMPLETED -> ARCHIVED (terminal, housekeeping)."""
        return self._do_transition(request, pk, 'archive')

    @action(
        detail=True, methods=['post'], url_path='generate-pdf',
        throttle_classes=[ScopedRateThrottle], throttle_scope='pdf_export',
    )
    def generate_pdf(self, request, pk=None):
        application = self.get_object()
        from apps.documents.pdf import generate_leave_application_pdf
        try:
            document = generate_leave_application_pdf(application, request.user)
        except WorkflowError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            _LeaveDocumentSerializer(document, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['get'])
    def documents(self, request, pk=None):
        application = self.get_object()
        docs = application.documents.filter(is_active=True)
        return Response(_LeaveDocumentSerializer(docs, many=True, context={'request': request}).data)

    @action(
        detail=True, methods=['post'], url_path='upload-document',
        throttle_classes=[ScopedRateThrottle], throttle_scope='document_upload',
    )
    def upload_document(self, request, pk=None):
        """
        POST /api/leave-applications/{id}/upload-document/ (multipart, field
        name `file`). Employee-only, own application, DRAFT/RETURNED states —
        a single supporting-attachment upload per call. Validates extension,
        magic bytes and size server-side (apps.documents.uploads); see
        SECURITY.md for the details.
        """
        application = self.get_object()
        if application.employee_id != request.user.id:
            return Response(
                {'detail': 'You may only attach documents to your own application.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if application.status not in ('DRAFT', 'RETURNED_TO_EMPLOYEE'):
            return Response(
                {'detail': 'Documents can only be attached while the application is DRAFT or RETURNED_TO_EMPLOYEE.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        upload = request.FILES.get('file')
        if not upload:
            return Response({'detail': 'No file provided (expected multipart field "file").'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.documents.uploads import UploadValidationError, scan_for_malware, validate_upload
        try:
            validate_upload(upload)
            scan_for_malware(upload)
        except UploadValidationError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        document = LeaveDocument.objects.create(
            application=application,
            document_type=LeaveDocument.DocumentType.SUPPORTING_ATTACHMENT,
            generated_by=request.user,
        )
        document.file.save(upload.name, upload, save=True)
        return Response(
            _LeaveDocumentSerializer(document, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['get'], url_path=r'documents/(?P<document_id>[^/.]+)/download')
    def download_document(self, request, pk=None, document_id=None):
        """
        GET /api/leave-applications/{id}/documents/{document_id}/download/
        Authenticated, permission-rechecked download — the only supported
        way to fetch a document's bytes. Files are never served directly
        from MEDIA_URL in production (see DEPLOYMENT.md §6).
        """
        application = self.get_object()  # re-applies CanAccessLeaveApplication (IDOR check)
        document = application.documents.filter(pk=document_id, is_active=True).first()
        if document is None or not document.file:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        from django.http import FileResponse
        document.file.open('rb')
        response = FileResponse(
            document.file, as_attachment=True, filename=document.file.name.rsplit('/', 1)[-1],
        )
        return response

    @action(detail=True, methods=['get'], url_path='audit-trail')
    def audit_trail(self, request, pk=None):
        application = self.get_object()
        logs = application.audit_logs.all()
        return Response(_AuditLogSerializer(logs, many=True).data)
