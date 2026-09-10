"""
Guards against the OpenAPI schema silently regressing (e.g. a future view
losing its serializer_class/@extend_schema and getting dropped from the
docs, or get_queryset breaking again for the schema generator's anonymous
request) — see backend/API.md's "Interactive API docs" section.
"""
import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_schema_generates_without_warnings_or_errors():
    from drf_spectacular.generators import SchemaGenerator
    from drf_spectacular.validation import validate_schema

    generator = SchemaGenerator()
    schema = generator.get_schema(request=None, public=True)
    validate_schema(schema)  # raises if the generated schema is invalid OpenAPI

    # A handful of endpoints that previously required extend_schema/serializer
    # fixes to appear at all — assert they're still present.
    paths = schema['paths']
    assert '/api/auth/login/' in paths
    assert '/api/auth/mfa/setup/' in paths
    assert '/api/auth/mfa/login-verify/' in paths
    assert '/api/dashboard-stats/' in paths
    assert '/api/reports/leave-applications/' in paths
    assert '/api/working-days-preview/' in paths
    assert '/api/leave-applications/' in paths
    assert '/api/notifications/' in paths


def test_docs_endpoints_are_publicly_accessible():
    """Swagger UI / ReDoc / raw schema should not require login."""
    client = APIClient()
    assert client.get('/api/schema/').status_code == 200
    assert client.get('/api/docs/').status_code == 200
    assert client.get('/api/redoc/').status_code == 200
