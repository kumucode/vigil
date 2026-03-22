FROM python:3.12-slim

WORKDIR /app

# curl  → needed for the Docker health check
# gosu  → lets the entrypoint drop from root to a regular user safely,
#          which fixes volume-permission issues whether Docker runs as
#          root or as a non-root user (Podman, rootless Docker, etc.)
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends curl gosu \
 && rm -rf /var/lib/apt/lists/*

# Python deps (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create the data dir and a dedicated non-root user
RUN mkdir -p /data \
 && groupadd -r appuser \
 && useradd -r -g appuser -d /app appuser

ENV DATA_DIR=/data

# entrypoint.sh:
#   1. Fixes /data ownership at runtime (works even if the named volume
#      was created by root or by a different UID on the host).
#   2. Drops privileges and execs gunicorn as appuser.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["/entrypoint.sh"]
