"""
config.py — Application constants, input length caps, and rate-limiter.
"""

import time
from collections import defaultdict

# ── Constants ──────────────────────────────────────────────────────────────────
MAX_ICON_BYTES   = 512 * 1024   # 512 KB max for uploaded icons / logos
TOTP_PENDING_TTL = 300          # seconds a half-login TOTP session stays valid (5 min)

# Input length caps — enforced on every write endpoint
LEN = {
    "name":            100,
    "image":           300,
    "version":         100,
    "notes":           2000,
    "install_path":    500,
    "category":         50,
    "label":            80,
    "color":            20,
    "keywords":        500,
    "app_name":         80,
    "webhook_url":     500,
    "notify_template": 1000,
    "username":         80,
    "password":        200,
}

# ── Simple in-process rate limiter ─────────────────────────────────────────────
#
# Keeps a per-IP hit counter with a rolling window.  No Redis required.
# Trade-off: counters reset on container restart and are not shared across
# multiple replicas — acceptable for a single-instance self-hosted app.
#
_rate_buckets: dict[str, list[float]] = defaultdict(list)


def rate_limit(key: str, max_hits: int, window_seconds: int) -> bool:
    """
    Return True if the request is ALLOWED, False if it should be blocked.
    key            — usually IP + endpoint slug
    max_hits       — maximum requests allowed in the window
    window_seconds — rolling window length
    """
    now    = time.monotonic()
    cutoff = now - window_seconds
    hits   = _rate_buckets[key]
    _rate_buckets[key] = [t for t in hits if t > cutoff]
    if len(_rate_buckets[key]) >= max_hits:
        return False
    _rate_buckets[key].append(now)
    return True
