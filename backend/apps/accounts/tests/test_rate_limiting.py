"""
Login throttling (brute-force protection). Uses `settings.REST_FRAMEWORK`
override to a small rate so the test doesn't need to fire 300+ requests.
"""
import pytest
from rest_framework import status
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def _reset_throttle_cache():
    from django.core.cache import cache
    cache.clear()


@pytest.fixture(autouse=True)
def _low_login_rate(settings):
    """Override just the 'login' scope to 3/min so the test is fast and
    deterministic, without touching the other throttle scopes.

    DRF's throttle classes read `THROTTLE_RATES` as a *class attribute*
    (`SimpleRateThrottle.THROTTLE_RATES = api_settings.DEFAULT_THROTTLE_RATES`,
    bound once at class-body-evaluation time), not freshly off
    `api_settings`/Django settings per request — so overriding
    `settings.REST_FRAMEWORK` alone doesn't reliably change throttle
    behavior mid-test-session regardless of the `setting_changed` signal.
    Patch the class attribute directly to keep this order-independent.
    """
    from rest_framework.throttling import SimpleRateThrottle

    rf = dict(settings.REST_FRAMEWORK)
    rates = dict(rf.get('DEFAULT_THROTTLE_RATES', {}))
    rates['login'] = '3/min'
    rf['DEFAULT_THROTTLE_RATES'] = rates
    settings.REST_FRAMEWORK = rf

    original_rates = SimpleRateThrottle.THROTTLE_RATES
    SimpleRateThrottle.THROTTLE_RATES = rates
    _reset_throttle_cache()
    yield
    SimpleRateThrottle.THROTTLE_RATES = original_rates
    _reset_throttle_cache()


def test_login_endpoint_throttles_after_limit(make_user):
    make_user(username='bruteforce_target', check_number='BF-001')
    client = APIClient()

    statuses = []
    for _ in range(5):
        resp = client.post('/api/auth/login/', {'username': 'bruteforce_target', 'password': 'wrong'}, format='json')
        statuses.append(resp.status_code)

    # First few attempts are evaluated normally (401 for bad credentials);
    # once the scope's rate is exceeded, DRF returns 429 regardless of
    # credentials correctness.
    assert status.HTTP_429_TOO_MANY_REQUESTS in statuses


def test_login_succeeds_within_rate_limit(make_user):
    user = make_user(username='normal_login', check_number='NL-001')
    client = APIClient()
    resp = client.post('/api/auth/login/', {'username': 'normal_login', 'password': 'TestPass123!'}, format='json')
    assert resp.status_code == status.HTTP_200_OK
    assert 'access' in resp.data
