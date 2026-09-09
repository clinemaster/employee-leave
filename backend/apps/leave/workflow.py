"""
Leave application workflow state machine.

This is the single place that knows which status transitions are legal, who
may perform them, and what side effects (AuditLog row, Notification rows)
each transition produces. All transitions run inside a DB transaction.

Status flow (spec):
  DRAFT
    -> SUBMITTED (employee submits)
  SUBMITTED
    -> PENDING_HOD_REVIEW (system, immediately routes to HOD)
  PENDING_HOD_REVIEW
    -> HOD_RECOMMENDED (HOD recommends/declines, Section B1)
    -> RETURNED_TO_EMPLOYEE (HOD returns for correction)
  HOD_RECOMMENDED
    -> PENDING_HR_REVIEW (system, routes to HR)
  RETURNED_TO_EMPLOYEE
    -> SUBMITTED (employee resubmits after correcting Section A)
  PENDING_HR_REVIEW
    -> HR_VERIFIED (HR verifies leave balance/records, Section B2)
    -> RETURNED_TO_HOD (HR returns to HOD for clarification)
  RETURNED_TO_HOD
    -> PENDING_HR_REVIEW (HOD resubmits after correcting B1)
  HR_VERIFIED
    -> PENDING_AUTHORIZATION (system, routes to Authorizing Officer)
  PENDING_AUTHORIZATION
    -> APPROVED (AO approves, Section C)
    -> DENIED (AO denies, Section C)
  APPROVED
    -> PDF_GENERATED (generate-pdf endpoint)
  PDF_GENERATED
    -> COMPLETED (terminal, successful)
  DENIED
    -> ARCHIVED (terminal)
  COMPLETED
    -> ARCHIVED (terminal, housekeeping)
"""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit.models import AuditLog
from apps.notifications.models import Notification

from .models import ApplicationStatus as S
from .permissions import (
    is_authorizing_officer, is_hod, is_hr_admin, is_system_admin,
    routed_hod_for,
)

# Maps action name -> (from_statuses, to_status)
TRANSITIONS = {
    'submit': ({S.DRAFT, S.RETURNED_TO_EMPLOYEE}, S.PENDING_HOD_REVIEW),
    'recommend': ({S.PENDING_HOD_REVIEW}, S.HOD_RECOMMENDED),
    'return_to_employee': ({S.PENDING_HOD_REVIEW}, S.RETURNED_TO_EMPLOYEE),
    'route_to_hr': ({S.HOD_RECOMMENDED}, S.PENDING_HR_REVIEW),
    'verify': ({S.PENDING_HR_REVIEW}, S.HR_VERIFIED),
    'return_to_hod': ({S.PENDING_HR_REVIEW}, S.RETURNED_TO_HOD),
    'resubmit_to_hr': ({S.RETURNED_TO_HOD}, S.PENDING_HR_REVIEW),
    'route_to_authorization': ({S.HR_VERIFIED}, S.PENDING_AUTHORIZATION),
    'approve': ({S.PENDING_AUTHORIZATION}, S.APPROVED),
    'deny': ({S.PENDING_AUTHORIZATION}, S.DENIED),
    'generate_pdf': ({S.APPROVED}, S.PDF_GENERATED),
    'complete': ({S.PDF_GENERATED}, S.COMPLETED),
    'archive': ({S.DENIED, S.COMPLETED}, S.ARCHIVED),
}


class WorkflowError(ValidationError):
    pass


def _check_role_for_action(user, application, action):
    if is_system_admin(user):
        return  # system admins may operate the workflow for support/testing
    if action in ('submit',):
        if application.employee_id != user.id:
            raise PermissionDenied('Only the applicant may submit this application.')
    elif action in ('recommend', 'return_to_employee'):
        if not is_hod(user):
            raise PermissionDenied('Only the routed Head of Department/Section/Unit may act here.')
        hod = routed_hod_for(application)
        if hod is None or hod.id != user.id:
            raise PermissionDenied('This application is not routed to you.')
    elif action in ('verify', 'return_to_hod'):
        if not is_hr_admin(user):
            raise PermissionDenied('Only HR Admin may act here.')
    elif action in ('approve', 'deny'):
        if not is_authorizing_officer(user):
            raise PermissionDenied('Only the Authorizing Officer may act here.')
    elif action in ('generate_pdf',):
        if not (is_hr_admin(user) or is_authorizing_officer(user) or application.employee_id == user.id):
            raise PermissionDenied('You are not authorized to generate this document.')
    elif action == 'resubmit_to_hr':
        if not is_hod(user):
            raise PermissionDenied('Only the routed Head of Department/Section/Unit may act here.')
        hod = routed_hod_for(application)
        if hod is None or hod.id != user.id:
            raise PermissionDenied('This application is not routed to you.')
    elif action == 'complete':
        if not (is_hr_admin(user) or is_authorizing_officer(user)):
            raise PermissionDenied('Only HR Admin or the Authorizing Officer may mark this complete.')
    elif action == 'archive':
        if not is_hr_admin(user):
            raise PermissionDenied('Only HR Admin may archive an application.')
    # route_to_hr / complete-follow-on are system-triggered follow-ons invoked
    # internally right after the human action above.


def _notify(user_id, message, application):
    if user_id is None:
        return
    Notification.objects.create(user_id=user_id, message=message, related_application=application)


def _audit(application, user, action, previous_status, new_status, comments=''):
    AuditLog.objects.create(
        application=application,
        user=user if (user and user.is_authenticated) else None,
        role=getattr(user, 'role', ''),
        action=action,
        previous_status=previous_status,
        new_status=new_status,
        comments=comments,
    )


@transaction.atomic
def perform_transition(application, user, action, comments='', request=None):
    """
    Validate and perform a single named transition, writing an AuditLog row
    and Notification(s). Returns the (locked, refreshed) application.
    Raises PermissionDenied / WorkflowError on failure — nothing is written.
    """
    if action not in TRANSITIONS:
        raise WorkflowError(f'Unknown workflow action: {action}')

    application = type(application).objects.select_for_update().get(pk=application.pk)

    allowed_from, to_status = TRANSITIONS[action]
    if application.status not in allowed_from:
        raise WorkflowError(
            f'Cannot {action} an application in status {application.status}. '
            f'Expected one of: {sorted(allowed_from)}.'
        )

    _check_role_for_action(user, application, action)

    previous_status = application.status
    application.status = to_status
    if action == 'submit':
        application.submitted_at = timezone.now()
    application.save(update_fields=['status', 'submitted_at', 'updated_at'] if action == 'submit' else ['status', 'updated_at'])

    _audit(application, user, action, previous_status, to_status, comments)

    _send_transition_notifications(application, action, user)

    # Keep the employee's leave-balance ledger (spec section 40) live-accurate:
    # every status change moves working days between "pending" and "taken",
    # or removes them entirely (return/deny), so recompute from history.
    from .balances import recalculate_for_application
    recalculate_for_application(application)

    # System-triggered auto-follow-on transitions (routing hops with no human
    # decision attached) happen immediately, inside the same transaction.
    if action == 'recommend':
        application = perform_transition(application, user, 'route_to_hr', comments='auto-route to HR')
    elif action == 'verify':
        application = perform_transition(application, user, 'route_to_authorization', comments='auto-route to Authorizing Officer')
    # resubmit_to_hr / complete / archive are explicitly triggered by a human
    # action (HOD resubmit, HR/AO housekeeping) via their own endpoints, not
    # automatic follow-ons.

    return application


def _send_transition_notifications(application, action, actor):
    employee_id = application.employee_id
    hod = routed_hod_for(application)
    hod_id = hod.id if hod else None

    messages = {
        'submit': [
            (employee_id, f'Your leave application {application.application_number} was submitted.'),
            (hod_id, f'Leave application {application.application_number} is awaiting your recommendation.'),
        ],
        'recommend': [
            (employee_id, f'Your leave application {application.application_number} was recommended by your Head of Department.'),
        ],
        'return_to_employee': [
            (employee_id, f'Your leave application {application.application_number} was returned to you for correction.'),
        ],
        'route_to_hr': [],
        'verify': [
            (employee_id, f'Your leave application {application.application_number} was verified by HR.'),
        ],
        'return_to_hod': [
            (hod_id, f'Leave application {application.application_number} was returned to you by HR for clarification.'),
        ],
        'resubmit_to_hr': [
            (employee_id, f'Your leave application {application.application_number} was resubmitted to HR by your Head of Department.'),
        ],
        'route_to_authorization': [],
        'approve': [
            (employee_id, f'Your leave application {application.application_number} was approved.'),
        ],
        'deny': [
            (employee_id, f'Your leave application {application.application_number} was denied.'),
        ],
        'generate_pdf': [
            (employee_id, f'The PDF for leave application {application.application_number} has been generated.'),
        ],
        'complete': [
            (employee_id, f'Your leave application {application.application_number} has been completed.'),
        ],
        'archive': [],
    }
    for user_id, message in messages.get(action, []):
        _notify(user_id, message, application)
