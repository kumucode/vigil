"""
config.py — Application constants, input length caps, and rate-limiter.
"""

import time
from collections import defaultdict

# ── Constants ──────────────────────────────────────────────────────────────────
MAX_ICON_BYTES   = 512 * 1024   # 512 KB max for uploaded icons / logos
TOTP_PENDING_TTL = 300          # seconds a half-login TOTP session stays valid (5 min)

# ── String constants — single source of truth for shared key names ─────────────
# Session keys
SESSION_KEY_USER_ID        = "user_id"
SESSION_KEY_TOTP_PENDING   = "totp_pending_user_id"
SESSION_KEY_TOTP_SECRET    = "totp_pending_secret"
SESSION_KEY_TOTP_EXPIRES   = "totp_pending_expires"

# Settings table keys
SETTINGS_TELEGRAM_TOKEN    = "telegram_token"
SETTINGS_TELEGRAM_CHAT     = "telegram_chat_id"
SETTINGS_WEBHOOK_URL       = "webhook_url"
SETTINGS_DIGEST_MODE       = "digest_mode"
SETTINGS_DIGEST_TIME       = "digest_time"
SETTINGS_DIGEST_DAY        = "digest_day"
SETTINGS_DIGEST_INTERVAL   = "digest_interval_hours"
SETTINGS_DIGEST_TEMPLATE   = "digest_template"
SETTINGS_DIGEST_TIMEZONE   = "digest_timezone"
SETTINGS_CHECK_INTERVAL    = "check_interval_hours"
SETTINGS_NOTIFY_TEMPLATE   = "notify_template"
SETTINGS_SCAN_SUMMARY      = "scan_summary_notify"
SETTINGS_LAST_DIGEST_SENT  = "last_digest_sent"
SETTINGS_APP_NAME          = "app_name"
SETTINGS_APP_LOGO          = "app_logo"
SETTINGS_APP_ACCENT        = "app_accent"
SETTINGS_CUSTOM_CSS        = "custom_css"

# Agent token storage key prefix (full key: f"{TOKEN_KEY_PREFIX}{host_id}")
TOKEN_KEY_PREFIX   = "host_"
TOKEN_KEY_SUFFIX   = "_token"

# Token format prefixes used in _encrypt_token / _decrypt_token
TOKEN_PREFIX_ENC   = "enc1:"
TOKEN_PREFIX_PLAIN = "plain:"

# Floating/pinned version tags — canonical set (scheduler's 24-entry set is authoritative).
# apps.py previously used a 13-entry subset; consolidating to this set means
# tags like 'lts', 'dev', 'canary', 'prod' etc. are correctly treated as pinned
# in the PATCH /api/apps/<id> version-field edit path as well.
# See: vigil-dead-code-analysis.md Task 1 / _SKIP_TAGS divergence finding.
SKIP_TAGS = frozenset({
    "latest", "stable", "nightly", "edge", "beta", "develop", "main",
    "master", "release", "snapshot", "test", "debug", "custom",
    "lts", "current", "production", "prod", "next", "preview",
    "canary", "experimental", "dev", "trunk", "head",
})

# Channel labels — single definition used by scheduler and notifications
# IMPORTANT: update both this dict AND frontend/src/constants.js CHANNEL_META
# whenever a new registry channel is added.
CH_LABELS = {
    "dockerhub": "Docker Hub",
    "github":    "GitHub Releases",
    "gitlab":    "GitLab",
    "gitea":     "Gitea/Forgejo",
    "quay":      "Quay.io",
    "lscr":      "LinuxServer (lscr.io)",
    "unknown":   "Registry",
}

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
