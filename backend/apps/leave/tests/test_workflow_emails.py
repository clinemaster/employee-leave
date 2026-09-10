"""
Real email sending on workflow transitions (spec section 29 routing), on top
of the existing in-app Notification rows. Uses Django's locmem test email
backend (django.core.mail.outbox) rather than a live SMTP server.

Email sends are queued via transaction.on_commit (see
apps/notifications/emails.py) so they survive a SMTP failure without
rolling back the workflow transition. pytest-django wraps each test in an
uncommitted atomic transaction by default, so on_commit callbacks never
naturally fire — we use the `django_capture_on_commit_callbacks` fixture to
capture and execute them explicitly, same as Django's own test utilities.
"""
from unittest.mock import patch

import pytest

from apps.leave.models import ApplicationStatus as S
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db


def _url(app_id, action=None):
    base = f'/api/leave-applications/{app_id}/'
    return base if action is None else base + f'{action}/'


def test_submit_emails_employee_and_hod(
    mailoutbox, django_capture_on_commit_callbacks, as_user, draft_application, employee_user, hod_user,
):
    client = as_user(employee_user)
    with django_capture_on_commit_callbacks(execute=True):
        resp = client.post(_url(draft_application.id, 'submit'))
    assert resp.status_code == 200, resp.data

    recipients = {m.to[0] for m in mailoutbox}
    assert employee_user.official_email in recipients
    assert hod_user.official_email in recipients

    for m in mailoutbox:
        if m.to == [employee_user.official_email]:
            assert draft_application.application_number in m.subject
        if m.to == [hod_user.official_email]:
            assert draft_application.application_number in m.subject


def test_full_happy_path_sends_emails_to_hr_and_ao(
    mailoutbox, django_capture_on_commit_callbacks, as_user, draft_application,
    employee_user, hod_user, hr_user, ao_user,
):
    with django_capture_on_commit_callbacks(execute=True):
        as_user(employee_user).post(_url(draft_application.id, 'submit'))
    with django_capture_on_commit_callbacks(execute=True):
        resp = as_user(hod_user).post(_url(draft_application.id, 'recommend'), {'decision': True, 'comments': 'ok'})
    assert resp.status_code == 200, resp.data
    # recommend auto-routes to HR -> HR should be emailed
    hr_emails = [m for m in mailoutbox if m.to == [hr_user.official_email]]
    assert hr_emails, [m.to for m in mailoutbox]
    assert draft_application.application_number in hr_emails[0].subject

    with django_capture_on_commit_callbacks(execute=True):
        resp = as_user(hr_user).post(_url(draft_application.id, 'verify'), {'decision': True, 'comments': 'balance ok'})
    assert resp.status_code == 200, resp.data
    # verify auto-routes to authorization -> AO should be emailed
    ao_emails = [m for m in mailoutbox if m.to == [ao_user.official_email]]
    assert ao_emails, [m.to for m in mailoutbox]
    assert draft_application.application_number in ao_emails[0].subject

    mailoutbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        resp = as_user(ao_user).post(_url(draft_application.id, 'approve'), {'comments': 'approved'})
    assert resp.status_code == 200, resp.data
    approve_emails = [m for m in mailoutbox if m.to == [employee_user.official_email]]
    assert approve_emails
    assert 'approved' in approve_emails[0].subject.lower() or 'approved' in approve_emails[0].body.lower()


def test_deny_emails_employee(
    mailoutbox, django_capture_on_commit_callbacks, as_user, draft_application,
    employee_user, hod_user, hr_user, ao_user,
):
    with django_capture_on_commit_callbacks(execute=True):
        as_user(employee_user).post(_url(draft_application.id, 'submit'))
    with django_capture_on_commit_callbacks(execute=True):
        as_user(hod_user).post(_url(draft_application.id, 'recommend'), {'decision': True})
    with django_capture_on_commit_callbacks(execute=True):
        as_user(hr_user).post(_url(draft_application.id, 'verify'), {'decision': True})
    mailoutbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        resp = as_user(ao_user).post(_url(draft_application.id, 'deny'), {'comments': 'not eligible'})
    assert resp.status_code == 200, resp.data
    denied_emails = [m for m in mailoutbox if m.to == [employee_user.official_email]]
    assert denied_emails
    assert draft_application.application_number in denied_emails[0].subject


def test_smtp_failure_does_not_break_transition(
    django_capture_on_commit_callbacks, as_user, draft_application, employee_user, hod_user,
):
    """
    A simulated SMTP failure (send_mail raising) must not roll back the
    workflow transition: status change, AuditLog and Notification rows must
    all still be committed even though email delivery fails.
    """
    client = as_user(employee_user)
    with patch('apps.notifications.emails.send_mail', side_effect=Exception('SMTP server unavailable')):
        with django_capture_on_commit_callbacks(execute=True):
            resp = client.post(_url(draft_application.id, 'submit'))

    assert resp.status_code == 200, resp.data
    draft_application.refresh_from_db()
    assert draft_application.status == S.PENDING_HOD_REVIEW

    notifs = Notification.objects.filter(related_application=draft_application)
    assert notifs.filter(user=employee_user).exists()
    assert notifs.filter(user=hod_user).exists()
