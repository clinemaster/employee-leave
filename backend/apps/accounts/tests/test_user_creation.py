"""
Regression coverage for SYSTEM_ADMIN creating a new user via POST
/api/users/ — previously broken two ways:
  1. UserWriteSerializer requires `check_number` (unique, non-nullable on
     the model) but the admin UI form didn't collect it, so every create
     400'd.
  2. Even with check_number supplied, omitting a password 500'd:
     User.objects.make_random_password() was removed in Django 5.1+.
"""
import pytest


@pytest.mark.django_db
def test_sysadmin_can_create_user_with_check_number_and_no_password(as_user, sysadmin_user, department):
    client = as_user(sysadmin_user)
    response = client.post('/api/users/', {
        'username': 'newhire',
        'full_name': 'New Hire',
        'check_number': 'NH-001',
        'email': 'newhire@naot.go.tz',
        'role': 'EMPLOYEE',
        'department': department.id,
    }, format='json')
    assert response.status_code == 201, response.data
    assert response.data['check_number'] == 'NH-001'

    from apps.accounts.models import User
    user = User.objects.get(username='newhire')
    assert user.has_usable_password()


@pytest.mark.django_db
def test_sysadmin_can_create_user_with_explicit_password(as_user, sysadmin_user, department):
    client = as_user(sysadmin_user)
    response = client.post('/api/users/', {
        'username': 'newhire2',
        'full_name': 'New Hire Two',
        'check_number': 'NH-002',
        'email': 'newhire2@naot.go.tz',
        'role': 'EMPLOYEE',
        'password': 'TempPass123!',
        'department': department.id,
    }, format='json')
    assert response.status_code == 201, response.data

    from apps.accounts.models import User
    user = User.objects.get(username='newhire2')
    assert user.check_password('TempPass123!')


@pytest.mark.django_db
def test_create_user_without_check_number_is_rejected_with_clear_error(as_user, sysadmin_user):
    client = as_user(sysadmin_user)
    response = client.post('/api/users/', {
        'username': 'nocheck',
        'full_name': 'No Check',
        'email': 'nocheck@naot.go.tz',
        'role': 'EMPLOYEE',
    }, format='json')
    assert response.status_code == 400
    assert 'check_number' in response.data


@pytest.mark.django_db
def test_non_admin_cannot_create_user(as_user, employee_user):
    client = as_user(employee_user)
    response = client.post('/api/users/', {
        'username': 'sneaky',
        'full_name': 'Sneaky',
        'check_number': 'SNK-001',
        'role': 'EMPLOYEE',
    }, format='json')
    assert response.status_code == 403
