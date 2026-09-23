from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('leave', '0010_travelpaymentsettings'),
    ]

    operations = [
        migrations.RenameField(
            model_name='travelpaymentsettings',
            old_name='max_taxi_subtotal',
            new_name='taxi_amount',
        ),
        migrations.RenameField(
            model_name='travelpaymentsettings',
            old_name='max_mizigo_subtotal',
            new_name='mizigo_amount',
        ),
        migrations.AlterField(
            model_name='travelpaymentsettings',
            name='taxi_amount',
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=12, null=True,
                help_text='Fixed TAXI amount auto-applied to every application requesting '
                          'travel assistance (TZS). Blank = not configured (no TAXI amount applied).',
            ),
        ),
        migrations.AlterField(
            model_name='travelpaymentsettings',
            name='mizigo_amount',
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=12, null=True,
                help_text='Fixed MIZIGO amount auto-applied to every application requesting '
                          'travel assistance (TZS). Blank = not configured (no MIZIGO amount applied).',
            ),
        ),
    ]
