"""
Reporting / export endpoints (spec section 35): leave applications filtered
by date/department/station/leave-type/status, exportable as CSV or Excel.

Restricted to roles with organization-wide visibility (HR_ADMIN,
AUTHORIZING_OFFICER, SYSTEM_ADMIN) — the same set that already sees the
org-wide leave-applications list (see `permissions.visible_queryset_for`).
PDF export is deferred (see API.md).
"""
import csv

from django.http import HttpResponse
from rest_framework.exceptions import ValidationError
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.permissions import IsAuthenticated
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
    ('employee__unit__name', 'Unit'),
    ('employee__station__name', 'Station'),
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
        'employee__unit', 'employee__station', 'leave_type',
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

    station = params.get('station')
    if station:
        qs = qs.filter(employee__station_id=station)

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
        &start_date=&end_date=&department=&station=&leave_type=&status=&employee=

    Streams a CSV or Excel (.xlsx) export of leave applications matching the
    given filters. Defaults to CSV if `format` is omitted.
    """
    permission_classes = [IsAuthenticated, IsReportingRole]
    content_negotiation_class = _IgnoreFormatSuffixNegotiation

    def get(self, request):
        export_format = (request.query_params.get('format') or 'csv').lower()
        if export_format not in ('csv', 'xlsx'):
            raise ValidationError({'format': 'Must be "csv" or "xlsx".'})

        queryset = _filtered_queryset(request.query_params)
        headers = [label for _field, label in REPORT_COLUMNS]

        if export_format == 'csv':
            return self._csv_response(queryset, headers)
        return self._xlsx_response(queryset, headers)

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
