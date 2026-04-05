#!/usr/bin/env python3
"""
vigil-agent.py — Lightweight Vigil remote agent.

Exposes a minimal HTTP API so Vigil can read, write, and restart
docker-compose services on this host.  Only files under allowed_base
can be touched.  All requests require a matching X-Vigil-Token header.

Endpoints:
  GET  /health      — liveness check
  POST /read        — read docker-compose.yml from a directory
  POST /write       — write new compose content + restart service
  POST /revert      — restore a specific backup file + restart service

Config file: /etc/vigil-agent/config.yml
  token:        vigil-xxxx...    (plaintext, chmod 600)
  allowed_base: /home
  bind_address: 0.0.0.0
  port:         7777
"""

import json
import logging
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

CONFIG_PATH  = os.environ.get("VIGIL_CONFIG", "/etc/vigil-agent/config.yml")
BACKUP_DIR   = ".vigil-backups"
MAX_BACKUPS  = 10

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] vigil-agent: %(message)s",
)
log = logging.getLogger(__name__)


def _load_config() -> dict:
    try:
        import yaml
        with open(CONFIG_PATH) as f:
            return yaml.safe_load(f) or {}
    except ImportError:
        # fallback: simple key: value parser
        cfg = {}
        with open(CONFIG_PATH) as f:
            for line in f:
                line = line.strip()
                if ":" in line and not line.startswith("#"):
                    k, _, v = line.partition(":")
                    cfg[k.strip()] = v.strip()
        return cfg
    except FileNotFoundError:
        log.error("Config not found at %s", CONFIG_PATH)
        sys.exit(1)


CFG          = _load_config()
TOKEN        = CFG.get("token", "")
ALLOWED_BASE = Path(CFG.get("allowed_base", "/home")).resolve()
BIND_ADDR    = CFG.get("bind_address", "0.0.0.0")
PORT         = int(CFG.get("port", 7777))

if not TOKEN:
    log.error("No token configured. Set 'token' in %s", CONFIG_PATH)
    sys.exit(1)

log.info("Agent starting — allowed_base=%s bind=%s:%d", ALLOWED_BASE, BIND_ADDR, PORT)


# ── Security helpers ──────────────────────────────────────────────────────────

def _check_token(req_token: str) -> bool:
    return req_token == TOKEN


def _safe_path(directory: str) -> Path | None:
    """
    Resolve the directory and verify it is under ALLOWED_BASE.
    Returns the resolved Path or None if the path is rejected.
    """
    try:
        p = Path(directory).resolve()
        p.relative_to(ALLOWED_BASE)   # raises ValueError if not under base
        return p
    except (ValueError, RuntimeError):
        return None


# ── Backup helpers ────────────────────────────────────────────────────────────

def _backup(compose_path: Path) -> str:
    """Create a timestamped backup and return its path string."""
    backup_dir = compose_path.parent / BACKUP_DIR
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts      = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    dest    = backup_dir / f"docker-compose.{ts}.yml"
    shutil.copy2(compose_path, dest)
    _prune_backups(backup_dir)
    log.info("Backed up %s → %s", compose_path, dest)
    return str(dest)


def _prune_backups(backup_dir: Path):
    """Keep only the most recent MAX_BACKUPS files."""
    files = sorted(backup_dir.glob("docker-compose.*.yml"), key=lambda f: f.name)
    for old in files[:-MAX_BACKUPS]:
        old.unlink(missing_ok=True)


# ── Docker helpers ────────────────────────────────────────────────────────────

def _restart_service(compose_dir: Path, service_name: str) -> str:
    """
    Run docker compose up -d [service_name] in compose_dir.
    Returns stdout+stderr combined.
    """
    cmd = ["docker", "compose", "up", "-d", "--no-deps"]
    if service_name:
        cmd.append(service_name)
    result = subprocess.run(
        cmd,
        cwd=str(compose_dir),
        capture_output=True,
        text=True,
        timeout=120,
    )
    output = (result.stdout + result.stderr).strip()
    if result.returncode != 0:
        raise RuntimeError(f"docker compose failed (exit {result.returncode}): {output}")
    return output


# ── Request handler ───────────────────────────────────────────────────────────

class AgentHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        log.info(fmt, *args)

    def _send(self, status: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(data))
        self.end_headers()
        self.wfile.write(data)

    def _auth(self) -> bool:
        token = self.headers.get("X-Vigil-Token", "")
        if not _check_token(token):
            self._send(401, {"error": "Unauthorized"})
            return False
        return True

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length:
            return json.loads(self.rfile.read(length).decode())
        return {}

    def do_GET(self):
        if self.path == "/health":
            if not self._auth():
                return
            self._send(200, {
                "status":       "ok",
                "allowed_base": str(ALLOWED_BASE),
                "version":      "1.2",
            })
        else:
            self._send(404, {"error": "Not found"})

    def do_POST(self):
        if not self._auth():
            return

        if self.path == "/read":
            self._handle_read()
        elif self.path == "/write":
            self._handle_write()
        elif self.path == "/revert":
            self._handle_revert()
        else:
            self._send(404, {"error": "Not found"})

    def _handle_read(self):
        data      = self._read_body()
        directory = data.get("path", "")
        safe_dir  = _safe_path(directory)
        if not safe_dir:
            self._send(403, {"error": f"Path not allowed: {directory}"})
            return

        compose_path = safe_dir / "docker-compose.yml"
        if not compose_path.exists():
            # also try docker-compose.yaml
            compose_path = safe_dir / "docker-compose.yaml"
        if not compose_path.exists():
            self._send(404, {"error": f"No docker-compose.yml found in {safe_dir}"})
            return

        content = compose_path.read_text()
        self._send(200, {"content": content, "path": str(compose_path)})

    def _handle_write(self):
        data         = self._read_body()
        directory    = data.get("path", "")
        content      = data.get("content", "")
        service_name = data.get("service_name", "")

        if not content:
            self._send(400, {"error": "No content provided"})
            return

        safe_dir = _safe_path(directory)
        if not safe_dir:
            self._send(403, {"error": f"Path not allowed: {directory}"})
            return

        compose_path = safe_dir / "docker-compose.yml"
        if not compose_path.exists():
            compose_path = safe_dir / "docker-compose.yaml"
        if not compose_path.exists():
            self._send(404, {"error": f"No docker-compose.yml found in {safe_dir}"})
            return

        # Validate it's at least parseable YAML before writing
        try:
            import yaml
            yaml.safe_load(content)
        except Exception as e:
            self._send(400, {"error": f"Invalid YAML: {e}"})
            return

        backup_path = _backup(compose_path)
        compose_path.write_text(content)
        log.info("Wrote %s", compose_path)

        try:
            output = _restart_service(safe_dir, service_name)
            log.info("Restarted service '%s': %s", service_name or "(all)", output[:200])
        except RuntimeError as e:
            # Restore backup on restart failure
            shutil.copy2(backup_path, compose_path)
            log.error("Restart failed, restored backup: %s", e)
            self._send(500, {"error": str(e), "restored": True})
            return

        self._send(200, {"status": "ok", "backup_path": backup_path, "output": output[:500]})

    def _handle_revert(self):
        data         = self._read_body()
        directory    = data.get("path", "")
        backup_path  = data.get("backup_path", "")
        service_name = data.get("service_name", "")

        safe_dir = _safe_path(directory)
        if not safe_dir:
            self._send(403, {"error": f"Path not allowed: {directory}"})
            return

        backup = Path(backup_path)
        # Backup must also be under allowed_base
        try:
            backup.resolve().relative_to(ALLOWED_BASE)
        except ValueError:
            self._send(403, {"error": "Backup path not allowed"})
            return

        if not backup.exists():
            self._send(404, {"error": f"Backup not found: {backup_path}"})
            return

        compose_path = safe_dir / "docker-compose.yml"
        if not compose_path.exists():
            compose_path = safe_dir / "docker-compose.yaml"

        # Backup current before reverting
        new_backup = _backup(compose_path) if compose_path.exists() else ""
        shutil.copy2(backup, compose_path)
        log.info("Reverted %s from %s", compose_path, backup)

        try:
            output = _restart_service(safe_dir, service_name)
        except RuntimeError as e:
            self._send(500, {"error": str(e)})
            return

        self._send(200, {"status": "reverted", "backup_path": new_backup, "output": output[:500]})


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    server = HTTPServer((BIND_ADDR, PORT), AgentHandler)
    log.info("Vigil agent listening on %s:%d", BIND_ADDR, PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Agent stopped.")
