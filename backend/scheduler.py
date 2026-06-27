"""
scheduler.py — APScheduler lifecycle and version-check orchestration.

Responsibilities (post-v2.5 decomposition):
  - APScheduler lifecycle: start_scheduler, get_scheduler_status, reschedule_interval
  - Job function: run_version_checks (thin orchestrator — delegates to services/)
  - Status globals: _last_run_at, _last_run_ok, _last_run_finished_at

All registry, version comparison, notification, and digest logic has been
extracted to services/version_checker.py and services/notifications.py.

Backward-compatible re-exports (for any tooling that imports from scheduler directly):
  send_telegram, _send_webhook / send_webhook — re-exported from notifications
  _check_one                                  — alias for version_checker.check_one
"""

import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from services.version_checker import check_one, resolve_latest_version   # noqa: F401 — public
from services.notifications   import (                                     # noqa: F401
    send_telegram, send_webhook, should_notify,
    dispatch_notifications, send_scan_summary,
)

log = logging.getLogger(__name__)

# ── Backward-compat aliases (existing callers that import private names) ──────
# routes/apps.py:  from scheduler import _check_one
# routes/hosts.py: from scheduler import send_telegram, _send_webhook as send_webhook
# These aliases mean callers continue to work without change until Task 3 updates them.
_check_one   = check_one
_send_webhook = send_webhook     # alias with underscore prefix for legacy callers

# ── Scheduler state ───────────────────────────────────────────────────────────

_scheduler            = None
_last_run_at          = None
_last_run_ok          = None
_last_run_finished_at = None   # set at END of run; used by frontend polling

MAX_WORKERS = 10


# ── Job function (orchestrator) ───────────────────────────────────────────────

def run_version_checks(flask_app, app_ids=None) -> None:
    """
    Main scheduled job.

    Loads app IDs, fans out to version_checker.check_one() via thread pool,
    collects results, dispatches notifications, and fires scan summary.
    All implementation lives in services/; this function is pure orchestration.
    """
    global _last_run_at, _last_run_ok, _last_run_finished_at

    _last_run_at = datetime.now(timezone.utc).isoformat()
    log.info("Version check started…")

    from models import TrackedApp

    with flask_app.app_context():
        all_ids = app_ids or [a.id for a in TrackedApp.query.all()]

    if not all_ids:
        _last_run_ok = True
        _last_run_finished_at = datetime.now(timezone.utc).isoformat()
        return

    errors      = 0
    notify_list = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(check_one, aid, flask_app): aid for aid in all_ids}
        for future in as_completed(futures):
            try:
                r = future.result()
                if r:
                    if not r["ok"]:
                        errors += 1
                    elif r.get("notify"):
                        notify_list.append(r)
            except Exception as exc:
                errors += 1
                log.error("Worker error: %s", exc)

    dispatch_notifications(notify_list, flask_app)
    send_scan_summary(flask_app)

    _last_run_ok          = errors == 0
    _last_run_finished_at = datetime.now(timezone.utc).isoformat()
    log.info("Check done — %d apps, %d errors.", len(all_ids), errors)


# ── Scheduler lifecycle ───────────────────────────────────────────────────────

def start_scheduler(flask_app):
    """Start the APScheduler background job. Called once from app.py on startup."""
    global _scheduler

    from models import Settings
    with flask_app.app_context():
        hours = int(
            Settings.get("check_interval_hours") or
            os.getenv("CHECK_INTERVAL_HOURS", "6")
        )

    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        run_version_checks, args=[flask_app],
        trigger="interval", hours=hours,
        id="version_check", replace_existing=True,
    )
    _scheduler.start()
    log.info("Scheduler started — every %d hour(s).", hours)
    return _scheduler


def get_scheduler_status() -> dict:
    running  = _scheduler is not None and _scheduler.running
    next_run = None
    if _scheduler and running:
        job = _scheduler.get_job("version_check")
        if job and job.next_run_time:
            next_run = job.next_run_time.isoformat()
    return {
        "running":              running,
        "last_run_at":          _last_run_at,
        "last_run_ok":          _last_run_ok,
        "next_run_at":          next_run,
        "last_run_finished_at": _last_run_finished_at,
    }


def reschedule_interval(hours: int) -> None:
    """Update the check interval live — no container restart required."""
    if _scheduler and _scheduler.running:
        _scheduler.reschedule_job("version_check", trigger="interval", hours=hours)
        log.info("Scheduler rescheduled — now every %d hour(s).", hours)
