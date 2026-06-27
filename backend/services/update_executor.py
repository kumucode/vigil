"""
services/update_executor.py — Compose update and revert execution for Vigil.

Owns:
  - Update execution    (execute_update)
  - Revert execution    (execute_revert)
  - Update log writes   (_log_update)

Extracted from routes/hosts.py in v2.5.

Callers pass:
  - entry   : TrackedApp ORM object
  - host    : Host ORM object
  - token   : already-decrypted agent token string

No Flask request/response objects cross this boundary.
Results are returned as plain dicts; errors are raised as RuntimeError.
The HTTP layer in routes/hosts.py translates these into HTTP responses.
"""

import logging
import re

from utils import now_str
from models import TrackedApp, Host, UpdateLog, db
from services.agent_client import agent_request
from services.notifications import notify_action

log = logging.getLogger(__name__)


# ── Update log ────────────────────────────────────────────────────────────────

def _log_update(
    app_id: int,
    from_ver: str,
    to_ver: str,
    status: str,
    triggered_by: str,
    error: str | None = None,
    backup_path: str | None = None,
    action: str = "update",
) -> None:
    """
    Append a row to the update_log table and commit.
    Called from execute_update and execute_revert.
    """
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


# ── Update ────────────────────────────────────────────────────────────────────

def execute_update(
    entry: TrackedApp,
    host: Host,
    token: str,
    triggered_by: str = "user",
) -> dict:
    """
    Execute a compose update via the remote agent.

    Steps:
      1. Read current compose file from agent.
      2. Patch the image tag.
      3. Write new compose file + restart via agent.
      4. Update TrackedApp.version and status in DB.
      5. Log the operation.
      6. Update host last_seen / status.
      7. Send notification.

    Returns a result dict:
      {"status": "updated", "from": old_version, "to": new_version}

    Raises RuntimeError with a user-friendly message on any failure.
    The update_log entry is written even on failure (status="failed").
    """
    new_version = entry.latest_version
    old_version = entry.version
    app_id      = entry.id

    # ── Step 1: read current compose ─────────────────────────────────────────
    log.info("[UPDATE] Starting update: app=%s id=%d host=%s path=%s",
             entry.name, app_id, host.name, entry.install_path)
    try:
        read_resp = agent_request(host, "/read", token, {"path": entry.install_path})
        log.info("[COMPOSE] Read compose OK: %d bytes", len(read_resp.get("content","")))
    except RuntimeError as e:
        err_msg = str(e)
        # Translate generic messages into actionable ones
        if "timed out" in err_msg.lower() or "TIMEOUT" in err_msg:
            user_msg = f"Agent unreachable — connection timed out reading compose file from '{host.name}'. Check the agent is online."
        elif "connection refused" in err_msg.lower():
            user_msg = f"Agent offline — could not connect to '{host.name}' ({host.ip}:{host.port})."
        elif "compose file not found" in err_msg.lower() or "no such file" in err_msg.lower():
            user_msg = f"Compose file not found at '{entry.install_path}' on '{host.name}'. Check the install path."
        elif "permission denied" in err_msg.lower():
            user_msg = f"Permission denied reading compose file on '{host.name}'. Check file ownership."
        elif "token" in err_msg.lower() or "401" in err_msg or "403" in err_msg:
            user_msg = f"Agent token invalid or expired — regenerate the token for '{host.name}' in Settings → Agents."
        else:
            user_msg = f"Could not read compose file from '{host.name}': {err_msg}"
        log.error("[UPDATE] Read failed: %s", user_msg)
        raise RuntimeError(user_msg)

    compose_content = read_resp.get("content", "")
    if not compose_content:
        raise RuntimeError("Agent returned empty compose file.")

    # ── Step 2: patch image tag ───────────────────────────────────────────────
    pattern     = re.compile(
        r"(image\s*:\s*" + re.escape(entry.image) + r")(?::[\w.\-]+)?",
        re.IGNORECASE,
    )
    new_content = pattern.sub(
        lambda m: m.group(1) + ":" + new_version, compose_content
    )

    if new_content == compose_content:
        raise RuntimeError(
            "Could not find the image in the compose file. "
            "Check the image and install path."
        )

    # ── Step 3: write + restart ───────────────────────────────────────────────
    log.info("[COMPOSE] Patched image tag in compose: %s → %s", old_version, new_version)
    log.info("[UPDATE] Sending write+restart to agent…")
    try:
        write_resp = agent_request(host, "/write", token, {
            "path":         entry.install_path,
            "content":      new_content,
            "service_name": entry.service_name or "",
        })
    except RuntimeError as e:
        err_msg = str(e)
        if "permission denied" in err_msg.lower() or "docker" in err_msg.lower():
            user_msg = f"Docker permission denied on '{host.name}'. Run: sudo usermod -aG docker vigil-agent"
        elif "compose" in err_msg.lower() and "not found" in err_msg.lower():
            user_msg = f"docker compose binary not found on '{host.name}'. Install Docker Compose on the remote host."
        elif "TIMEOUT" in err_msg or "timed out" in err_msg.lower():
            user_msg = f"Update timed out on '{host.name}'. Docker Compose may still be running — check agent logs before retrying."
        else:
            user_msg = f"Compose restart failed on '{host.name}': {err_msg}"
        log.error("[COMPOSE] Write/restart failed: %s", user_msg)
        _log_update(app_id, old_version, new_version, "failed", triggered_by, user_msg)
        notify_action(
            app_name=entry.name, action="update",
            from_ver=old_version, to_ver=new_version,
            status="failed", host_name=host.name, error=user_msg,
        )
        raise RuntimeError(user_msg)

    backup_path = write_resp.get("backup_path", "")

    # ── Step 4: update TrackedApp ─────────────────────────────────────────────
    entry.version = new_version
    entry.status  = "up-to-date"
    db.session.commit()

    # ── Step 5: log ───────────────────────────────────────────────────────────
    log.info("[UPDATE] Success: %s updated %s → %s on %s",
             entry.name, old_version, new_version, host.name)
    _log_update(app_id, old_version, new_version, "success", triggered_by,
                backup_path=backup_path)

    # ── Step 6: update host status ────────────────────────────────────────────
    host.last_seen = now_str()
    host.status    = "connected"
    db.session.commit()

    # ── Step 7: notification ──────────────────────────────────────────────────
    notify_action(
        app_name=entry.name, action="update",
        from_ver=old_version, to_ver=new_version,
        status="success", host_name=host.name,
    )

    return {"status": "updated", "from": old_version, "to": new_version}


# ── Revert ────────────────────────────────────────────────────────────────────

def execute_revert(
    entry: TrackedApp,
    host: Host,
    token: str,
    log_entry: UpdateLog,
) -> dict:
    """
    Execute a compose revert to a backup via the remote agent.

    Steps:
      1. Send revert request to agent (restores backup file + restarts).
      2. Update TrackedApp.version to the reverted version.
      3. Log the revert.
      4. Update host last_seen / status.
      5. Send notification.

    Returns a result dict:
      {"status": "reverted", "to": reverted_version}

    Raises RuntimeError with a user-friendly message on failure.
    """
    revert_to = log_entry.from_version
    old_ver   = entry.version
    app_id    = entry.id

    # ── Step 1: send revert to agent ──────────────────────────────────────────
    try:
        resp = agent_request(host, "/revert", token, {
            "path":         entry.install_path,
            "backup_path":  log_entry.backup_path,
            "service_name": entry.service_name or "",
        })
    except RuntimeError as e:
        raise RuntimeError(f"Revert failed: {e}")

    # ── Step 2: update TrackedApp ─────────────────────────────────────────────
    entry.version = revert_to
    entry.status  = "up-to-date"
    db.session.commit()

    # ── Step 3: log ───────────────────────────────────────────────────────────
    _log_update(app_id, old_ver, revert_to, "success", "user",
                action="revert", backup_path=resp.get("backup_path"))

    # ── Step 4: update host status ────────────────────────────────────────────
    host.last_seen = now_str()
    host.status    = "connected"
    db.session.commit()

    # ── Step 5: notification ──────────────────────────────────────────────────
    notify_action(
        app_name=entry.name, action="revert",
        from_ver=old_ver, to_ver=revert_to,
        status="success", host_name=host.name,
    )

    return {"status": "reverted", "to": revert_to}
