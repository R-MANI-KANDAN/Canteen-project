#!/usr/bin/env bash
# Exit on error
set -o errexit

# Upgrade pip and install dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt

# Collect static files with WhiteNoise
python manage.py collectstatic --no-input

# Apply database migrations
python manage.py migrate
