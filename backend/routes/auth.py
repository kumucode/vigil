"""
routes/auth.py — Authentication, TOTP, and backup-code endpoints.

  POST   /api/auth/login
  POST   /api/auth/totp/login
  POST   /api/auth/totp/backup
  POST   /api/auth/logout
  GET    /api/auth/me
  POST   /api/auth/change-password
  POST   /api/auth/change-username
  POST   /api/auth/totp/setup
  POST   /api/auth/totp/confirm
  DELETE /api/auth/totp
  POST   /api/auth/totp/regenerate
"""

import base64 as _base64
import hashlib as _hashlib
import hmac as _hmac
import json
import logging
import secrets as _secrets
import struct as _struct
import time as _time

from flask import Blueprint, jsonify, request, session

from config import LEN, TOTP_PENDING_TTL
from models import Settings, User, db
from utils import rate_limited, require_auth

log = logging.getLogger(__name__)
bp  = Blueprint("auth", __name__)


# ══════════════════════════════════════════════════════════════════════════════
# QR CODE  (reportlab — already in requirements)
# ══════════════════════════════════════════════════════════════════════════════

def _qr_svg(text: str, size: int = 200) -> str:
    """Return an inline SVG QR code string for *text*."""
    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics import renderSVG
    from reportlab.graphics.shapes import Drawing
    qr     = QrCodeWidget(text)
    bounds = qr.getBounds()
    w, h   = bounds[2] - bounds[0], bounds[3] - bounds[1]
    d      = Drawing(size, size, transform=[size / w, 0, 0, size / h, 0, 0])
    d.add(qr)
    svg = renderSVG.drawToString(d)
    idx = svg.find("<svg")
    return svg[idx:] if idx != -1 else svg


# ══════════════════════════════════════════════════════════════════════════════
# TOTP helpers  (pure stdlib — no pyotp dependency)
# ══════════════════════════════════════════════════════════════════════════════

def _totp_generate_secret() -> str:
    """Generate a cryptographically random 20-byte base32 TOTP secret."""
    return _base64.b32encode(_secrets.token_bytes(20)).decode()


def _totp_code(secret: str, t: int | None = None) -> str:
    """Compute the RFC 6238 6-digit TOTP code for a given 30-second time step."""
    if t is None:
        t = int(_time.time()) // 30
    key = _base64.b32decode(secret.upper())
    msg = _struct.pack(">Q", t)
    h   = _hmac.new(key, msg, _hashlib.sha1).digest()
    off = h[-1] & 0x0F
    num = _struct.unpack(">I", h[off:off + 4])[0] & 0x7FFFFFFF
    return f"{num % 1_000_000:06d}"


def _totp_verify(secret: str, code: str) -> bool:
    """Accept codes within ±1 time-step to tolerate minor clock drift."""
    t = int(_time.time()) // 30
    return any(_totp_code(secret, t + i) == code for i in (-1, 0, 1))


def _totp_uri(secret: str, username: str) -> str:
    from urllib.parse import quote
    app_name = Settings.get("app_name", "Vigil")
    return (f"otpauth://totp/{quote(app_name)}:{quote(username)}"
            f"?secret={secret}&issuer={quote(app_name)}&algorithm=SHA1&digits=6&period=30")


# ── Backup codes ──────────────────────────────────────────────────────────────

def _generate_backup_codes(n: int = 8) -> tuple[list[str], str]:
    """
    Generate *n* one-time backup codes.
    Returns (plaintext_list, json_string_of_hashes).
    Codes are stored as bcrypt hashes — never in plaintext.
    bcrypt is used instead of SHA-256 to resist offline brute-force
    if the database is ever extracted.
    """
    import bcrypt as _bcrypt
    codes = []
    for _ in range(n):
        raw = "".join(_secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(10))
        codes.append(f"{raw[:5]}-{raw[5:]}")
    hashed = [_bcrypt.hashpw(c.encode(), _bcrypt.gensalt(rounds=10)).decode() for c in codes]
    return codes, json.dumps(hashed)


def _verify_backup_code(user: User, code: str) -> bool:
    """
    Validate *code* against the user's stored backup code hashes.
    If valid, the used hash is removed (each code is truly one-time).
    Caller must call db.session.commit() after a successful verification.
    Supports both new bcrypt hashes and legacy SHA-256 hashes for
    backwards compatibility with existing installations.
    """
    import bcrypt as _bcrypt
    if not user.totp_backup_codes:
        return False
    clean = code.replace("-", "").replace(" ", "").upper()
    candidates = [clean, f"{clean[:5]}-{clean[5:]}"] if len(clean) == 10 else [code.upper()]
    try:
        hashes = json.loads(user.totp_backup_codes)
    except (json.JSONDecodeError, TypeError):
        return False
    for candidate in candidates:
        for i, h in enumerate(hashes):
            matched = False
            if h.startswith("$2b$") or h.startswith("$2a$"):
                # bcrypt hash (new format)
                try:
                    matched = _bcrypt.checkpw(candidate.encode(), h.encode())
                except Exception:
                    pass
            else:
                # legacy SHA-256 hash — support existing installs
                matched = (_hashlib.sha256(candidate.encode()).hexdigest() == h)
            if matched:
                hashes.pop(i)
                user.totp_backup_codes = json.dumps(hashes)
                return True
    return False


# ── TOTP-pending session helpers ──────────────────────────────────────────────

def _set_totp_pending(user_id: int):
    session["totp_pending_user_id"] = user_id
    session["totp_pending_at"]      = int(_time.time())


def _get_totp_pending_user() -> User | None:
    uid        = session.get("totp_pending_user_id")
    pending_at = session.get("totp_pending_at", 0)
    if not uid:
        return None
    if int(_time.time()) - pending_at > TOTP_PENDING_TTL:
        session.pop("totp_pending_user_id", None)
        session.pop("totp_pending_at",      None)
        return None
    return db.session.get(User, uid)


def _clear_totp_pending():
    session.pop("totp_pending_user_id", None)
    session.pop("totp_pending_at",      None)


def _promote_session(user: User):
    """Upgrade a pending TOTP session (or a fresh login) to a full session."""
    _clear_totp_pending()
    session.permanent  = True   # enables PERMANENT_SESSION_LIFETIME idle timeout
    session["user_id"] = user.id


# ══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@bp.post("/api/auth/login")
@rate_limited(max_hits=10, window_seconds=60)
def auth_login():
    data     = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()[:LEN["username"]]
    password = (data.get("password") or "")[:LEN["password"]]

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid credentials."}), 401

    if user.totp_enabled and user.totp_secret:
        _set_totp_pending(user.id)
        return jsonify({"totp_required": True})

    _promote_session(user)
    return jsonify({"user": user.to_dict()})


@bp.post("/api/auth/totp/login")
@rate_limited(max_hits=10, window_seconds=60)
def auth_totp_login():
    """Second-step TOTP login: validate a 6-digit code for a pending session."""
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    user = _get_totp_pending_user()

    if not user:
        return jsonify({"error": "Login session expired. Please log in again."}), 400
    if not user.totp_enabled or not user.totp_secret:
        _clear_totp_pending()
        return jsonify({"error": "Invalid session."}), 400
    if not _totp_verify(user.totp_secret, code):
        return jsonify({"error": "Invalid or expired code. Please try again."}), 401

    _promote_session(user)
    return jsonify({"user": user.to_dict()})


@bp.post("/api/auth/totp/backup")
@rate_limited(max_hits=10, window_seconds=60)
def auth_totp_backup_login():
    """Second-step login using a one-time backup code instead of TOTP."""
    user = _get_totp_pending_user()
    if not user:
        return jsonify({"error": "Login session expired. Please log in again."}), 400

    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    if not _verify_backup_code(user, code):
        return jsonify({"error": "Invalid or already-used backup code."}), 401

    db.session.commit()
    _promote_session(user)
    return jsonify({"user": user.to_dict()})


@bp.post("/api/auth/logout")
def auth_logout():
    session.clear()
    return jsonify({"status": "ok"})


@bp.get("/api/auth/me")
def auth_me():
    from utils import current_user
    user = current_user()
    if not user:
        return jsonify({"error": "Not logged in", "code": "auth_required"}), 401
    return jsonify({"user": user.to_dict()})


@bp.post("/api/auth/change-password")
@rate_limited(max_hits=10, window_seconds=60)
def auth_change_password():
    user, err = require_auth()
    if err:
        return err
    data       = request.get_json(silent=True) or {}
    current_pw = (data.get("current_password") or "")[:LEN["password"]]
    new_pw     = (data.get("new_password")     or "")[:LEN["password"]]

    if not user.check_password(current_pw):
        return jsonify({"error": "Current password is incorrect."}), 400
    if len(new_pw) < 8:
        return jsonify({"error": "New password must be at least 8 characters."}), 400
    if new_pw.lower() in ("admin", "password", "123456", "12345678"):
        return jsonify({"error": "Please choose a stronger password."}), 400

    user.password_hash  = User.hash_password(new_pw)
    user.must_change_pw = False
    db.session.commit()
    return jsonify({"status": "ok", "user": user.to_dict()})


@bp.post("/api/auth/change-username")
@rate_limited(max_hits=10, window_seconds=60)
def auth_change_username():
    user, err = require_auth()
    if err:
        return err
    data         = request.get_json(silent=True) or {}
    new_username = (data.get("new_username") or "").strip().lower()
    current_pw   = (data.get("current_password") or "")[:LEN["password"]]

    if not new_username:
        return jsonify({"error": "Username cannot be empty."}), 400
    if len(new_username) < 3:
        return jsonify({"error": "Username must be at least 3 characters."}), 400
    if len(new_username) > LEN["username"]:
        return jsonify({"error": f"Username too long (max {LEN['username']} characters)."}), 400
    if not new_username.replace("_", "").replace("-", "").isalnum():
        return jsonify({"error": "Only letters, numbers, hyphens, and underscores are allowed."}), 400
    if not user.check_password(current_pw):
        return jsonify({"error": "Current password is incorrect."}), 400
    if User.query.filter(User.username == new_username, User.id != user.id).first():
        return jsonify({"error": "Username already taken."}), 409

    user.username = new_username
    db.session.commit()
    return jsonify({"status": "ok", "user": user.to_dict()})


# ── TOTP setup & management ───────────────────────────────────────────────────

@bp.post("/api/auth/totp/setup")
def auth_totp_setup():
    """
    Generate a new TOTP secret and QR code.
    Does NOT enable TOTP yet — user must confirm via /confirm.
    """
    user, err = require_auth()
    if err:
        return err
    secret = _totp_generate_secret()
    uri    = _totp_uri(secret, user.username)
    try:
        svg = _qr_svg(uri, size=200)
    except Exception:
        svg = None
    session["totp_pending_secret"] = secret
    return jsonify({"secret": secret, "uri": uri, "svg": svg})


@bp.post("/api/auth/totp/confirm")
@rate_limited(max_hits=10, window_seconds=60)
def auth_totp_confirm():
    """
    Confirm a TOTP code against the pending setup secret, then enable TOTP.
    Also generates and returns a fresh set of one-time backup codes (shown once).
    """
    user, err = require_auth()
    if err:
        return err
    data   = request.get_json(silent=True) or {}
    code   = (data.get("code") or "").strip()
    secret = session.get("totp_pending_secret")

    if not secret:
        return jsonify({"error": "No pending TOTP setup. Please restart setup."}), 400
    if not _totp_verify(secret, code):
        return jsonify({"error": "Invalid code. Check your authenticator and try again."}), 401

    plain_codes, hashed_json = _generate_backup_codes()
    user.totp_secret       = secret
    user.totp_enabled      = True
    user.totp_backup_codes = hashed_json
    db.session.commit()
    session.pop("totp_pending_secret", None)
    return jsonify({
        "user":         user.to_dict(),
        "backup_codes": plain_codes,
        "message":      "TOTP enabled successfully.",
    })


@bp.delete("/api/auth/totp")
@rate_limited(max_hits=5, window_seconds=60)
def auth_totp_disable():
    """Disable TOTP — requires current password for confirmation."""
    user, err = require_auth()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    pw   = (data.get("password") or "")[:LEN["password"]]
    if not user.check_password(pw):
        return jsonify({"error": "Incorrect password."}), 401

    user.totp_secret       = None
    user.totp_enabled      = False
    user.totp_backup_codes = None
    db.session.commit()
    return jsonify({"user": user.to_dict()})


@bp.post("/api/auth/totp/regenerate")
@rate_limited(max_hits=5, window_seconds=60)
def auth_totp_regenerate_backup():
    """Regenerate backup codes — requires current password."""
    user, err = require_auth()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    pw   = (data.get("password") or "")[:LEN["password"]]
    if not user.check_password(pw):
        return jsonify({"error": "Incorrect password."}), 401

    plain_codes, hashed_json = _generate_backup_codes()
    user.totp_backup_codes = hashed_json
    db.session.commit()
    return jsonify({"backup_codes": plain_codes})
