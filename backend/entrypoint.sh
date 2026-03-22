#!/bin/sh
set -e

# Fix ownership of the data directory at runtime.
# This handles three scenarios:
#   - Fresh install (volume owned by root)
#   - Rootless Docker / Podman (volume owned by a different UID)
#   - Re-deploy after UID change
chown -R appuser:appuser /data

# Drop from root → appuser and exec gunicorn.
# Using a single worker eliminates the APScheduler / multi-process conflict.
# For higher throughput, use --workers 1 --threads 4 instead.
exec gosu appuser gunicorn \
  --bind 0.0.0.0:5000 \
  --workers 1 \
  --threads 4 \
  --timeout 120 \
  app:app
