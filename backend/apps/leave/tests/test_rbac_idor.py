"""
RBAC + IDOR tests: each role may only edit its own section, and a user not
authorized for an application cannot fetch/act on it (403/404, never 500).
"""
import pytest

pytestmark = pytest.mark.django_db


def _detail_url(app_id):
    return f'/api/leave-applications/{app_id}/'


def test_employee_can_edit_section_a(as_user, draft_application, employee_user):
    resp = as_user(employee_user).patch(_detail_url(draft_application.id), {'designation': 'Auditor II'}, format='json')
    assert resp.status_code == 200, resp.data
    draft_application.refresh_from_db()
    assert draft_application.designation == 'Auditor II'


def test_employee_cannot_edit_recommendation_field(as_user, draft_application, employee_user):
    resp = as_user(employee_user).patch(
        _detail_url(draft_application.id), {'recommendation': {'recommended': True}}, format='json'
    )
    assert resp.status_code == 403, resp.data


def test_employee_cannot_edit_other_employees_application(as_user, draft_application, other_employee_user):
    resp = as_user(other_employee_user).patch(
        _detail_url(draft_application.id), {'designation': 'Hacker'}, format='json'
    )
    assert resp.status_code in (403, 404), resp.data


def test_idor_other_employee_cannot_retrieve(as_user, draft_application, other_employee_user):
    resp = as_user(other_employee_user).get(_detail_url(draft_application.id))
    assert resp.status_code == 404, resp.data


def test_idor_unrouted_hod_cannot_retrieve(as_user, draft_application, other_hod_user):
    """other_hod_user is not the manager of draft_application's employee."""
    resp = as_user(other_hod_user).get(_detail_url(draft_application.id))
    assert resp.status_code == 404, resp.data


def test_routed_hod_can_retrieve(as_user, draft_application, hod_user):
    resp = as_user(hod_user).get(_detail_url(draft_application.id))
    assert resp.status_code == 200, resp.data


def test_hr_can_retrieve_any_application(as_user, draft_application, hr_user):
    resp = as_user(hr_user).get(_detail_url(draft_application.id))
    assert resp.status_code == 200, resp.data


def test_ao_can_retrieve_any_application(as_user, draft_application, ao_user):
    resp = as_user(ao_user).get(_detail_url(draft_application.id))
    assert resp.status_code == 200, resp.data


@pytest.mark.xfail(
    reason=(
        'KNOWN SOURCE GAP (not fixed here per task scope): API.md says HR_ADMIN is '
        '"not handled by this endpoint" for PATCH, but assert_can_edit_fields() allows '
        'the key "hr_review" through for HR_ADMIN (it is in SECTION_B2_FIELDS), and the '
        'view only blocks the request based on application.status, not role. Since '
        'LeaveApplicationWriteSerializer has no hr_review field, the PATCH silently '
        'no-ops and returns 200 instead of 403/400 for a DRAFT-status application.'
    ),
    strict=True,
)
def test_hr_cannot_edit_via_patch_endpoint(as_user, draft_application, hr_user):
    """HR must use /verify/ or /return/, not PATCH — PATCH should reject any field for them."""
    resp = as_user(hr_user).patch(_detail_url(draft_application.id), {'hr_review': {'verified': True}}, format='json')
    assert resp.status_code == 403, resp.data


@pytest.mark.xfail(
    reason=(
        'KNOWN SOURCE GAP (not fixed here per task scope): same issue as '
        'test_hr_cannot_edit_via_patch_endpoint but for AUTHORIZING_OFFICER/Section C.'
    ),
    strict=True,
)
def test_ao_cannot_edit_via_patch_endpoint(as_user, draft_application, ao_user):
    resp = as_user(ao_user).patch(_detail_url(draft_application.id), {'approval': {'approved': True}}, format='json')
    assert resp.status_code == 403, resp.data


def test_hod_cannot_edit_section_a_via_patch(as_user, draft_application, hod_user):
    resp = as_user(hod_user).patch(_detail_url(draft_application.id), {'designation': 'Changed'}, format='json')
    assert resp.status_code == 403, resp.data


def test_unauthenticated_request_rejected(api_client, draft_application):
    resp = api_client.get(_detail_url(draft_application.id))
    assert resp.status_code == 401


def test_idor_action_endpoints_never_500(as_user, draft_application, other_employee_user, other_hod_user):
    """Unauthorized actors hitting workflow actions on an app they can't see never 500."""
    for endpoint in ('submit', 'recommend', 'return', 'verify', 'approve', 'deny'):
        resp = as_user(other_employee_user).post(f'/api/leave-applications/{draft_application.id}/{endpoint}/')
        assert resp.status_code < 500, (endpoint, resp.status_code, resp.data)
        resp = as_user(other_hod_user).post(f'/api/leave-applications/{draft_application.id}/{endpoint}/')
        assert resp.status_code < 500, (endpoint, resp.status_code, resp.data)


def test_nonexistent_application_returns_404_not_500(as_user, employee_user):
    resp = as_user(employee_user).get('/api/leave-applications/999999/')
    assert resp.status_code == 404
