FROM python:3.12-slim

WORKDIR /app

RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends curl gosu \
 && rm -rf /var/lib/apt/lists/*

# Python deps (cached layer)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Bundle agent scripts so Flask can serve them at /agent/*
RUN mkdir -p /app/agent
COPY agent/install.sh /app/agent/install.sh
COPY agent/uninstall.sh /app/agent/uninstall.sh
COPY agent/vigil-agent.py /app/agent/vigil-agent.py

# Create the data dir and a dedicated non-root user
RUN mkdir -p /data \
 && groupadd -r appuser \
 && useradd -r -g appuser -d /app appuser

ENV DATA_DIR=/data

COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["/entrypoint.sh"]
