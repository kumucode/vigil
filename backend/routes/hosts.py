"""
routes/hosts.py — Remote host and agent management HTTP endpoints.

  GET    /api/hosts
  POST   /api/hosts
  PATCH  /api/hosts/<id>
  DELETE /api/hosts/<id>
  POST   /api/hosts/<id>/test
  POST   /api/hosts/<id>/regenerate-token

  POST   /api/apps/<id>/update          — trigger update via agent
  GET    /api/apps/<id>/logs            — update history
  POST   /api/apps/<id>/revert/<log_id> — revert to backup
  DELETE /api/apps/<id>/logs            — clear update history

  GET    /api/hosts/ca-fingerprint
  POST   /api/hosts/<id>/generate-install-token
  POST   /api/agent-provision           — public (no auth)
  POST   /api/hosts/<id>/confirm-tls

Responsibility: request validation · authorization · response generation.
All operational logic lives in services/agent_client.py and
services/update_executor.py.
"""

import base64
import bcrypt
import hashlib
import logging
import os
import secrets

from flask import Blueprint, jsonify, request, current_app

from models import Host, TrackedApp, UpdateLog, db
from utils import now_str, require_auth
from services.agent_client import agent_request, agent_health, build_tls_context
from services.update_executor import execute_update, execute_revert

log = logging.getLogger(__name__)
bp  = Blueprint("hosts", __name__)


# ── Token management ──────────────────────────────────────────────────────────
# Token storage/retrieval stays here: it is specific to host provisioning and
# requires current_app (Flask context) for key derivation.

def _generate_token() -> str:
    return "vigil-" + secrets.token_hex(32)


def _derive_encryption_key() -> bytes:
    secret = current_app.config["SECRET_KEY"]
    if isinstance(secret, str):
        secret = secret.encode()
    return hashlib.sha256(b"vigil-token-enc-v1:" + secret).digest()


def _encrypt_token(plaintext: str) -> str:
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        key   = _derive_encryption_key()
        nonce = os.urandom(12)
        ct    = AESGCM(key).encrypt(nonce, plaintext.encode(), None)
        return "enc1:" + base64.b64encode(nonce + ct).decode()
    except ImportError:
        log.warning(
            "cryptography package not installed — agent token stored in plaintext. "
            "Install it: pip install cryptography"
        )
        return "plain:" + plaintext


def _decrypt_token(stored: str) -> str | None:
    if stored.startswith("plain:"):
        log.warning("Host token is stored in legacy plain: format. "
                    "Regenerate the token to upgrade to AES-256-GCM encryption.")
        return stored[6:]

    if not stored.startswith("enc1:"):
        log.warning("Host token is stored in legacy bare-string format. "
                    "Regenerate the token to upgrade to AES-256-GCM encryption.")
        return stored

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        key         = _derive_encryption_key()
        raw         = base64.b64decode(stored[5:])
        nonce, ct   = raw[:12], raw[12:]
        return AESGCM(key).decrypt(nonce, ct, None).decode()
    except ImportError:
        log.error("cryptography package not installed — cannot decrypt agent token.")
        return None
    except Exception as e:
        log.error("Token decryption failed: %s", e)
        return None


def _store_token(host_id: int, token: str) -> None:
    from models import Settings
    Settings.set(f"host_{host_id}_token", _encrypt_token(token))


def _get_token(host_id: int) -> str | None:
    from models import Settings
    stored = Settings.get(f"host_{host_id}_token")
    return _decrypt_token(stored) if stored else None


def _delete_token(host_id: int) -> None:
    from models import Settings, db as _db
    row = _db.session.get(Settings, f"host_{host_id}_token")
    if row:
        _db.session.delete(row)
        _db.session.commit()


# ══════════════════════════════════════════════════════════════════════════════
# HOST CRUD
# ══════════════════════════════════════════════════════════════════════════════

@bp.get("/api/hosts")
def list_hosts():
    _, err = require_auth()
    if err:
        return err
    hosts  = Host.query.order_by(Host.created_at).all()
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
    token        = _generate_token()

    host = Host(name=name, ip=ip, port=port, allowed_base=allowed_base, status="unknown")
    db.session.add(host)
    db.session.commit()
    _store_token(host.id, token)

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

    if "name"         in data: host.name         = (data["name"] or "").strip() or host.name
    if "ip"           in data: host.ip            = (data["ip"]   or "").strip() or host.ip
    if "port"         in data: host.port          = int(data["port"] or 7777)
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
    _delete_token(host.id)
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
    token = _get_token(host.id)
    if not token:
        return jsonify({"error": "Token not available. Regenerate the token."}), 400
    try:
        result     = agent_health(host, token)
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
    host        = db.get_or_404(Host, host_id)
    token       = _generate_token()
    host.status = "unknown"
    db.session.commit()
    _store_token(host.id, token)
    return jsonify({"token": token,
                    "message": "Token regenerated. Update the agent config with the new token."})


# ══════════════════════════════════════════════════════════════════════════════
# UPDATE & REVERT
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

    host = db.session.get(Host, entry.host_id)
    if not host:
        return jsonify({"error": "Linked host not found."}), 404

    token = _get_token(host.id)
    if not token:
        return jsonify({"error": "Agent token unavailable. Regenerate the host token."}), 400

    data         = request.get_json(silent=True) or {}
    triggered_by = data.get("triggered_by", "user")

    try:
        result = execute_update(entry, host, token, triggered_by=triggered_by)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({
        "status": result["status"],
        "from":   result["from"],
        "to":     result["to"],
        "app":    entry.to_dict(),
    })


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

    entry     = db.get_or_404(TrackedApp, app_id)
    log_entry = db.get_or_404(UpdateLog, log_id)

    if log_entry.app_id != app_id:
        return jsonify({"error": "Log entry does not belong to this app."}), 400
    if not log_entry.backup_path:
        return jsonify({"error": "No backup path stored for this update."}), 400
    if not entry.host_id or not entry.install_path:
        return jsonify({"error": "Host or install path not configured."}), 400

    host  = db.session.get(Host, entry.host_id)
    token = _get_token(host.id) if host else None
    if not host or not token:
        return jsonify({"error": "Host or token unavailable."}), 400

    try:
        result = execute_revert(entry, host, token, log_entry)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({"status": result["status"], "to": result["to"], "app": entry.to_dict()})


@bp.delete("/api/apps/<int:app_id>/logs")
def clear_update_logs(app_id):
    _, err = require_auth()
    if err:
        return err
    db.get_or_404(TrackedApp, app_id)
    deleted = UpdateLog.query.filter_by(app_id=app_id).delete()
    db.session.commit()
    log.info("Cleared %d log entries for app %d", deleted, app_id)
    return jsonify({"deleted": deleted})


# ══════════════════════════════════════════════════════════════════════════════
# TLS PROVISIONING (v2.3)
# ══════════════════════════════════════════════════════════════════════════════

@bp.get("/api/hosts/ca-fingerprint")
def get_ca_fingerprint():
    _, err = require_auth()
    if err:
        return err
    try:
        from ca import ca_fingerprint
        return jsonify({"fingerprint": ca_fingerprint()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/api/hosts/<int:host_id>/generate-install-token")
def generate_install_token(host_id):
    """
    Generate a short-lived install token + decryption key for agent provisioning.
    Both are stored as bcrypt hashes — never in plaintext.
    Returns plaintext values to display in the wizard (shown once, never stored).
    """
    _, err = require_auth()
    if err:
        return err

    host = db.get_or_404(Host, host_id)

    from models import InstallToken
    from datetime import timedelta, timezone
    from ca import is_public_ip

    # Expire any unused previous tokens for this host
    InstallToken.query.filter_by(host_id=host_id, used=False).delete()

    raw_token   = "install-" + secrets.token_hex(16)
    raw_dec_key = secrets.token_hex(16)
    now         = __import__("datetime").datetime.now(timezone.utc)
    expires_at  = (now + timedelta(minutes=5)).isoformat()

    it = InstallToken(
        token_hash   = bcrypt.hashpw(raw_token.encode(),   bcrypt.gensalt()).decode(),
        dec_key_hash = bcrypt.hashpw(raw_dec_key.encode(), bcrypt.gensalt()).decode(),
        host_id      = host_id,
        created_at   = now.isoformat(),
        expires_at   = expires_at,
        used         = False,
    )
    db.session.add(it)
    db.session.commit()

    return jsonify({
        "install_token": raw_token,
        "dec_key":       raw_dec_key,
        "expires_at":    expires_at,
        "public_ip":     is_public_ip(host.ip),
    })


@bp.post("/api/agent-provision")
def agent_provision():
    """
    Public endpoint (no Vigil login required) called by the agent installer.
    Verifies the install token + dec_key, issues a signed agent certificate,
    encrypts the package with the dec_key, and returns the blob.
    Both token and dec_key are single-use. The agent private key is never stored.
    """
    data = request.get_json(silent=True) or {}

    raw_token   = (data.get("install_token") or "").strip()
    raw_dec_key = (data.get("dec_key")       or "").strip()

    if not raw_token or not raw_dec_key:
        return jsonify({"error": "install_token and dec_key are required"}), 400
    if not raw_token.startswith("install-") or len(raw_token) != 40:
        return jsonify({"error": "Invalid install token format"}), 400

    from models import InstallToken, Host as _Host
    from datetime import datetime, timezone

    candidates = InstallToken.query.filter_by(used=False).all()
    matched    = None
    for c in candidates:
        if c.is_expired():
            continue
        if c.check_token(raw_token) and c.check_dec_key(raw_dec_key):
            matched = c
            break

    if not matched:
        log.warning("agent_provision: invalid or expired token attempt")
        return jsonify({"error": "Invalid, expired, or already-used install token"}), 401

    matched.used = True
    db.session.commit()

    host = db.session.get(_Host, matched.host_id)
    if not host:
        return jsonify({"error": "Host not found"}), 404

    try:
        from ca import issue_agent_cert, encrypt_cert_package, agent_cert_fingerprint
        ca_pem, agent_cert_pem, agent_key_pem = issue_agent_cert(host.name, host.ip)
    except Exception as e:
        log.error("Certificate issuance failed: %s", e)
        return jsonify({"error": "Certificate issuance failed — is the CA initialised?"}), 500

    fingerprint           = agent_cert_fingerprint(agent_cert_pem)
    host.cert_fingerprint = fingerprint
    db.session.commit()

    try:
        blob = encrypt_cert_package(ca_pem, agent_cert_pem, agent_key_pem, raw_dec_key)
    except Exception as e:
        log.error("Package encryption failed: %s", e)
        return jsonify({"error": "Encryption failed"}), 500

    del agent_key_pem
    log.info("Provisioned agent cert for host %d (%s) — fingerprint: %s",
             host.id, host.name, fingerprint)

    return jsonify({"encrypted_package": blob, "fingerprint": fingerprint})


@bp.post("/api/hosts/<int:host_id>/confirm-tls")
def confirm_tls(host_id):
    """Called from wizard step 3 after the user confirms fingerprint match."""
    _, err = require_auth()
    if err:
        return err

    host         = db.get_or_404(Host, host_id)
    data         = request.get_json(silent=True) or {}
    confirmed_fp = (data.get("fingerprint") or "").strip()

    if not host.cert_fingerprint:
        return jsonify({"error": "No certificate fingerprint on file — provision the agent first"}), 400

    if confirmed_fp and confirmed_fp != host.cert_fingerprint:
        log.warning("TLS confirm: fingerprint mismatch for host %d — possible interception", host_id)
        return jsonify({"error": "Fingerprint mismatch — confirmation rejected"}), 400

    host.tls_enabled = True
    db.session.commit()
    log.info("TLS enabled for host %d (%s)", host_id, host.name)
    return jsonify({"status": "ok", "tls_enabled": True})
