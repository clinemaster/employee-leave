"""
Reporting / export endpoints (spec section 35): leave applications filtered
by date/department/work station/leave-type/status, exportable as CSV, Excel or
PDF.

Restricted to roles with organization-wide visibility (HR_ADMIN,
AUTHORIZING_OFFICER, SYSTEM_ADMIN) — the same set that already sees the
org-wide leave-applications list (see `permissions.visible_queryset_for`).
"""
import csv

from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import LeaveApplication
from .permissions import IsAuthenticatedAndRole
from apps.accounts.models import Role

REPORT_COLUMNS = [
    ('application_number', 'Application Number'),
    ('employee__full_name', 'Employee'),
    ('employee__check_number', 'Check Number'),
    ('employee__department__name', 'Department'),
    ('employee__section__name', 'Section'),
    ('employee__work_station__name', 'Work Station'),
    ('leave_type__name', 'Leave Type'),
    ('status', 'Status'),
    ('start_date', 'Start Date'),
    ('last_date', 'Last Date'),
    ('total_working_days', 'Working Days'),
    ('submitted_at', 'Submitted At'),
    ('created_at', 'Created At'),
    ('updated_at', 'Updated At'),
]


class IsReportingRole(IsAuthenticatedAndRole):
    allowed_roles = (Role.HR_ADMIN, Role.AUTHORIZING_OFFICER, Role.SYSTEM_ADMIN)


def _filtered_queryset(params):
    qs = LeaveApplication.objects.select_related(
        'employee', 'employee__department', 'employee__section',
        'employee__work_station', 'leave_type',
    )

    start_date = params.get('start_date')
    end_date = params.get('end_date')
    if start_date:
        qs = qs.filter(start_date__gte=start_date)
    if end_date:
        qs = qs.filter(last_date__lte=end_date)

    department = params.get('department')
    if department:
        qs = qs.filter(employee__department_id=department)

    work_station = params.get('work_station')
    if work_station:
        qs = qs.filter(employee__work_station_id=work_station)

    leave_type = params.get('leave_type')
    if leave_type:
        qs = qs.filter(leave_type_id=leave_type)

    status = params.get('status')
    if status:
        qs = qs.filter(status=status)

    employee = params.get('employee')
    if employee:
        qs = qs.filter(employee_id=employee)

    return qs.order_by('-created_at')


def _row_values(application):
    row = []
    for field_path, _label in REPORT_COLUMNS:
        value = application
        for part in field_path.split('__'):
            if value is None:
                break
            value = getattr(value, part, None)
        row.append('' if value is None else value)
    return row


class _IgnoreFormatSuffixNegotiation(DefaultContentNegotiation):
    """
    Our `?format=csv|xlsx` query param is a report-export choice, not DRF's
    built-in "URL format suffix" (which also reads `?format=`) used to pick
    a *renderer* for the response body — without this override DRF tries to
    find a 'csv'/'xlsx' renderer for the (JSON-only) API and 404s. This view
    handles `format` itself and always emits a raw HttpResponse, so content
    negotiation should just ignore the suffix entirely.
    """

    def select_renderer(self, request, renderers, format_suffix=None):
        # Always negotiate as if no format suffix/query-param were given, so
        # our own `?format=csv|xlsx` never reaches DRF's renderer lookup.
        return (renderers[0], renderers[0].media_type)


class LeaveApplicationReportView(APIView):
    """
    GET /api/reports/leave-applications/?format=csv|xlsx
        &start_date=&end_date=&department=&work_station=&leave_type=&status=&employee=

    Streams a CSV or Excel (.xlsx) export of leave applications matching the
    given filters. Defaults to CSV if `format` is omitted.
    """
    permission_classes = [IsAuthenticated, IsReportingRole]
    content_negotiation_class = _IgnoreFormatSuffixNegotiation
    # Resource-intensive (streams a full filtered export) — throttle
    # separately from the general per-user rate (default 20/min, see
    # THROTTLE_RATE_REPORT_EXPORT).
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'report_export'

    @extend_schema(
        parameters=[
            OpenApiParameter('format', OpenApiTypes.STR, description='csv (default), xlsx, or pdf'),
            OpenApiParameter('start_date', OpenApiTypes.DATE, description='Filter: submitted/start date >= this'),
            OpenApiParameter('end_date', OpenApiTypes.DATE, description='Filter: submitted/start date <= this'),
            OpenApiParameter('department', OpenApiTypes.INT, description='Filter by employee department id'),
            OpenApiParameter('work_station', OpenApiTypes.INT, description='Filter by employee work station id'),
            OpenApiParameter('leave_type', OpenApiTypes.INT, description='Filter by leave type id'),
            OpenApiParameter('status', OpenApiTypes.STR, description='Filter by application status'),
            OpenApiParameter('employee', OpenApiTypes.INT, description='Filter by employee id'),
        ],
        responses={200: OpenApiResponse(
            response=OpenApiTypes.BINARY,
            description='A raw file download (text/csv, xlsx, or application/pdf depending on `format`), not JSON.',
        )},
    )
    def get(self, request):
        export_format = (request.query_params.get('format') or 'csv').lower()
        if export_format not in ('csv', 'xlsx', 'pdf'):
            raise ValidationError({'format': 'Must be "csv", "xlsx" or "pdf".'})

        queryset = _filtered_queryset(request.query_params)
        headers = [label for _field, label in REPORT_COLUMNS]

        if export_format == 'csv':
            return self._csv_response(queryset, headers)
        if export_format == 'xlsx':
            return self._xlsx_response(queryset, headers)
        return self._pdf_response(queryset, request.query_params)

    def _csv_response(self, queryset, headers):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="leave-applications.csv"'
        writer = csv.writer(response)
        writer.writerow(headers)
        for application in queryset.iterator():
            writer.writerow(_row_values(application))
        return response

    def _xlsx_response(self, queryset, headers):
        from openpyxl import Workbook
        from openpyxl.utils import get_column_letter

        wb = Workbook()
        ws = wb.active
        ws.title = 'Leave Applications'
        ws.append(headers)
        for col_idx in range(1, len(headers) + 1):
            ws.cell(row=1, column=col_idx).font = ws.cell(row=1, column=col_idx).font.copy(bold=True)

        for application in queryset.iterator():
            ws.append([str(v) if not isinstance(v, (int, float, type(None))) else v for v in _row_values(application)])

        for col_idx, _header in enumerate(headers, start=1):
            ws.column_dimensions[get_column_letter(col_idx)].width = 20

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="leave-applications.xlsx"'
        wb.save(response)
        return response

    def _pdf_response(self, queryset, query_params):
        import io

        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('ReportTitle', parent=styles['Title'], fontSize=14, spaceAfter=6)
        meta_style = ParagraphStyle('ReportMeta', parent=styles['Normal'], fontSize=8.5, textColor=colors.grey, spaceAfter=2)
        cell_style = ParagraphStyle('ReportCell', parent=styles['Normal'], fontSize=7.5, leading=9)
        header_cell_style = ParagraphStyle('ReportHeaderCell', parent=styles['Normal'], fontSize=7.5, leading=9, textColor=colors.white)

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer, pagesize=landscape(A4),
            leftMargin=1 * cm, rightMargin=1 * cm, topMargin=1 * cm, bottomMargin=1 * cm,
        )
        elements = [
            Paragraph('NAOT Digital Leave Management System', title_style),
            Paragraph('Leave Applications Report', meta_style),
            Paragraph(
                f'Generated: {timezone.now().strftime("%Y-%m-%d %H:%M:%S")} UTC',
                meta_style,
            ),
        ]

        applied_filters = {
            key: value for key, value in query_params.items()
            if key != 'format' and value
        }
        if applied_filters:
            filters_text = '; '.join(f'{k}={v}' for k, v in applied_filters.items())
        else:
            filters_text = 'None'
        elements.append(Paragraph(f'Filters: {filters_text}', meta_style))
        elements.append(Spacer(1, 0.4 * cm))

        table_columns = [
            ('application_number', 'App. No.'),
            ('employee__full_name', 'Employee'),
            ('leave_type__name', 'Leave Type'),
            ('start_date', 'Start Date'),
            ('last_date', 'Last Date'),
            ('total_working_days', 'Working Days'),
            ('status', 'Status'),
        ]
        header_row = [Paragraph(label, header_cell_style) for _field, label in table_columns]
        rows = [header_row]
        count = 0
        for application in queryset.iterator():
            count += 1
            row = []
            for field_path, _label in table_columns:
                value = application
                for part in field_path.split('__'):
                    if value is None:
                        break
                    value = getattr(value, part, None)
                row.append(Paragraph('' if value is None else str(value), cell_style))
            rows.append(row)

        if count == 0:
            elements.append(Paragraph('No matching applications.', styles['Normal']))
        else:
            table = Table(rows, repeatRows=1)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1f2937')),
                ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.whitesmoke]),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            elements.append(table)
            elements.append(Spacer(1, 0.3 * cm))
            elements.append(Paragraph(f'Total applications: {count}', meta_style))

        doc.build(elements)
        pdf_bytes = buffer.getvalue()

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = 'attachment; filename="leave-applications.pdf"'
        return response
