"""
Real email sending for workflow-transition notifications (spec section 29's
routing table), layered on top of the existing in-app Notification rows.

Design constraints:
- Email sending must never break a workflow transition. `perform_transition`
  in apps/leave/workflow.py runs inside `transaction.atomic()`; a raised
  exception here would roll back the DB changes (status update, AuditLog,
  Notification rows) that already succeeded. So every public entry point in
  this module swallows its own exceptions and logs them instead of raising.
- Sending should happen after the enclosing DB transaction commits
  (`transaction.on_commit`), both so we don't hold up the transaction on a
  slow SMTP round-trip and so we never email about a change that ultimately
  didn't commit (e.g. a later step in the same atomic block fails).
- No live SMTP server is required for local dev/CI/tests: see
  EMAIL_BACKEND in settings.py (console backend unless EMAIL_HOST is set;
  pytest-django forces the locmem backend regardless via django.test).
"""
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction

logger = logging.getLogger(__name__)

# subject/body templates per workflow action. `{application_number}` and any
# other keys present in the transition context are interpolated in.
_TEMPLATES = {
    'submit_employee': (
        'Leave application {application_number} submitted',
        'Dear {recipient_name},\n\n'
        'Your leave application {application_number} has been submitted and is '
        'now awaiting review by your Head of Department.\n\n'
        '- NAOT Digital Leave Management System',
    ),
    'submit_hod': (
        'Leave application {application_number} awaiting your recommendation',
        'Dear {recipient_name},\n\n'
        'Leave application {application_number} from {employee_name} is awaiting '
        'your recommendation (Section B1).\n\n'
        '- NAOT Digital Leave Management System',
    ),
    'recommend': (
        'Leave application {application_number} recommended',
        'Dear {recipient_name},\n\n'
        'Your leave application {application_number} was recommended by your '
        'Head of Department and is proceeding to HR verification.\n\n'
        '- NAOT Digital Leave Management System',
    ),
    'route_to_hr_hr': (
        'Leave application {application_number} awaiting HR verification',
        'Dear {recipient_name},\n\n'
        'Leave application {application_number} from {employee_name} has been '
        'recommended by the Head of Department and is now awaiting HR '
        'verification (Section B2).\n\n'
        '- NAOT Digital Leave Management System',
    ),
    'return_to_employee': (
        'Leave application {application_number} returned for correction',
        'Dear {recipient_name},\n\n'
        'Your leave application {application_number} was returned to you for '
        'correction. Please review the comments and resubmit.\n\n'
        '- NAOT Digital Leave Management System',
    ),
    'verify': (
        'Leave application {application_number} verified by HR',
        'Dear {recipient_name},\n\n'
        'Your leave application {application_number} was verified by HR and is '
        'proceeding to the Authorizing Officer for a decision.\n\n'
        '- NAOT Digital Leave Management System',
    ),
    'route_to_authorization_ao': (
        'Leave application {application_number} awaiting authorization',
        'Dear {recipient_name},\n\n'
        'Leave application {application_number} from {employee_name} has been '
        'verified by HR and is now awaiting your authorization decision.\n\n'
        '- NAOT Digital Leave Management System',
    ),
    'return_to_hod': (
        'Leave application {application_number} returned by HR',
        'Dear {recipient_name},\n\n'
        'Leave application {application_number} was returned to you by HR for '
        'clarification.\n\n'
        '- NAOT Digital Leave Management System',
    ),
    'resubmit_to_hr': (
        'Leave application {application_number} resubmitted to HR',
        'Dear {recipient_name},\n\n'
        'Your leave application {application_number} was resubmitted to HR by '
        'your Head of Department.\n\n'
        '- NAOT Digital Leave Management System',
    ),
    'approve': (
        'Leave application {application_number} approved',
        'Dear {recipient_name},\n\n'
        'Your leave application {application_number} has been approved.\n\n'
        '- NAOT Digital Leave Management System',
    ),
    'deny': (
        'Leave application {application_number} denied',
        'Dear {recipient_name},\n\n'
        'Your leave application {application_number} has been denied.\n\n'
        '- NAOT Digital Leave Management System',
    ),
    'complete_employee': (
        'Leave application {application_number} completed',
        'Dear {recipient_name},\n\n'
        'Your leave application {application_number} has been completed and '
        'archived.\n\n'
        '- NAOT Digital Leave Management System',
    ),
    'complete_hr': (
        'Leave application {application_number} completed',
        'Dear {recipient_name},\n\n'
        'Leave application {application_number} for {employee_name} has been '
        'completed.\n\n'
        '- NAOT Digital Leave Management System',
    ),
}


def _deliver(template_key, recipient, context):
    """Actually call send_mail. Never raises — logs and swallows on failure."""
    email = getattr(recipient, 'official_email', None)
    if not email:
        return
    subject_tpl, body_tpl = _TEMPLATES[template_key]
    ctx = {
        'recipient_name': getattr(recipient, 'full_name', None) or recipient.username,
        **context,
    }
    try:
        subject = subject_tpl.format(**ctx)
        body = body_tpl.format(**ctx)
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
    except Exception:
        logger.exception(
            'Failed to send workflow notification email (template=%s, recipient=%s)',
            template_key, email,
        )


def send_workflow_email(template_key, recipient, context):
    """
    Queue an email send for after the current DB transaction commits. Safe to
    call from inside `transaction.atomic()` blocks (e.g. workflow.py), and
    safe to call outside one too (on_commit runs immediately if there is no
    active transaction).
    """
    if recipient is None:
        return
    transaction.on_commit(lambda: _deliver(template_key, recipient, context))
