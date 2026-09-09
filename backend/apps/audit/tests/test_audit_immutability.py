"""
Audit log immutability: no update/delete exposed via the API. There is no
registered DRF route for AuditLog at all (only a read-only nested
audit-trail action on LeaveApplication), so this test asserts that surface
directly, plus checks the admin blocks change/delete.
"""
import pytest

from apps.audit.admin import AuditLogAdmin
from apps.audit.models import AuditLog

pytestmark = pytest.mark.django_db


def test_no_direct_auditlog_rest_endpoint(as_user, employee_user):
    """There should be no /api/audit-logs/ (or similar) collection endpoint."""
    for candidate in ('/api/audit-logs/', '/api/audit-log/', '/api/auditlogs/'):
        resp = as_user(employee_user).get(candidate)
        assert resp.status_code == 404, candidate


def test_audit_trail_action_is_read_only(as_user, draft_application, employee_user):
    url = f'/api/leave-applications/{draft_application.id}/audit-trail/'
    resp = as_user(employee_user).get(url)
    assert resp.status_code == 200

    # PUT/PATCH/DELETE are not routed for this action at all.
    for method in ('put', 'patch', 'delete'):
        resp = getattr(as_user(employee_user), method)(url, {}, format='json')
        assert resp.status_code in (403, 404, 405), (method, resp.status_code)


def test_audit_log_created_via_workflow_cannot_be_patched_or_deleted_via_api(
    as_user, draft_application, employee_user
):
    as_user(employee_user).post(f'/api/leave-applications/{draft_application.id}/submit/')
    log = AuditLog.objects.filter(application=draft_application).first()
    assert log is not None

    for candidate in (f'/api/audit-logs/{log.id}/', f'/api/audit-log/{log.id}/'):
        resp = as_user(employee_user).patch(candidate, {'comments': 'tampered'}, format='json')
        assert resp.status_code == 404
        resp = as_user(employee_user).delete(candidate)
        assert resp.status_code == 404


def test_admin_blocks_change_and_delete_permission():
    admin_instance = AuditLogAdmin(AuditLog, None)
    assert admin_instance.has_change_permission(None) is False
    assert admin_instance.has_delete_permission(None) is False
