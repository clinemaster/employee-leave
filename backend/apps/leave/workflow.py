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
       (or PENDING_CAG_REVIEW / PENDING_AAG_REVIEW -- see below)
  PENDING_HOD_REVIEW
    -> HOD_RECOMMENDED (HOD recommends/declines, Section B1)
    -> RETURNED_TO_EMPLOYEE (HOD returns for correction)
  HOD_RECOMMENDED
    -> PENDING_HR_REVIEW (system, routes to HR)
  PENDING_AAG_REVIEW
    -> AAG_RECOMMENDED (AAG recommends, stands in for Section B1)
    -> DENIED (AAG rejects, terminal)
  AAG_RECOMMENDED
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

from apps.accounts.models import Role, User
from apps.audit.models import AuditLog
from apps.notifications.emails import send_workflow_email
from apps.notifications.models import Notification

from .models import ApplicationStatus as S
from .permissions import (
    effective_reviewer_for, is_aag_reviewer, is_authorizing_officer, is_cag_reviewer,
    is_hr_admin, is_system_admin, matched_aag_for, needs_aag_review, needs_cag_review,
)

# Maps action name -> (from_statuses, to_status). `submit` is special-cased in
# perform_transition: its target status depends on whether the applicant's
# role requires CAG review (see needs_cag_review) — PENDING_CAG_REVIEW
# instead of PENDING_HOD_REVIEW — or, failing that, whether the applicant
# belongs to a Division (see needs_aag_review) — PENDING_AAG_REVIEW. For
# those applicants CAG/AAG review stands in for the HOD stage entirely (no
# HOD box in that track), so `cag_review`/`aag_review` (recommend) reuse the
# same 'route_to_hr' auto-follow-on as the normal HOD 'recommend', and
# `cag_reject`/`aag_reject` end the workflow the same way `deny` does — see
# spec: employees holding AUTHORIZING_OFFICER/HEAD_OF_DEPARTMENT/DAG/AAG/
# CHIEF_ACCOUNTANT/DAHRM/ADA/CHIEF_EXTERNAL_AUDITOR must never be able to
# reach HR or the Authorizing Officer without a CAG recommendation first, and
# Division employees (outside that set) must never bypass AAG.
TRANSITIONS = {
    'submit': ({S.DRAFT, S.RETURNED_TO_EMPLOYEE}, S.PENDING_HOD_REVIEW),
    'recommend': ({S.PENDING_HOD_REVIEW}, S.HOD_RECOMMENDED),
    'return_to_employee': ({S.PENDING_HOD_REVIEW}, S.RETURNED_TO_EMPLOYEE),
    'cag_review': ({S.PENDING_CAG_REVIEW}, S.CAG_RECOMMENDED),
    'cag_reject': ({S.PENDING_CAG_REVIEW}, S.DENIED),
    'aag_review': ({S.PENDING_AAG_REVIEW}, S.AAG_RECOMMENDED),
    'aag_reject': ({S.PENDING_AAG_REVIEW}, S.DENIED),
    'route_to_hr': ({S.HOD_RECOMMENDED, S.CAG_RECOMMENDED, S.AAG_RECOMMENDED}, S.PENDING_HR_REVIEW),
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


def _cag_reviewers():
    from django.db.models import Q
    return User.objects.filter(
        Q(role=Role.CAG) | Q(additional_roles__role=Role.CAG), is_active=True
    ).distinct()


class WorkflowError(ValidationError):
    pass


def _check_role_for_action(user, application, action):
    if is_system_admin(user):
        return  # system admins may operate the workflow for support/testing
    if action in ('submit',):
        if application.employee_id != user.id:
            raise PermissionDenied('Only the applicant may submit this application.')
        if needs_cag_review(application.employee):
            if not _cag_reviewers().exists():
                # Same "would get stuck with no one able to act" guard as the
                # HOD case below, for the CAG track: PENDING_CAG_REVIEW only
                # accepts cag_review/cag_reject, both gated on is_cag_reviewer.
                raise WorkflowError(
                    'No CAG reviewer is currently available to review this application. '
                    'Ask a SYSTEM_ADMIN to assign a CAG reviewer before submitting.'
                )
        elif needs_aag_review(application.employee):
            if matched_aag_for(application.employee) is None:
                # Same guard, for the AAG track: PENDING_AAG_REVIEW only
                # accepts aag_review/aag_reject, both gated on being the AAG
                # matched to this employee's specific division.
                raise WorkflowError(
                    'No AAG reviewer is currently assigned to your division. '
                    'Ask a SYSTEM_ADMIN to assign one before submitting.'
                )
        elif effective_reviewer_for(application) is None:
            # Without a routed OR fallback reviewer, the application would
            # move to PENDING_HOD_REVIEW with no one able to act on it
            # (recommend/return both require one) — stuck forever with no
            # visible reason why. Reject at submit time instead, with a
            # message that tells the applicant/admin what to fix.
            raise WorkflowError(
                'You have no assigned Head of Department/Division/Section to review this '
                'application, and no HR Admin or Authorizing Officer is available as a '
                'fallback. Ask a SYSTEM_ADMIN to assign a reviewer before submitting.'
            )
    elif action in ('recommend', 'return_to_employee'):
        reviewer = effective_reviewer_for(application)
        if reviewer is None or reviewer.id != user.id:
            raise PermissionDenied('This application is not routed to you.')
    elif action in ('cag_review', 'cag_reject'):
        if not is_cag_reviewer(user):
            raise PermissionDenied('Only a CAG reviewer may act here.')
    elif action in ('aag_review', 'aag_reject'):
        if not is_aag_reviewer(user):
            raise PermissionDenied('Only an AAG reviewer may act here.')
        matched = matched_aag_for(application.employee)
        if matched is None or matched.id != user.id:
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
        reviewer = effective_reviewer_for(application)
        if reviewer is None or reviewer.id != user.id:
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
    if action == 'submit':
        # Route to CAG instead of the normal HOD stage for applicants whose
        # role requires it (see needs_cag_review) — CAG stands in for HOD for
        # that track, so it must never fall through to PENDING_HOD_REVIEW.
        # Failing that, Division employees (see needs_aag_review) route to
        # AAG instead of the normal HOD stage.
        if needs_cag_review(application.employee):
            to_status = S.PENDING_CAG_REVIEW
        elif needs_aag_review(application.employee):
            to_status = S.PENDING_AAG_REVIEW
        else:
            to_status = S.PENDING_HOD_REVIEW
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

    _send_transition_notifications(application, action, user, comments)

    # Keep the employee's leave-balance ledger (spec section 40) live-accurate:
    # every status change moves working days between "pending" and "taken",
    # or removes them entirely (return/deny), so recompute from history.
    from .balances import recalculate_for_application
    recalculate_for_application(application)

    # System-triggered auto-follow-on transitions (routing hops with no human
    # decision attached) happen immediately, inside the same transaction.
    if action in ('recommend', 'cag_review', 'aag_review'):
        application = perform_transition(application, user, 'route_to_hr', comments='auto-route to HR')
    elif action == 'verify':
        application = perform_transition(application, user, 'route_to_authorization', comments='auto-route to Authorizing Officer')
    # resubmit_to_hr / complete / archive are explicitly triggered by a human
    # action (HOD resubmit, HR/AO housekeeping) via their own endpoints, not
    # automatic follow-ons.

    return application


def _hr_admins():
    from django.db.models import Q
    return User.objects.filter(
        Q(role=Role.HR_ADMIN) | Q(additional_roles__role=Role.HR_ADMIN), is_active=True
    ).distinct()


def _authorizing_officers():
    from django.db.models import Q
    return User.objects.filter(
        Q(role=Role.AUTHORIZING_OFFICER) | Q(additional_roles__role=Role.AUTHORIZING_OFFICER), is_active=True
    ).distinct()


def _send_transition_notifications(application, action, actor, comments=''):
    employee_id = application.employee_id
    employee = application.employee
    routed_to_cag = needs_cag_review(employee)
    routed_to_aag = (not routed_to_cag) and needs_aag_review(employee)
    if routed_to_cag:
        hod = None
    elif routed_to_aag:
        hod = matched_aag_for(employee)
    else:
        hod = effective_reviewer_for(application)
    hod_id = hod.id if hod else None

    submit_messages = [
        (employee_id, f'Your leave application {application.application_number} was submitted.'),
    ]
    if routed_to_cag:
        submit_messages.append(
            ('__CAG__', f'New leave application {application.application_number} is awaiting your CAG review.')
        )
    elif routed_to_aag:
        submit_messages.append(
            (hod_id, f'Leave application {application.application_number} is awaiting your AAG review.')
        )
    else:
        submit_messages.append(
            (hod_id, f'Leave application {application.application_number} is awaiting your recommendation.')
        )

    messages = {
        'submit': submit_messages,
        'recommend': [
            (employee_id, f'Your leave application {application.application_number} was recommended by your Head of Department.'),
        ],
        'return_to_employee': [
            (employee_id, f'Your leave application {application.application_number} was returned to you for correction.'),
        ],
        'cag_review': [
            (employee_id, f'Your leave application {application.application_number} has been recommended by CAG and forwarded to HR.'),
        ],
        'cag_reject': [
            (employee_id, f'Your leave application {application.application_number} has been rejected by CAG. Reason: {comments}'),
        ],
        'aag_review': [
            (employee_id, f'Your leave application {application.application_number} has been recommended by AAG and forwarded to HR.'),
        ],
        'aag_reject': [
            (employee_id, f'Your leave application {application.application_number} has been rejected by AAG. Reason: {comments}'),
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
        if user_id == '__CAG__':
            for cag_user in _cag_reviewers():
                _notify(cag_user.id, message, application)
            continue
        _notify(user_id, message, application)

    _send_transition_emails(application, action, employee, hod, routed_to_cag, routed_to_aag, comments)


def _send_transition_emails(application, action, employee, hod, routed_to_cag=False, routed_to_aag=False, comments=''):
    """
    Real email delivery, per spec section 29's routing: employee submits ->
    notify HOD (or, for the CAG track, all CAG reviewers; or, for the AAG
    track, the AAG matched to the employee's division); HOD/CAG/AAG
    recommends -> notify HR; HR verifies -> notify AO; AO approves -> notify
    Employee; application completed -> notify Employee+HR. Queued via
    transaction.on_commit so a slow/broken SMTP server never blocks or
    breaks the workflow transition itself (see apps/notifications/emails.py).
    """
    ctx = {
        'application_number': application.application_number,
        'employee_name': getattr(employee, 'full_name', None) or employee.username,
        'comments': comments,
    }

    if action == 'submit':
        send_workflow_email('submit_employee', employee, ctx)
        if routed_to_cag:
            for cag_user in _cag_reviewers():
                send_workflow_email('submit_cag', cag_user, ctx)
        elif routed_to_aag:
            if hod is not None:
                send_workflow_email('submit_aag', hod, ctx)
        else:
            send_workflow_email('submit_hod', hod, ctx)
    elif action == 'recommend':
        send_workflow_email('recommend', employee, ctx)
    elif action == 'return_to_employee':
        send_workflow_email('return_to_employee', employee, ctx)
    elif action == 'cag_review':
        send_workflow_email('cag_review', employee, ctx)
    elif action == 'cag_reject':
        send_workflow_email('cag_reject', employee, ctx)
    elif action == 'aag_review':
        send_workflow_email('aag_review', employee, ctx)
    elif action == 'aag_reject':
        send_workflow_email('aag_reject', employee, ctx)
    elif action == 'route_to_hr':
        # HOD recommended (or CAG recommended) -> notify HR (all active HR_ADMIN users).
        for hr_user in _hr_admins():
            send_workflow_email('route_to_hr_hr', hr_user, ctx)
    elif action == 'verify':
        send_workflow_email('verify', employee, ctx)
    elif action == 'return_to_hod':
        send_workflow_email('return_to_hod', hod, ctx)
    elif action == 'resubmit_to_hr':
        send_workflow_email('resubmit_to_hr', employee, ctx)
    elif action == 'route_to_authorization':
        # HR verified -> notify AO (all active AUTHORIZING_OFFICER users).
        for ao_user in _authorizing_officers():
            send_workflow_email('route_to_authorization_ao', ao_user, ctx)
    elif action == 'approve':
        send_workflow_email('approve', employee, ctx)
    elif action == 'deny':
        send_workflow_email('deny', employee, ctx)
    elif action == 'complete':
        send_workflow_email('complete_employee', employee, ctx)
        for hr_user in _hr_admins():
            send_workflow_email('complete_hr', hr_user, ctx)
