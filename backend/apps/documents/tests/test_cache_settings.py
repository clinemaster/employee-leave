"""
Verifies the CACHES selection logic in naot_leave/settings.py: Redis (via
django-redis) when REDIS_URL is set, Django's local-memory cache when it's
unset. This tests the settings module's logic directly (by reloading it with
different env vars) rather than requiring a live Redis instance — the test
suite must not depend on Redis being reachable.
"""
import importlib
import os

import pytest


def _reload_settings_with_env(monkeypatch, redis_url):
    if redis_url is None:
        monkeypatch.delenv('REDIS_URL', raising=False)
    else:
        monkeypatch.setenv('REDIS_URL', redis_url)
    # decouple caches os.environ lookups internally via its own Config, but
    # since this project's `config()` shim/python-decouple reads from
    # os.environ (AutoConfig picks up .env + process env), reloading the
    # settings module re-evaluates the REDIS_URL branch with the current
    # environment.
    from naot_leave import settings as settings_module
    importlib.reload(settings_module)
    return settings_module


@pytest.fixture
def restore_settings():
    """Reload the real settings module back to its normal state afterwards
    so we don't leak a reloaded module into other tests."""
    yield
    from naot_leave import settings as settings_module
    importlib.reload(settings_module)


def test_caches_uses_redis_when_redis_url_set(monkeypatch, restore_settings):
    settings_module = _reload_settings_with_env(monkeypatch, 'redis://localhost:6379/1')
    assert settings_module.CACHES['default']['BACKEND'] == 'django_redis.cache.RedisCache'
    assert settings_module.CACHES['default']['LOCATION'] == 'redis://localhost:6379/1'


def test_caches_uses_locmem_when_redis_url_unset(monkeypatch, restore_settings):
    settings_module = _reload_settings_with_env(monkeypatch, None)
    assert settings_module.CACHES['default']['BACKEND'] == 'django.core.cache.backends.locmem.LocMemCache'
