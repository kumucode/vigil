"""
services/notifications.py — Notification delivery for Vigil.

Owns:
  - Telegram delivery          (send_telegram)
  - Webhook delivery           (send_webhook)
  - Template rendering         (_render_template)
  - Per-app notify policy gate (should_notify)
  - Digest scheduling logic    (_should_send_digest)
  - Digest message building    (_build_digest)
  - Scan summary dispatch      (send_scan_summary)

Extracted from scheduler.py in v2.5.
All callers updated to import from here; scheduler.py re-exports public names
for one release cycle to maintain backward compatibility with any external tooling.
"""

import logging
from datetime import datetime, timezone, timedelta

import requests
from config import CH_LABELS

log = logging.getLogger(__name__)

# ── Notification template ─────────────────────────────────────────────────────

# Available template variables: {name} {image} {version} {latest} {bump_type} {channel}
DEFAULT_NOTIFY_TEMPLATE = (
    "🐳 *Update: {name}*\n"
    "Current: `{version}`  →  Latest: `{latest}`\n"
    "Bump: `{bump_type}` · Source: {channel}\n"
    "`{image}`"
)

DEFAULT_DIGEST_TEMPLATE = (
    "🐿️ *Vigil — {count} update(s) available*\n\n"
    "{list}\n\n"
    "_{date}_"
)


def _render_template(tmpl: str, r: dict) -> str:
    """Substitute notification template variables. Falls back gracefully on KeyError."""
    try:
        return tmpl.format(
            name=r.get('name', ''),
            image=r.get('image', ''),
            version=r.get('version', ''),
            latest=r.get('latest', ''),
            bump_type=r.get('bump_type', ''),
            channel=CH_LABELS.get(r.get('channel', ''), 'Registry'),
        )
    except (KeyError, ValueError):
        return DEFAULT_NOTIFY_TEMPLATE.format(
            name=r.get('name', ''), image=r.get('image', ''),
            version=r.get('version', ''), latest=r.get('latest', ''),
            bump_type=r.get('bump_type', ''),
            channel=CH_LABELS.get(r.get('channel', ''), 'Registry'),
        )


# ── Delivery primitives ───────────────────────────────────────────────────────

def send_telegram(token: str, chat_id: str, text: str) -> None:
    """POST a Markdown message to the Telegram Bot API. Raises on HTTP error."""
    r = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
        timeout=10,
    )
    r.raise_for_status()


def send_webhook(url: str, payload: dict) -> None:
    """POST a JSON payload to an arbitrary webhook URL. Best-effort."""
    requests.post(url, json=payload, timeout=10)


# ── Notify policy gate ────────────────────────────────────────────────────────

def should_notify(entry, bump_type: str) -> bool:
    """
    Return True if a notification should be sent for this app/bump combination.

    Respects:
      - notify_policy: always | never | major_only
      - ignored_version: suppress if latest matches ignored
      - snoozed_until:   suppress if still within snooze window
    """
    policy = entry.notify_policy or "always"
    if entry.ignored_version and entry.latest_version == entry.ignored_version:
        return False
    if entry.snoozed_until:
        try:
            if datetime.now(timezone.utc) < datetime.fromisoformat(entry.snoozed_until):
                return False
        except Exception:
            pass
    if policy == "never":
        return False
    if policy == "major_only" and bump_type != "major":
        return False
    return True


# ── Digest helpers ────────────────────────────────────────────────────────────

def _should_send_digest(mode: str) -> bool:
    """
    Evaluate whether a digest notification should fire right now.

    Modes:
      daily    — once per day at digest_time in digest_timezone
      weekly   — once per week on digest_day(s) at digest_time in digest_timezone
      interval — every digest_interval_hours hours
    """
    from models import Settings
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    if mode not in ("daily", "weekly", "interval"):
        return False

    now_utc  = datetime.now(timezone.utc)
    last_str = Settings.get("last_digest_sent", "")

    def _last_dt():
        if not last_str:
            return None
        try:
            return datetime.fromisoformat(last_str)
        except Exception:
            return None

    if mode == "interval":
        try:
            hours = max(1, int(Settings.get("digest_interval_hours", "6")))
        except Exception:
            hours = 6
        last = _last_dt()
        if not last:
            return True
        return (now_utc - last) >= timedelta(hours=hours)

    # Resolve user timezone — fall back to UTC if invalid/missing
    tz_name = Settings.get("digest_timezone", "UTC") or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, Exception):
        tz = timezone.utc
    now = now_utc.astimezone(tz)

    # Parse target time in user's timezone
    try:
        raw_time = Settings.get("digest_time", "09:00") or "09:00"
        th, tm   = map(int, raw_time.split(":"))
        th = max(0, min(23, th))
        tm = max(0, min(59, tm))
    except Exception:
        th, tm = 9, 0

    # Not yet time today (in user's timezone)
    if now.hour < th or (now.hour == th and now.minute < tm):
        return False

    if mode == "daily":
        last = _last_dt()
        if not last:
            return True
        last_local = last.astimezone(tz)
        return last_local.date() < now.date()

    if mode == "weekly":
        try:
            raw         = Settings.get("digest_day", "") or ""
            target_days = {int(d.strip()) for d in raw.split(",") if d.strip().isdigit()}
        except Exception:
            target_days = set()
        if not target_days:
            return False
        if now.weekday() not in target_days:
            return False
        last = _last_dt()
        if not last:
            return True
        last_local = last.astimezone(tz)
        return last_local.date() < now.date()

    return False


def _build_digest(apps: list, template: str | None = None) -> str:
    """Build the digest message body from a list of outdated TrackedApp objects."""
    tmpl      = (template or "").strip() or DEFAULT_DIGEST_TEMPLATE
    lines     = []
    name_lines = []
    for a in apps:
        lines.append(f"• *{a.name}*: `{a.version}` → `{a.latest_version}`")
        name_lines.append(f"• {a.name}")
    list_str  = "\n".join(lines)
    names_str = "\n".join(name_lines)
    date_str  = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        return tmpl.format(count=len(apps), list=list_str, names=names_str, date=date_str)
    except (KeyError, ValueError):
        return DEFAULT_DIGEST_TEMPLATE.format(
            count=len(apps), list=list_str, names=names_str, date=date_str,
        )


# ── Dispatch ──────────────────────────────────────────────────────────────────

def dispatch_notifications(notify_list: list, flask_app) -> None:
    """
    Send immediate or digest notifications after a version check run.

    notify_list: list of result dicts from version_checker.check_one()
                 where result["notify"] is True.
    flask_app:   Flask application (for app_context).

    Reads Settings for telegram_token, telegram_chat_id, webhook_url, digest_mode,
    notify_template, digest_template. Writes last_digest_sent on digest send.
    """
    from models import Settings, TrackedApp, db

    with flask_app.app_context():
        token  = Settings.get("telegram_token",  "")
        chatid = Settings.get("telegram_chat_id", "")
        hook   = Settings.get("webhook_url",      "")
        digest = Settings.get("digest_mode",      "immediate")

        if digest == "immediate":
            tmpl = Settings.get("notify_template", "")
            for r in notify_list:
                if tmpl:
                    msg = _render_template(tmpl, r)
                else:
                    msg = (
                        f"🐳 *Update: {r['name']}*\n"
                        f"Current: `{r['version']}`  →  Latest: `{r['latest']}`\n"
                        f"Bump: `{r['bump_type']}` · Source: {CH_LABELS.get(r['channel'], 'Registry')}\n"
                        f"`{r['image']}`"
                    )
                if token and chatid:
                    try:
                        send_telegram(token, chatid, msg)
                    except Exception as e:
                        log.warning("Telegram: %s", e)
                if hook:
                    try:
                        send_webhook(hook, r)
                    except Exception as e:
                        log.warning("Webhook: %s", e)
        else:
            if _should_send_digest(digest):
                outdated = [
                    a for a in TrackedApp.query.all()
                    if a.status == "outdated"
                    and not (a.ignored_version and a.latest_version == a.ignored_version)
                ]
                if outdated:
                    digest_tmpl = Settings.get("digest_template", "")
                    msg = _build_digest(outdated, template=digest_tmpl)
                    if token and chatid:
                        try:
                            send_telegram(token, chatid, msg)
                        except Exception as e:
                            log.warning("Telegram: %s", e)
                    if hook:
                        try:
                            send_webhook(hook, {"digest": [a.to_dict() for a in outdated]})
                        except Exception as e:
                            log.warning("Webhook: %s", e)
                    Settings.set("last_digest_sent", datetime.now(timezone.utc).isoformat())
                    db.session.commit()


def send_scan_summary(flask_app) -> None:
    """
    Send a Telegram scan-summary message if scan_summary_notify is 'on'.
    Called at the end of every scheduled version check run.

    This is the single canonical implementation — the dead POST /api/scan-summary
    endpoint was removed in v2.4 (P2).
    """
    from models import Settings, TrackedApp

    with flask_app.app_context():
        if Settings.get("scan_summary_notify", "off") != "on":
            return
        token   = Settings.get("telegram_token",  "")
        chat_id = Settings.get("telegram_chat_id", "")
        if not token or not chat_id:
            return

        all_apps = TrackedApp.query.all()
        outdated = [a for a in all_apps if a.status == "outdated"]
        err_apps = [a for a in all_apps if a.status == "error"]
        lines    = [
            f"📊 *Vigil scan complete* — "
            f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
        ]
        if outdated:
            lines.append(
                f"🔴 {len(outdated)} outdated: "
                + ", ".join(a.name for a in outdated[:10])
            )
        if err_apps:
            lines.append(
                f"⚠️ {len(err_apps)} errors: "
                + ", ".join(a.name for a in err_apps[:5])
            )
        if not outdated and not err_apps:
            lines.append("✅ All apps are up to date.")
        try:
            send_telegram(token, chat_id, "\n".join(lines))
            log.info("Scan summary sent to Telegram.")
        except Exception as exc:
            log.warning("Scan summary telegram error: %s", exc)


def notify_action(
    app_name: str,
    action: str,
    from_ver: str,
    to_ver: str,
    status: str,
    host_name: str = "",
    error: str = "",
) -> None:
    """
    Fire a Telegram + webhook notification after an update or revert action.
    Runs best-effort — never raises.

    Previously _notify_action() in routes/hosts.py.
    Moved here in v2.5 so routes/hosts.py no longer imports from scheduler.
    """
    from models import Settings

    try:
        token   = Settings.get("telegram_token",  "")
        chat_id = Settings.get("telegram_chat_id", "")
        webhook = Settings.get("webhook_url",      "")

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
            send_webhook(webhook, {
                "text": msg, "app": app_name,
                "action": action, "status": status,
                "from": from_ver, "to": to_ver,
            })
    except Exception as exc:
        log.warning("notify_action failed: %s", exc)
