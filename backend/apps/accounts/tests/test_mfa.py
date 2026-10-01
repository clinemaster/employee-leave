"""
TOTP MFA: login challenge / login-verify, plus throttling.
"""
import pyotp
import pytest
from rest_framework import status

from apps.accounts import mfa

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _reset_throttle_cache_before_each_test():
    """mfa_verify is throttled at 5/min (THROTTLE_RATE_MFA_VERIFY); several
    tests in this module call login-verify a few times each,
    which would otherwise bleed across tests via the shared throttle cache
    and produce spurious 429s unrelated to what each test is checking."""
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


def _code_for(secret):
    return pyotp.totp.TOTP(secret).now()


def _enable_mfa(user):
    """Turns MFA on directly in the DB (there is no setup endpoint)."""
    secret = mfa.generate_secret()
    user.mfa_secret = mfa.encrypt_secret(secret)
    user.mfa_enabled = True
    user.save(update_fields=['mfa_secret', 'mfa_enabled'])
    return secret


def test_login_with_mfa_enabled_requires_second_step(api_client, employee_user):
    _enable_mfa(employee_user)

    resp = api_client.post('/api/auth/login/', {'username': employee_user.username, 'password': 'TestPass123!'}, format='json')
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['mfa_required'] is True
    assert 'mfa_token' in resp.data
    assert 'access' not in resp.data
    assert 'refresh' not in resp.data


def test_login_verify_with_correct_code_succeeds(api_client, employee_user):
    secret = _enable_mfa(employee_user)

    login_resp = api_client.post('/api/auth/login/', {'username': employee_user.username, 'password': 'TestPass123!'}, format='json')
    mfa_token = login_resp.data['mfa_token']

    resp = api_client.post('/api/auth/mfa/login-verify/', {'mfa_token': mfa_token, 'code': _code_for(secret)}, format='json')
    assert resp.status_code == status.HTTP_200_OK, resp.data
    assert 'access' in resp.data
    assert 'refresh' in resp.data
    assert resp.data['user']['username'] == employee_user.username


def test_login_verify_with_incorrect_code_fails(api_client, employee_user):
    _enable_mfa(employee_user)

    login_resp = api_client.post('/api/auth/login/', {'username': employee_user.username, 'password': 'TestPass123!'}, format='json')
    mfa_token = login_resp.data['mfa_token']

    resp = api_client.post('/api/auth/mfa/login-verify/', {'mfa_token': mfa_token, 'code': '000000'}, format='json')
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


def test_login_verify_replayed_code_fails(api_client, employee_user):
    secret = _enable_mfa(employee_user)

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


def test_login_verify_throttles_after_repeated_bad_codes(api_client, employee_user, _low_mfa_verify_rate):
    secret = _enable_mfa(employee_user)
    login_resp = api_client.post('/api/auth/login/', {'username': employee_user.username, 'password': 'TestPass123!'}, format='json')
    mfa_token = login_resp.data['mfa_token']

    statuses = []
    for _ in range(5):
        resp = api_client.post('/api/auth/mfa/login-verify/', {'mfa_token': mfa_token, 'code': '000000'}, format='json')
        statuses.append(resp.status_code)

    assert status.HTTP_429_TOO_MANY_REQUESTS in statuses
    # sanity: the correct code isn't accidentally rejected pre-throttle
    assert status.HTTP_400_BAD_REQUEST in statuses
