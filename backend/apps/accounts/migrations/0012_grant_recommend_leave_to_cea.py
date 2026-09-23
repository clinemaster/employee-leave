# Generated manually — CHIEF_EXTERNAL_AUDITOR now acts as "head of work
# station" for employees at their work station whose department/division
# has no active head (see apps.leave.permissions.matched_cea_for), so needs
# the same RECOMMEND_LEAVE permission HEAD_OF_DEPARTMENT/DAG/HEAD_OF_SECTION
# already have.

from django.db import migrations


def grant(apps, schema_editor):
    RolePermission = apps.get_model('accounts', 'RolePermission')
    RolePermission.objects.get_or_create(role='CHIEF_EXTERNAL_AUDITOR', permission='RECOMMEND_LEAVE')


def revoke(apps, schema_editor):
    RolePermission = apps.get_model('accounts', 'RolePermission')
    RolePermission.objects.filter(role='CHIEF_EXTERNAL_AUDITOR', permission='RECOMMEND_LEAVE').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0011_add_role_permissions'),
    ]

    operations = [
        migrations.RunPython(grant, revoke),
    ]
