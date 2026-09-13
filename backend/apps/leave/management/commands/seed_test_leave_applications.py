"""
Seeds three sample leave applications for the 'employee' test account,
exercising the full workflow end to end:

  1. Fully approved, WITH travel assistance.
  2. Fully approved, WITHOUT travel assistance.
  3. Returned to employee by the HOD (pending correction).

Idempotent: tags each application via `leave_number` and skips creation if
one with that tag already exists.

Requires `seed_test_accounts` to have been run first.

Usage:
    python manage.py seed_test_leave_applications
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User
from apps.leave.models import LeaveApplication, LeaveApproval, LeaveHRReview, LeaveRecommendation, LeaveType
from apps.leave.workflow import perform_transition

APPROVED_WITH_ASSISTANCE_TAG = 'SEED-APPROVED-WITH-ASSISTANCE'
APPROVED_NO_ASSISTANCE_TAG = 'SEED-APPROVED-NO-ASSISTANCE'
RETURNED_TAG = 'SEED-RETURNED-TO-EMPLOYEE'


class Command(BaseCommand):
    help = 'Seed sample leave applications (approved w/ & w/o travel assistance, and returned-to-employee).'

    def handle(self, *args, **options):
        try:
            employee = User.objects.get(username='employee')
            hod = User.objects.get(username='hod')
            hr = User.objects.get(username='hr')
            ao = User.objects.get(username='ao')
        except User.DoesNotExist as exc:
            raise CommandError(
                'Required test users not found. Run "python manage.py seed_test_accounts" first.'
            ) from exc

        leave_type, _ = LeaveType.objects.get_or_create(
            code='ANNUAL', defaults={'name': 'Annual Leave'}
        )

        created_any = False
        with transaction.atomic():
            if not LeaveApplication.objects.filter(leave_number=APPROVED_WITH_ASSISTANCE_TAG).exists():
                self._create_and_approve(
                    employee, hod, hr, ao, leave_type,
                    tag=APPROVED_WITH_ASSISTANCE_TAG,
                    travel_assistance=True,
                    start_date=date(2026, 3, 2),
                    last_date=date(2026, 3, 6),
                )
                created_any = True
                self.stdout.write(self.style.SUCCESS(
                    f'Created fully-approved application WITH travel assistance ({APPROVED_WITH_ASSISTANCE_TAG}).'
                ))
            else:
                self.stdout.write(f'{APPROVED_WITH_ASSISTANCE_TAG} already exists, skipping.')

            if not LeaveApplication.objects.filter(leave_number=APPROVED_NO_ASSISTANCE_TAG).exists():
                self._create_and_approve(
                    employee, hod, hr, ao, leave_type,
                    tag=APPROVED_NO_ASSISTANCE_TAG,
                    travel_assistance=False,
                    start_date=date(2026, 4, 6),
                    last_date=date(2026, 4, 10),
                )
                created_any = True
                self.stdout.write(self.style.SUCCESS(
                    f'Created fully-approved application WITHOUT travel assistance ({APPROVED_NO_ASSISTANCE_TAG}).'
                ))
            else:
                self.stdout.write(f'{APPROVED_NO_ASSISTANCE_TAG} already exists, skipping.')

            if not LeaveApplication.objects.filter(leave_number=RETURNED_TAG).exists():
                self._create_and_return(
                    employee, hod, leave_type,
                    tag=RETURNED_TAG,
                    start_date=date(2026, 5, 4),
                    last_date=date(2026, 5, 8),
                )
                created_any = True
                self.stdout.write(self.style.SUCCESS(
                    f'Created application returned to employee by HOD ({RETURNED_TAG}).'
                ))
            else:
                self.stdout.write(f'{RETURNED_TAG} already exists, skipping.')

        if not created_any:
            self.stdout.write('Nothing to do; all sample applications already exist.')

    @staticmethod
    def _new_application(employee, leave_type, tag, travel_assistance, start_date, last_date):
        return LeaveApplication.objects.create(
            employee=employee,
            leave_number=tag,
            check_number=employee.check_number,
            personnel_file=employee.personnel_file_number,
            full_name=employee.full_name,
            designation=employee.designation.name if employee.designation else '',
            station=employee.work_station.name if employee.work_station else '',
            division_department=employee.department.name if employee.department else '',
            phone_number=employee.phone_number,
            email=employee.email,
            contact_address='',
            leave_type=leave_type,
            travel_assistance=travel_assistance,
            start_date=start_date,
            last_date=last_date,
        )

    def _create_and_approve(self, employee, hod, hr, ao, leave_type, tag, travel_assistance, start_date, last_date):
        application = self._new_application(employee, leave_type, tag, travel_assistance, start_date, last_date)

        application = perform_transition(application, employee, 'submit')

        recommendation = LeaveRecommendation.objects.create(
            reviewer=hod, recommended=True, comments='Recommended for approval.',
        )
        application.recommendation = recommendation
        application.save(update_fields=['recommendation'])
        application = perform_transition(application, hod, 'recommend')

        hr_review = LeaveHRReview.objects.create(
            reviewer=hr, verified=True, leave_balance_confirmed='Balance confirmed.',
            comments='Leave balance verified.',
        )
        application.hr_review = hr_review
        application.save(update_fields=['hr_review'])
        application = perform_transition(application, hr, 'verify')

        approval = LeaveApproval.objects.create(
            reviewer=ao, approved=True, comments='Approved.',
        )
        application.approval = approval
        application.save(update_fields=['approval'])
        perform_transition(application, ao, 'approve')

    def _create_and_return(self, employee, hod, leave_type, tag, start_date, last_date):
        application = self._new_application(employee, leave_type, tag, False, start_date, last_date)
        application = perform_transition(application, employee, 'submit')
        perform_transition(
            application, hod, 'return_to_employee',
            comments='Please correct Section A details before resubmitting.',
        )
