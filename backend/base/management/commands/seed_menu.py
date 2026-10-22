from django.core.management.base import BaseCommand
from django.core.management import call_command
from base.models import Product


class Command(BaseCommand):
    help = 'Seeds initial menu categories and products if the database has none'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force reload initial menu data even if products already exist',
        )

    def handle(self, *args, **options):
        force = options.get('force', False)
        product_count = Product.objects.count()

        if product_count == 0 or force:
            self.stdout.write(self.style.WARNING('Seeding initial menu data...'))
            call_command('loaddata', 'initial_menu_data.json')
            self.stdout.write(self.style.SUCCESS(f'Successfully loaded menu items! Total products: {Product.objects.count()}'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Database already contains {product_count} products. Skipping seeding.'))
