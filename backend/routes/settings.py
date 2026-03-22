"""
routes/settings.py — Settings, notifications, health.

  GET    /api/health
  GET    /api/settings
  POST   /api/settings
  POST   /api/settings/test-telegram
  POST   /api/scan-summary
"""

import base64
import logging
import os

from flask import Blueprint, jsonify, request

from config import MAX_ICON_BYTES
from models import Settings, TrackedApp, db
from scheduler import get_scheduler_status, reschedule_interval
from utils import clamp, now_str, require_auth

log = logging.getLogger(__name__)
bp  = Blueprint("settings", __name__)


# ── Health ────────────────────────────────────────────────────────────────────

@bp.get("/api/health")
def health():
    return jsonify({"status": "ok", "scheduler": get_scheduler_status()})


# ── Settings ──────────────────────────────────────────────────────────────────

@bp.get("/api/settings")
def get_settings():
    _, err = require_auth()
    if err:
        return err
    token = Settings.get("telegram_token", "")
    return jsonify({
        "telegram_token_set":    bool(token),
        "telegram_chat_id":      Settings.get("telegram_chat_id",       ""),
        "webhook_url":           Settings.get("webhook_url",             ""),
        "digest_mode":           Settings.get("digest_mode",             "immediate"),
        "digest_time":           Settings.get("digest_time",             "09:00"),
        "digest_day":            Settings.get("digest_day",              ""),
        "digest_interval_hours": Settings.get("digest_interval_hours",   "6"),
        "digest_template":       Settings.get("digest_template",         ""),
        "digest_timezone":       Settings.get("digest_timezone",         "UTC"),
        "check_interval_hours":  Settings.get("check_interval_hours",
                                              os.getenv("CHECK_INTERVAL_HOURS", "6")),
        "custom_css":            Settings.get("custom_css",              ""),
        "app_name":              Settings.get("app_name",                "Vigil"),
        "app_logo":              Settings.get("app_logo",                ""),
        "app_accent":            Settings.get("app_accent",              "#A0A0B8"),
        "notify_template":       Settings.get("notify_template",         ""),
        "scan_summary_notify":   Settings.get("scan_summary_notify",     "off"),
    })


@bp.post("/api/settings")
def save_settings():
    _, err = require_auth()
    if err:
        return err
    data    = request.get_json(silent=True) or {}
    allowed = (
        "telegram_token", "telegram_chat_id", "webhook_url",
        "digest_mode", "digest_time", "digest_day", "digest_interval_hours",
        "digest_template", "digest_timezone",
        "check_interval_hours", "custom_css",
        "app_name", "app_logo", "app_accent",
        "notify_template", "scan_summary_notify",
    )

    for key in allowed:
        if key not in data:
            continue
        value = data[key]

        if key == "app_logo" and value:
            try:
                _, enc = value.split(",", 1)
                if len(base64.b64decode(enc)) > MAX_ICON_BYTES:
                    return jsonify({"error": "Logo too large (max 512 KB)."}), 413
            except Exception:
                return jsonify({"error": "Invalid logo data."}), 400

        if key == "app_name":
            value = clamp((value or "").strip(), "app_name") or "Vigil"
        elif key == "webhook_url":
            value = clamp((value or "").strip(), "webhook_url")
        elif key == "notify_template":
            value = clamp(value or "", "notify_template")
        elif key == "custom_css":
            if len(value or "") > 50_000:
                log.warning("Large custom_css submitted (%d bytes)", len(value))

        Settings.set(key, value)

        if key == "check_interval_hours":
            try:
                reschedule_interval(max(1, int(value or 6)))
            except Exception:
                pass

    return jsonify({"status": "saved"})


# ── Telegram test ─────────────────────────────────────────────────────────────

@bp.post("/api/settings/test-telegram")
def test_telegram():
    """Send a test Telegram message using the currently configured credentials."""
    _, err = require_auth()
    if err:
        return err
    data    = request.get_json(silent=True) or {}
    token   = data.get("telegram_token")   or Settings.get("telegram_token",   "")
    chat_id = data.get("telegram_chat_id") or Settings.get("telegram_chat_id", "")

    if not token:
        return jsonify({"error": "No Telegram token configured. Save your token first."}), 400
    if not chat_id:
        return jsonify({"error": "No Chat ID configured. Enter your Chat ID first."}), 400

    from scheduler import send_telegram
    try:
        send_telegram(token, chat_id,
                      "✅ *Vigil test notification*\n"
                      "Your Telegram integration is working correctly!")
        return jsonify({"status": "sent"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


# ── Scan summary (called by scheduler after a full check run) ─────────────────

@bp.post("/api/scan-summary")
def scan_summary():
    _, err = require_auth()
    if err:
        return err
    if Settings.get("scan_summary_notify", "off") != "on":
        return jsonify({"status": "disabled"})

    token   = Settings.get("telegram_token",  "")
    chat_id = Settings.get("telegram_chat_id", "")
    if not token or not chat_id:
        return jsonify({"status": "no_credentials"})

    apps     = TrackedApp.query.all()
    outdated = [a for a in apps if a.status == "outdated"]
    errors   = [a for a in apps if a.status == "error"]
    lines    = [f"📊 *Vigil scan complete* — {now_str()[:10]}"]
    if outdated:
        lines.append(f"🔴 {len(outdated)} outdated: " + ", ".join(a.name for a in outdated[:10]))
    if errors:
        lines.append(f"⚠️ {len(errors)} errors: "    + ", ".join(a.name for a in errors[:5]))
    if not outdated and not errors:
        lines.append("✅ All apps are up to date.")

    from scheduler import send_telegram
    try:
        send_telegram(token, chat_id, "\n".join(lines))
    except Exception as exc:
        log.error("scan_summary telegram error: %s", exc)
    return jsonify({"status": "sent"})
