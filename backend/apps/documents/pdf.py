"""
Two-page NAOT leave application PDF generator, built with reportlab
(pure-Python, no system deps — chosen over weasyprint for portability).

Page 1: Section A (application details) + Section B1 (HOD recommendation)
        + Section B2 (HR verification).
Page 2: Section C (Authorizing Officer decision).

Signature areas are rendered as BLANK LINES with printed name/designation/
date labels only — this is a paper-workflow placeholder, NOT a digital
signature or DSMS integration (explicitly out of scope).
"""
import io
import os

from django.conf import settings
from django.core.files.base import ContentFile
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from apps.leave.workflow import WorkflowError

from .models import LeaveDocument

ASSETS_DIR = getattr(settings, 'DOCUMENTS_ASSETS_DIR', None) or (
    settings.BASE_DIR / 'apps' / 'documents' / 'assets'
)

styles = getSampleStyleSheet()
title_style = ParagraphStyle('NaotTitle', parent=styles['Title'], fontSize=13, spaceAfter=4)
heading_style = ParagraphStyle('NaotHeading', parent=styles['Heading3'], fontSize=10, spaceBefore=8, spaceAfter=4)
normal_style = ParagraphStyle('NaotNormal', parent=styles['Normal'], fontSize=9)
small_style = ParagraphStyle('NaotSmall', parent=styles['Normal'], fontSize=8, textColor=colors.grey)


LOGO_BOX_CM = 3.0  # max width/height a header logo/emblem is scaled to fit within


def _fit_image(path, max_dim_cm):
    """Load `path` scaled to fit within a max_dim_cm x max_dim_cm box,
    preserving its native aspect ratio (avoids stretching a non-square
    emblem/logo into a distorted square)."""
    max_dim = max_dim_cm * cm
    try:
        from PIL import Image as PILImage
        with PILImage.open(path) as im:
            native_w, native_h = im.size
    except Exception:
        native_w, native_h = 1, 1
    scale = min(max_dim / native_w, max_dim / native_h)
    return Image(path, width=native_w * scale, height=native_h * scale)


def _header_block():
    elements = []
    emblem_path = os.path.join(ASSETS_DIR, 'emblem_placeholder.png')
    logo_path = os.path.join(ASSETS_DIR, 'naot_logo_placeholder.png')
    logos = []
    if os.path.exists(emblem_path):
        logos.append(_fit_image(emblem_path, LOGO_BOX_CM))
    else:
        logos.append(Paragraph('[Emblem]', small_style))
    logos.append(Paragraph(
        '<b>UNITED REPUBLIC OF TANZANIA</b><br/>'
        'NATIONAL AUDIT OFFICE OF TANZANIA (NAOT)<br/>'
        '<b>APPLICATION FOR LEAVE</b>',
        title_style,
    ))
    if os.path.exists(logo_path):
        logos.append(_fit_image(logo_path, LOGO_BOX_CM))
    else:
        logos.append(Paragraph('[NAOT Logo]', small_style))

    header_table = Table([logos], colWidths=[3.6 * cm, 10.8 * cm, 3.6 * cm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (0, 0), 'CENTER'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('ALIGN', (2, 0), (2, 0), 'CENTER'),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 0.4 * cm))
    return elements


def _kv_table(rows, col_widths=(4.5 * cm, 4.2 * cm, 4.5 * cm, 4.2 * cm)):
    table = Table(rows, colWidths=list(col_widths))
    table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (0, -1), colors.whitesmoke),
        ('BACKGROUND', (2, 0), (2, -1), colors.whitesmoke),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    return table


def _signature_block(label):
    rows = [
        [Paragraph(f'<b>{label}</b>', normal_style)],
        [Paragraph('Signature: ______________________________', normal_style)],
        [Paragraph('Name: ______________________________', normal_style)],
        [Paragraph('Designation: ______________________________', normal_style)],
        [Paragraph('Date: ______________________________', normal_style)],
    ]
    table = Table(rows, colWidths=[17.5 * cm])
    table.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    return table


def _build_pdf_bytes(application):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.2 * cm, bottomMargin=1.2 * cm,
    )
    elements = []
    elements += _header_block()

    dependants = list(application.dependants.all())
    dependants_text = '; '.join(
        f'{d.name} ({d.relationship})' for d in dependants
    ) or '—'

    elements.append(Paragraph('SECTION A: Application Details', heading_style))
    elements.append(_kv_table([
        ['Application No.', application.application_number, 'Status', application.get_status_display()],
        ['Vote Code', application.vote_code or '—', 'Sub-Vote', application.sub_vote or '—'],
        ['Check Number', application.check_number or '—', 'Personnel File No.', application.personnel_file or '—'],
        ['Full Name', application.full_name or application.employee.full_name, 'Designation', application.designation or '—'],
        ['Station', application.station or '—', 'Division/Department', application.division_department or '—'],
        ['Phone', application.phone_number or '—', 'Email', application.email or '—'],
        ['Leave Type', application.leave_type.name, 'Leave No.', application.leave_number or '—'],
        ['Start Date', str(application.start_date), 'Last Date', str(application.last_date)],
        ['Total Working Days', str(application.total_working_days or '—'), 'Travel Assistance', 'Yes' if application.travel_assistance else 'No'],
        ['Contact Address', application.contact_address or '—', 'Dependants', dependants_text],
    ]))

    rec = getattr(application, 'recommendation', None)
    elements.append(Paragraph('SECTION B1: Recommendation by Head of Department/Section/Unit', heading_style))
    elements.append(_kv_table([
        ['Recommended', ('Yes' if rec and rec.recommended else 'No') if rec and rec.recommended is not None else '—',
         'Reviewer', (rec.reviewer.full_name if rec and rec.reviewer else '—')],
        ['Comments', (rec.comments if rec else '—'), '', ''],
    ]))
    elements.append(Spacer(1, 0.2 * cm))
    elements.append(_signature_block('Head of Department/Section/Unit'))

    hr = getattr(application, 'hr_review', None)
    elements.append(Paragraph('SECTION B2: HR Verification', heading_style))
    elements.append(_kv_table([
        ['Verified', ('Yes' if hr and hr.verified else 'No') if hr and hr.verified is not None else '—',
         'Reviewer', (hr.reviewer.full_name if hr and hr.reviewer else '—')],
        ['Balance Confirmed', (hr.leave_balance_confirmed if hr else '—'), 'Comments', (hr.comments if hr else '—')],
    ]))
    elements.append(Spacer(1, 0.2 * cm))
    elements.append(_signature_block('HR Admin'))

    elements.append(Paragraph(
        'Note: this is a paper-workflow replica. Signatures above are blank lines to be '
        'signed by hand; this system does not apply digital signatures or certificates.',
        small_style,
    ))

    # Page 2: Section C
    from reportlab.platypus import PageBreak
    elements.append(PageBreak())
    elements += _header_block()
    approval = getattr(application, 'approval', None)
    elements.append(Paragraph('SECTION C: Authorization Decision', heading_style))
    elements.append(_kv_table([
        ['Decision', ('Approved' if approval and approval.approved else 'Denied') if approval and approval.approved is not None else '—',
         'Authorizing Officer', (approval.reviewer.full_name if approval and approval.reviewer else '—')],
        ['Comments', (approval.comments if approval else '—'), '', ''],
    ]))
    elements.append(Spacer(1, 0.3 * cm))
    elements.append(_signature_block('Authorizing Officer'))
    elements.append(Spacer(1, 1 * cm))
    elements.append(Paragraph(
        f'Generated by NAOT Digital Leave Management System — application '
        f'{application.application_number}, current status: {application.get_status_display()}.',
        small_style,
    ))

    doc.build(elements)
    return buffer.getvalue()


def generate_leave_application_pdf(application, generated_by):
    """
    Renders the two-page PDF for `application` and stores it as a new
    LeaveDocument (DocumentType.LEAVE_FORM_PDF). Only allowed once the
    application has reached APPROVED status; on success the workflow
    transitions APPROVED -> PDF_GENERATED.
    """
    if application.status != 'APPROVED':
        raise WorkflowError('PDF can only be generated for an APPROVED application.')

    pdf_bytes = _build_pdf_bytes(application)
    filename = f'{application.application_number}.pdf'

    document = LeaveDocument.objects.create(
        application=application,
        document_type=LeaveDocument.DocumentType.LEAVE_FORM_PDF,
        generated_by=generated_by,
    )
    document.file.save(filename, ContentFile(pdf_bytes), save=True)

    from apps.leave.workflow import perform_transition
    perform_transition(application, generated_by, 'generate_pdf', comments='PDF generated')

    return document
