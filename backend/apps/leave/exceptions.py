from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    """Default DRF handling is fine; this hook exists so we can extend error
    shape consistently later (e.g. adding an `error_code`) without changing
    every view."""
    response = exception_handler(exc, context)
    if response is not None and isinstance(response.data, dict) and 'detail' not in response.data:
        # Leave field-error dicts (e.g. serializer validation) as-is.
        pass
    return response
