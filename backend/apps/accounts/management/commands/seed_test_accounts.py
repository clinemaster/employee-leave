"""
Seeds a fixed set of test accounts (one per role) plus the minimal
organization structure and leave types needed to exercise the full
workflow locally. Idempotent: safe to re-run.

Usage:
    python manage.py seed_test_accounts
"""
from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Role, User
from apps.leave.models import LeaveType
from apps.organization.models import Department, Designation, Section, WorkStation

TEST_PASSWORD = 'TestPass123!'

# (username, check_number, role, extra_kwargs)
ACCOUNTS = [
    ('sysadmin', 'SA-001', Role.SYSTEM_ADMIN, {'is_staff': True, 'is_superuser': True}),
    ('hod', 'HOD-001', Role.HEAD_OF_DEPARTMENT, {}),
    ('hos', 'HOS-001', Role.HEAD_OF_SECTION, {}),
    ('hr', 'HR-001', Role.HR_ADMIN, {}),
    ('ao', 'AO-001', Role.AUTHORIZING_OFFICER, {}),
    ('employee', 'EMP-001', Role.EMPLOYEE, {}),
    ('employee2', 'EMP-002', Role.EMPLOYEE, {}),
]


class Command(BaseCommand):
    help = 'Seed one test account per role, plus supporting org/leave-type data.'

    def handle(self, *args, **options):
        with transaction.atomic():
            work_station, _ = WorkStation.objects.get_or_create(
                code='HQ', defaults={'name': 'Head Office'}
            )
            designation, _ = Designation.objects.get_or_create(
                code='OFFICER', defaults={'name': 'Officer'}
            )
            department, _ = Department.objects.get_or_create(
                code='IT', defaults={'name': 'Information Technology'}
            )
            section, _ = Section.objects.get_or_create(
                department=department, code='SYS', defaults={'name': 'Systems'}
            )

            for name, code in [
                ('Annual Leave', 'ANNUAL'),
                ('Sick Leave', 'SICK'),
                ('Maternity Leave', 'MATERNITY'),
                ('Paternity Leave', 'PATERNITY'),
                ('Compassionate Leave', 'COMPASSIONATE'),
            ]:
                LeaveType.objects.get_or_create(code=code, defaults={'name': name})

            created_users = {}

            def make_user(username, check_number, role, extra):
                user, was_created = User.objects.get_or_create(
                    username=username,
                    defaults={
                        'full_name': username.replace('_', ' ').title(),
                        'check_number': check_number,
                        'role': role,
                        'email': f'{username}@example.test',
                        'official_email': f'{username}@example.test',
                        'department': department,
                        'section': section,
                        'work_station': work_station,
                        'designation': designation,
                        'date_of_first_appointment': date(2020, 1, 1),
                        **extra,
                    },
                )
                if was_created:
                    user.set_password(TEST_PASSWORD)
                    user.save()
                created_users[username] = user
                return user, was_created

            summary = []
            for username, check_number, role, extra in ACCOUNTS:
                user, was_created = make_user(username, check_number, role, extra)
                summary.append((username, role, was_created))

            # Wire up manager chain so leave applications route correctly:
            # employee -> hod, employee2 -> hod, hos -> hod.
            hod = created_users['hod']
            hos = created_users['hos']
            for username in ('employee', 'employee2'):
                created_users[username].manager = hod
                created_users[username].save(update_fields=['manager'])
            hos.manager = hod
            hos.save(update_fields=['manager'])

        self.stdout.write(self.style.SUCCESS(
            f'Seeded test accounts (password for all: "{TEST_PASSWORD}"):'
        ))
        for username, role, was_created in summary:
            status = 'created' if was_created else 'already existed'
            self.stdout.write(f'  {username:12s} role={role:22s} ({status})')
