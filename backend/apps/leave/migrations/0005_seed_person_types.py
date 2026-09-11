from django.db import migrations

PERSON_TYPES = [
    {'name': 'Mimi', 'code': 'SELF', 'sort_order': 1},
    {'name': 'Mke', 'code': 'SPOUSE', 'sort_order': 2},
    {'name': 'Wategemezi', 'code': 'DEPENDANTS', 'sort_order': 3},
    {'name': 'Msaidizi wa Ndani', 'code': 'HOUSE_HELP', 'sort_order': 4},
]


def seed_person_types(apps, schema_editor):
    PersonType = apps.get_model('leave', 'PersonType')
    for entry in PERSON_TYPES:
        PersonType.objects.get_or_create(
            code=entry['code'],
            defaults={'name': entry['name'], 'sort_order': entry['sort_order'], 'is_active': True},
        )


def unseed_person_types(apps, schema_editor):
    PersonType = apps.get_model('leave', 'PersonType')
    PersonType.objects.filter(code__in=[e['code'] for e in PERSON_TYPES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('leave', '0004_persontype_mizigoitem_taxiexpense_travelroute_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_person_types, unseed_person_types),
    ]
