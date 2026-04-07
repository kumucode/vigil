"""
routes/hosts.py — Remote host (agent) management and update execution.

  GET    /api/hosts
  POST   /api/hosts
  PATCH  /api/hosts/<id>
  DELETE /api/hosts/<id>
  POST   /api/hosts/<id>/test
  POST   /api/hosts/<id>/regenerate-token

  POST   /api/apps/<id>/update        — trigger update via agent
  GET    /api/apps/<id>/logs          — update history
  POST   /api/apps/<id>/revert/<log_id> — revert to backup
"""

import bcrypt
import json
import logging
import secrets
import urllib.request
import urllib.error

from datetime import datetime, timezone
from flask import Blueprint, jsonify, request

from models import Host, TrackedApp, UpdateLog, db
from utils import clamp, now_str, require_auth

log = logging.getLogger(__name__)
bp  = Blueprint("hosts", __name__)

AGENT_TIMEOUT = 10  # seconds


# ── Token helpers ──────────────────────────────────────────────────────────────

def _generate_token() -> str:
    """Generate a random 32-hex token with vigil- prefix."""
    return "vigil-" + secrets.token_hex(32)


def _hash_token(token: str) -> str:
    return bcrypt.hashpw(token.encode(), bcrypt.gensalt()).decode()


def _check_token(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ── Agent communication ────────────────────────────────────────────────────────

def _agent_url(host: Host, path: str) -> str:
    return f"http://{host.ip}:{host.port}{path}"


def _agent_request(host: Host, path: str, token: str, payload: dict | None = None) -> dict:
    """
    Make an HTTP request to the agent.
    Returns the parsed JSON response or raises on error.
    """
    url  = _agent_url(host, path)
    data = json.dumps(payload or {}).encode()
    req  = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type":  "application/json",
            "X-Vigil-Token": token,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=AGENT_TIMEOUT) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"Agent returned {e.code}: {body}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Cannot reach agent: {e.reason}")
    except Exception as e:
        raise RuntimeError(str(e))


def _agent_health(host: Host, token: str) -> dict:
    """GET /health on the agent — uses urllib directly."""
    url = _agent_url(host, "/health")
    req = urllib.request.Request(
        url,
        headers={"X-Vigil-Token": token},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=AGENT_TIMEOUT) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        raise RuntimeError(str(e))


# ── Host token storage helper ──────────────────────────────────────────────────
# We store the token hash in the DB. The plaintext is shown once at creation
# time and never stored. For agent calls we need the plaintext — it is stored
# transiently in the Settings table under key "host_<id>_token" (plaintext,
# separate from the hash). This lets Vigil make agent calls without storing
# the plaintext alongside the hash in the same row.

def _store_plaintext_token(host_id: int, token: str):
    from models import Settings
    Settings.set(f"host_{host_id}_token", token)


def _get_plaintext_token(host_id: int) -> str | None:
    from models import Settings
    return Settings.get(f"host_{host_id}_token")


def _delete_plaintext_token(host_id: int):
    from models import Settings, db
    row = db.session.get(Settings, f"host_{host_id}_token")
    if row:
        db.session.delete(row)
        db.session.commit()


# ══════════════════════════════════════════════════════════════════════════════
# HOST CRUD
# ══════════════════════════════════════════════════════════════════════════════

@bp.get("/api/hosts")
def list_hosts():
    _, err = require_auth()
    if err:
        return err
    hosts = Host.query.order_by(Host.created_at).all()
    result = []
    for h in hosts:
        d = h.to_dict()
        d["app_count"] = TrackedApp.query.filter_by(host_id=h.id).count()
        result.append(d)
    return jsonify(result)


@bp.post("/api/hosts")
def create_host():
    _, err = require_auth()
    if err:
        return err
    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip()
    ip   = (data.get("ip")   or "").strip()
    if not name:
        return jsonify({"error": "Host name is required."}), 400
    if not ip:
        return jsonify({"error": "IP address is required."}), 400

    port         = int(data.get("port", 7777))
    allowed_base = (data.get("allowed_base") or "/home").strip().rstrip("/") or "/home"

    token      = _generate_token()
    token_hash = _hash_token(token)

    host = Host(
        name=name, ip=ip, port=port,
        token_hash=token_hash,
        allowed_base=allowed_base,
        status="unknown",
    )
    db.session.add(host)
    db.session.commit()
    _store_plaintext_token(host.id, token)

    d = host.to_dict()
    d["token"]     = token   # shown once
    d["app_count"] = 0
    return jsonify(d), 201


@bp.patch("/api/hosts/<int:host_id>")
def update_host(host_id):
    _, err = require_auth()
    if err:
        return err
    host = db.get_or_404(Host, host_id)
    data = request.get_json(silent=True) or {}

    if "name" in data:
        host.name = (data["name"] or "").strip() or host.name
    if "ip" in data:
        host.ip = (data["ip"] or "").strip() or host.ip
    if "port" in data:
        host.port = int(data["port"] or 7777)
    if "allowed_base" in data:
        host.allowed_base = (data["allowed_base"] or "/home").strip().rstrip("/") or "/home"

    db.session.commit()
    d = host.to_dict()
    d["app_count"] = TrackedApp.query.filter_by(host_id=host.id).count()
    return jsonify(d)


@bp.delete("/api/hosts/<int:host_id>")
def delete_host(host_id):
    _, err = require_auth()
    if err:
        return err
    host = db.get_or_404(Host, host_id)
    _delete_plaintext_token(host.id)
    # unlink apps
    for app in TrackedApp.query.filter_by(host_id=host.id).all():
        app.host_id = None
    db.session.delete(host)
    db.session.commit()
    return "", 204


@bp.post("/api/hosts/<int:host_id>/test")
def test_host(host_id):
    _, err = require_auth()
    if err:
        return err
    host  = db.get_or_404(Host, host_id)
    token = _get_plaintext_token(host.id)
    if not token:
        return jsonify({"error": "Token not available. Regenerate the token."}), 400
    try:
        result = _agent_health(host, token)
        host.status    = "connected"
        host.last_seen = now_str()
        db.session.commit()
        return jsonify({"status": "connected", "agent": result})
    except RuntimeError as e:
        host.status = "unreachable"
        db.session.commit()
        return jsonify({"error": str(e), "status": "unreachable"}), 502


@bp.post("/api/hosts/<int:host_id>/regenerate-token")
def regenerate_token(host_id):
    _, err = require_auth()
    if err:
        return err
    host = db.get_or_404(Host, host_id)

    token          = _generate_token()
    host.token_hash = _hash_token(token)
    host.status     = "unknown"
    db.session.commit()
    _store_plaintext_token(host.id, token)

    return jsonify({"token": token, "message": "Token regenerated. Update the agent config with the new token."})


# ══════════════════════════════════════════════════════════════════════════════
# UPDATE EXECUTION
# ══════════════════════════════════════════════════════════════════════════════

@bp.post("/api/apps/<int:app_id>/update")
def trigger_update(app_id):
    """Trigger a compose update on the remote agent for a single app."""
    _, err = require_auth()
    if err:
        return err

    entry = db.get_or_404(TrackedApp, app_id)

    if not entry.host_id:
        return jsonify({"error": "No host linked to this app. Edit the card to link a host."}), 400
    if not entry.install_path:
        return jsonify({"error": "No install path set. Edit the card to set the compose directory."}), 400
    if not entry.latest_version:
        return jsonify({"error": "Latest version not known yet. Run a check first."}), 400

    host  = db.session.get(Host, entry.host_id)
    if not host:
        return jsonify({"error": "Linked host not found."}), 404

    token = _get_plaintext_token(host.id)
    if not token:
        return jsonify({"error": "Agent token unavailable. Regenerate the host token."}), 400

    data         = request.get_json(silent=True) or {}
    triggered_by = data.get("triggered_by", "user")
    new_version  = entry.latest_version
    old_version  = entry.version

    # Step 1 — read current compose
    try:
        read_resp = _agent_request(host, "/read", token, {
            "path": entry.install_path,
        })
    except RuntimeError as e:
        return jsonify({"error": f"Could not read compose file: {e}"}), 502

    compose_content = read_resp.get("content", "")
    if not compose_content:
        return jsonify({"error": "Agent returned empty compose file."}), 502

    # Step 2 — patch the image tag in the compose content
    import re
    image_base  = entry.image
    old_tag     = old_version
    new_tag     = new_version
    # Replace image: <image_base>:<old_tag> with image: <image_base>:<new_tag>
    # Using a lambda replacement to prevent backreference injection from version strings
    pattern     = re.compile(
        r'(image\s*:\s*' + re.escape(image_base) + r')(?::[\w.\-]+)?',
        re.IGNORECASE
    )
    new_content = pattern.sub(lambda m: m.group(1) + ':' + new_tag, compose_content)

    if new_content == compose_content:
        return jsonify({"error": "Could not find the image in the compose file. Check the image and install path."}), 400

    # Step 3 — write + restart via agent
    try:
        write_resp = _agent_request(host, "/write", token, {
            "path":         entry.install_path,
            "content":      new_content,
            "service_name": entry.service_name or "",
        })
    except RuntimeError as e:
        _log_update(app_id, old_version, new_version, "failed", triggered_by, str(e))
        _notify_action(entry.name, "update", old_version, new_version,
                       "failed", host_name=host.name, error=str(e))
        return jsonify({"error": f"Agent write/restart failed: {e}"}), 502

    backup_path = write_resp.get("backup_path", "")

    # Step 4 — update DB
    entry.version = new_version
    entry.status  = "up-to-date"
    db.session.commit()

    _log_update(app_id, old_version, new_version, "success", triggered_by, backup_path=backup_path)

    host.last_seen = now_str()
    host.status    = "connected"
    db.session.commit()

    _notify_action(entry.name, "update", old_version, new_version,
                   "success", host_name=host.name)

    return jsonify({"status": "updated", "from": old_version, "to": new_version, "app": entry.to_dict()})


def _log_update(app_id, from_ver, to_ver, status, triggered_by,
                error=None, backup_path=None, action="update"):
    entry = UpdateLog(
        app_id=app_id,
        timestamp=now_str(),
        action=action,
        from_version=from_ver,
        to_version=to_ver,
        status=status,
        triggered_by=triggered_by,
        error_message=error,
        backup_path=backup_path,
    )
    db.session.add(entry)
    db.session.commit()


def _notify_action(app_name: str, action: str, from_ver: str, to_ver: str,
                   status: str, host_name: str = "", error: str = ""):
    """
    Fire a Telegram + webhook notification after an update or revert action.
    Runs best-effort — never raises.
    """
    try:
        from models import Settings
        from scheduler import send_telegram, _send_webhook as send_webhook
        token   = Settings.get("telegram_token",  "")
        chat_id = Settings.get("telegram_chat_id", "")
        webhook = Settings.get("webhook_url", "")

        if action == "update" and status == "success":
            icon = "✅"
            verb = "updated"
        elif action == "revert" and status == "success":
            icon = "↩️"
            verb = "reverted"
        elif status == "failed":
            icon = "❌"
            verb = "update failed"
        else:
            icon = "ℹ️"
            verb = action

        lines = [f"{icon} *{app_name}* {verb}"]
        lines.append(f"{from_ver} → {to_ver}")
        if host_name:
            lines.append(f"Host: {host_name}")
        if error:
            lines.append(f"Error: {error}")

        msg = "\n".join(lines)

        if token and chat_id:
            send_telegram(token, chat_id, msg)
        if webhook:
            send_webhook(webhook, {"text": msg, "app": app_name,
                                   "action": action, "status": status,
                                   "from": from_ver, "to": to_ver})
    except Exception as exc:
        log.warning("_notify_action failed: %s", exc)


# ── Update log endpoints ───────────────────────────────────────────────────────

# ══════════════════════════════════════════════════════════════════════════════
# UPDATE LOG & REVERT
# ══════════════════════════════════════════════════════════════════════════════

@bp.get("/api/apps/<int:app_id>/logs")
def get_update_logs(app_id):
    _, err = require_auth()
    if err:
        return err
    db.get_or_404(TrackedApp, app_id)
    logs = (UpdateLog.query
            .filter_by(app_id=app_id)
            .order_by(UpdateLog.id.desc())
            .limit(50)
            .all())
    return jsonify([l.to_dict() for l in logs])


@bp.post("/api/apps/<int:app_id>/revert/<int:log_id>")
def revert_update(app_id, log_id):
    _, err = require_auth()
    if err:
        return err

    entry    = db.get_or_404(TrackedApp, app_id)
    log_entry = db.get_or_404(UpdateLog, log_id)

    if log_entry.app_id != app_id:
        return jsonify({"error": "Log entry does not belong to this app."}), 400
    if not log_entry.backup_path:
        return jsonify({"error": "No backup path stored for this update."}), 400
    if not entry.host_id or not entry.install_path:
        return jsonify({"error": "Host or install path not configured."}), 400

    host  = db.session.get(Host, entry.host_id)
    token = _get_plaintext_token(host.id) if host else None
    if not host or not token:
        return jsonify({"error": "Host or token unavailable."}), 400

    try:
        resp = _agent_request(host, "/revert", token, {
            "path":         entry.install_path,
            "backup_path":  log_entry.backup_path,
            "service_name": entry.service_name or "",
        })
    except RuntimeError as e:
        return jsonify({"error": f"Revert failed: {e}"}), 502

    revert_to = log_entry.from_version
    old_ver   = entry.version
    entry.version = revert_to
    entry.status  = "up-to-date"
    db.session.commit()

    _log_update(app_id, old_ver, revert_to, "success", "user",
                action="revert", backup_path=resp.get("backup_path"))

    host.last_seen = now_str()
    host.status    = "connected"
    db.session.commit()

    _notify_action(entry.name, "revert", old_ver, revert_to,
                   "success", host_name=host.name)

    return jsonify({"status": "reverted", "to": revert_to, "app": entry.to_dict()})

@bp.delete("/api/apps/<int:app_id>/logs")
def clear_update_logs(app_id):
    """Delete all update log entries for an app."""
    _, err = require_auth()
    if err:
        return err
    db.get_or_404(TrackedApp, app_id)
    deleted = UpdateLog.query.filter_by(app_id=app_id).delete()
    db.session.commit()
    log.info("Cleared %d log entries for app %d", deleted, app_id)
    return jsonify({"deleted": deleted})
