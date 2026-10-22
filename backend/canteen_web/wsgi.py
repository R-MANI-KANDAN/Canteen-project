# Description: WSGI entry-point configuration for web server deployment.
"""
WSGI config for canteen_web project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/
"""

import os
import sys
from pathlib import Path

# Ensure backend directory is in sys.path so apps (base, cart, payments) can be imported
backend_path = Path(__file__).resolve().parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'canteen_web.settings')

application = get_wsgi_application()
