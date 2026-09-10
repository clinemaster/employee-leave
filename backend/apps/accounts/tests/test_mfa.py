"""
TOTP MFA: setup / verify-setup / disable / login-verify, plus throttling.
"""
import pyotp
import pytest
from rest_framework import status

from apps.accounts import mfa

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _reset_throttle_cache_before_each_test():
    """mfa_verify is throttled at 5/min (THROTTLE_RATE_MFA_VERIFY); several
    tests in this module call verify-setup/login-verify a few times each,
    which would otherwise bleed across tests via the shared throttle cache
    and produce spurious 429s unrelated to what each test is checking."""
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


def _code_for(secret):
    return pyotp.totp.TOTP(secret).now()


def test_setup_generates_valid_secret_and_uri(as_user, employee_user):
    resp = as_user(employee_user).post('/api/auth/mfa/setup/')
    assert resp.status_code == status.HTTP_200_OK, resp.data
    assert 'secret' in resp.data
    assert resp.data['provisioning_uri'].startswith('otpauth://totp/')
    assert resp.data['secret'] in resp.data['provisioning_uri']

    employee_user.refresh_from_db()
    assert employee_user.mfa_enabled is False
    assert employee_user.mfa_secret != ''
    # never stored as plaintext
    assert employee_user.mfa_secret != resp.data['secret']
    assert mfa.decrypt_secret(employee_user.mfa_secret) == resp.data['secret']


def test_verify_setup_with_correct_code_enables_mfa(as_user, employee_user):
    client = as_user(employee_user)
    setup_resp = client.post('/api/auth/mfa/setup/')
    secret = setup_resp.data['secret']

    resp = client.post('/api/auth/mfa/verify-setup/', {'code': _code_for(secret)}, format='json')
    assert resp.status_code == status.HTTP_200_OK, resp.data
    assert resp.data['mfa_enabled'] is True

    employee_user.refresh_from_db()
    assert employee_user.mfa_enabled is True


def test_verify_setup_with_wrong_code_fails_and_does_not_enable(as_user, employee_user):
    client = as_user(employee_user)
    client.post('/api/auth/mfa/setup/')

    resp = client.post('/api/auth/mfa/verify-setup/', {'code': '000000'}, format='json')
    assert resp.status_code == status.HTTP_400_BAD_REQUEST

    employee_user.refresh_from_db()
    assert employee_user.mfa_enabled is False


def test_verify_setup_without_prior_setup_fails(as_user, employee_user):
    resp = as_user(employee_user).post('/api/auth/mfa/verify-setup/', {'code': '123456'}, format='json')
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


def _enable_mfa(secret_holder_client):
    setup_resp = secret_holder_client.post('/api/auth/mfa/setup/')
    secret = setup_resp.data['secret']
    verify_resp = secret_holder_client.post('/api/auth/mfa/verify-setup/', {'code': _code_for(secret)}, format='json')
    assert verify_resp.status_code == status.HTTP_200_OK
    return secret


def test_login_with_mfa_enabled_requires_second_step(as_user, api_client, employee_user):
    _enable_mfa(as_user(employee_user))

    resp = api_client.post('/api/auth/login/', {'username': employee_user.username, 'password': 'TestPass123!'}, format='json')
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['mfa_required'] is True
    assert 'mfa_token' in resp.data
    assert 'access' not in resp.data
    assert 'refresh' not in resp.data


def test_login_verify_with_correct_code_succeeds(as_user, api_client, employee_user):
    secret = _enable_mfa(as_user(employee_user))

    login_resp = api_client.post('/api/auth/login/', {'username': employee_user.username, 'password': 'TestPass123!'}, format='json')
    mfa_token = login_resp.data['mfa_token']

    resp = api_client.post('/api/auth/mfa/login-verify/', {'mfa_token': mfa_token, 'code': _code_for(secret)}, format='json')
    assert resp.status_code == status.HTTP_200_OK, resp.data
    assert 'access' in resp.data
    assert 'refresh' in resp.data
    assert resp.data['user']['username'] == employee_user.username


def test_login_verify_with_incorrect_code_fails(as_user, api_client, employee_user):
    _enable_mfa(as_user(employee_user))

    login_resp = api_client.post('/api/auth/login/', {'username': employee_user.username, 'password': 'TestPass123!'}, format='json')
    mfa_token = login_resp.data['mfa_token']

    resp = api_client.post('/api/auth/mfa/login-verify/', {'mfa_token': mfa_token, 'code': '000000'}, format='json')
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


def test_login_verify_replayed_code_fails(as_user, api_client, employee_user):
    secret = _enable_mfa(as_user(employee_user))

    login_resp = api_client.post('/api/auth/login/', {'username': employee_user.username, 'password': 'TestPass123!'}, format='json')
    mfa_token = login_resp.data['mfa_token']
    code = _code_for(secret)

    first = api_client.post('/api/auth/mfa/login-verify/', {'mfa_token': mfa_token, 'code': code}, format='json')
    assert first.status_code == status.HTTP_200_OK

    # Same code, same (still-valid) window — must be rejected as a replay.
    login_resp2 = api_client.post('/api/auth/login/', {'username': employee_user.username, 'password': 'TestPass123!'}, format='json')
    mfa_token2 = login_resp2.data['mfa_token']
    second = api_client.post('/api/auth/mfa/login-verify/', {'mfa_token': mfa_token2, 'code': code}, format='json')
    assert second.status_code == status.HTTP_400_BAD_REQUEST


def test_login_verify_with_invalid_token_fails(api_client):
    resp = api_client.post('/api/auth/mfa/login-verify/', {'mfa_token': 'not-a-real-token', 'code': '123456'}, format='json')
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


def test_disable_requires_correct_password(as_user, employee_user):
    client = as_user(employee_user)
    _enable_mfa(client)

    resp = client.post('/api/auth/mfa/disable/', {'password': 'wrong-password'}, format='json')
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    employee_user.refresh_from_db()
    assert employee_user.mfa_enabled is True

    resp = client.post('/api/auth/mfa/disable/', {'password': 'TestPass123!'}, format='json')
    assert resp.status_code == status.HTTP_200_OK
    employee_user.refresh_from_db()
    assert employee_user.mfa_enabled is False
    assert employee_user.mfa_secret == ''


def test_mfa_endpoints_are_self_service_only(as_user, employee_user, other_employee_user):
    """Setup/verify/disable always act on request.user — there is no way
    to target another user's account via these endpoints (no user-id param
    accepted anywhere in the request body)."""
    client = as_user(employee_user)
    resp = client.post('/api/auth/mfa/setup/', {'user': other_employee_user.id}, format='json')
    assert resp.status_code == status.HTTP_200_OK

    employee_user.refresh_from_db()
    other_employee_user.refresh_from_db()
    assert employee_user.mfa_secret != ''
    assert other_employee_user.mfa_secret == ''


def test_setup_requires_authentication(api_client):
    resp = api_client.post('/api/auth/mfa/setup/')
    assert resp.status_code == status.HTTP_401_UNAUTHORIZED


def _reset_throttle_cache():
    from django.core.cache import cache
    cache.clear()


@pytest.fixture
def _low_mfa_verify_rate(settings):
    from rest_framework.throttling import SimpleRateThrottle

    rf = dict(settings.REST_FRAMEWORK)
    rates = dict(rf.get('DEFAULT_THROTTLE_RATES', {}))
    rates['mfa_verify'] = '3/min'
    rf['DEFAULT_THROTTLE_RATES'] = rates
    settings.REST_FRAMEWORK = rf

    original_rates = SimpleRateThrottle.THROTTLE_RATES
    SimpleRateThrottle.THROTTLE_RATES = rates
    _reset_throttle_cache()
    yield
    SimpleRateThrottle.THROTTLE_RATES = original_rates
    _reset_throttle_cache()


def test_verify_setup_throttles_after_repeated_bad_codes(as_user, employee_user, _low_mfa_verify_rate):
    client = as_user(employee_user)
    client.post('/api/auth/mfa/setup/')

    statuses = []
    for _ in range(5):
        resp = client.post('/api/auth/mfa/verify-setup/', {'code': '000000'}, format='json')
        statuses.append(resp.status_code)

    assert status.HTTP_429_TOO_MANY_REQUESTS in statuses


def test_login_verify_throttles_after_repeated_bad_codes(as_user, api_client, employee_user, _low_mfa_verify_rate):
    secret = _enable_mfa(as_user(employee_user))
    login_resp = api_client.post('/api/auth/login/', {'username': employee_user.username, 'password': 'TestPass123!'}, format='json')
    mfa_token = login_resp.data['mfa_token']

    statuses = []
    for _ in range(5):
        resp = api_client.post('/api/auth/mfa/login-verify/', {'mfa_token': mfa_token, 'code': '000000'}, format='json')
        statuses.append(resp.status_code)

    assert status.HTTP_429_TOO_MANY_REQUESTS in statuses
    # sanity: the correct code isn't accidentally rejected pre-throttle
    assert status.HTTP_400_BAD_REQUEST in statuses
