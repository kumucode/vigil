"""
utils.py — Shared helpers used across route modules.
"""

import logging
import re
from datetime import datetime, timezone
from functools import wraps

from flask import jsonify, request, session

from config import LEN, rate_limit

log = logging.getLogger(__name__)


# ── Auth helpers ───────────────────────────────────────────────────────────────

def current_user():
    """Return the logged-in User ORM object, or None."""
    from models import User, db
    uid = session.get("user_id")
    return db.session.get(User, uid) if uid else None


def require_auth():
    """Return (user, None) on success or (None, error_response) when not logged in."""
    user = current_user()
    if not user:
        return None, (jsonify({"error": "Unauthorised", "code": "auth_required"}), 401)
    return user, None


# ── Rate-limit decorator ───────────────────────────────────────────────────────

def rate_limited(max_hits: int, window_seconds: int):
    """Decorator — applies rate_limit keyed on remote IP + function name."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            ip  = request.remote_addr or "unknown"
            key = f"{ip}:{fn.__name__}"
            if not rate_limit(key, max_hits, window_seconds):
                log.warning("Rate limit hit: %s", key)
                return jsonify({"error": "Too many attempts. Please wait and try again."}), 429
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# ── Input validation ───────────────────────────────────────────────────────────

def clamp(value: str | None, field: str) -> str | None:
    """Silently truncate a string to the field's declared max length."""
    if value is None:
        return None
    limit = LEN.get(field)
    if limit and len(value) > limit:
        return value[:limit]
    return value


def require_str(
    data: dict,
    field: str,
    label: str | None = None,
    min_len: int = 1,
    required: bool = True,
) -> tuple[str | None, tuple | None]:
    """
    Extract and validate a string field from a request dict.
    Returns (value, None) on success or (None, error_response_tuple) on failure.
    """
    label = label or field
    raw   = (data.get(field) or "").strip()
    if required and not raw:
        return None, (jsonify({"error": f"{label} is required."}), 400)
    if raw and len(raw) > LEN.get(field, 9999):
        return None, (jsonify({"error": f"{label} is too long (max {LEN[field]} characters)."}), 400)
    if raw and len(raw) < min_len:
        return None, (jsonify({"error": f"{label} must be at least {min_len} characters."}), 400)
    return raw or None, None


# ── Misc ───────────────────────────────────────────────────────────────────────

def now_str() -> str:
    return datetime.now(timezone.utc).isoformat()


def norm(s: str | None) -> str:
    """Lowercase, strip leading 'v', collapse whitespace."""
    if not s:
        return ""
    return re.sub(r"\s+", "", s.strip().lstrip("v").lower())


def sort_key(s: str | None) -> tuple:
    if not s:
        return (0,)
    parts = re.split(r"[.\-_]", norm(s))
    result = []
    for p in parts:
        try:
            result.append(int(p))
        except ValueError:
            result.append(p)
    return tuple(result)


def derive_status(version: str, latest: str | None) -> str:
    """Simple status string from two version values."""
    if not latest:
        return "unknown"
    if norm(version) == norm(latest):
        return "up-to-date"
    return "outdated"


def parse_image_name(image: str) -> str:
    """Extract the bare name from a full image string (no registry, no tag)."""
    name = image.split("/")[-1]
    name = name.split(":")[0]
    return name


def parse_compose_images(content: str) -> list[dict]:
    """
    Extract image strings from a docker-compose YAML.
    Returns a list of dicts with 'name' and 'image' keys.
    """
    import yaml
    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError:
        return []
    results = []
    services = (data or {}).get("services", {})
    for svc_name, svc in (services or {}).items():
        image = (svc or {}).get("image", "")
        if image:
            results.append({"name": svc_name, "image": image})
    return results
