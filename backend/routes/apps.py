"""
routes/apps.py — Category and app CRUD, checks, snooze, ignore, history, icons.

  GET    /api/categories
  POST   /api/categories
  PATCH  /api/categories/<id>
  DELETE /api/categories/<id>

  GET    /api/apps
  POST   /api/apps
  POST   /api/apps/import
  GET    /api/apps/export
  POST   /api/apps/recategorize
  PATCH  /api/apps/<id>
  DELETE /api/apps/<id>
  POST   /api/apps/<id>/icon
  POST   /api/apps/<id>/snooze
  DELETE /api/apps/<id>/snooze
  POST   /api/apps/<id>/ignore
  GET    /api/apps/<id>/history
  POST   /api/apps/<id>/check
  POST   /api/check
"""

import base64
import json
import logging
import re
import threading

import yaml
from flask import Blueprint, jsonify, request

from categories import auto_categorize, recategorize_all
from config import LEN, MAX_ICON_BYTES
from models import Category, Settings, TrackedApp, db
from utils import clamp, now_str, require_auth, require_str

log = logging.getLogger(__name__)
bp  = Blueprint("apps", __name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

_GENERIC_NAMES = {"server", "app", "backend", "frontend", "service",
                  "worker", "api", "main", "core", "base"}

_SKIP_TAGS = {"latest", "stable", "nightly", "edge", "develop", "main", "master",
              "release", "snapshot", "beta", "test", "debug", "custom"}


def _parse_image_name(image: str) -> str:
    """Derive a human-readable app name from a Docker image string."""
    base  = image.split(":")[0]
    parts = base.split("/")
    name  = parts[-1]
    if name.lower() in _GENERIC_NAMES and len(parts) > 1:
        candidate = parts[-2]
        if "." not in candidate:
            name = candidate
    return name.replace("-", " ").replace("_", " ").title()


def _parse_compose_images(content: str) -> list[dict]:
    """
    Parse a docker-compose YAML and return a list of
    {'image': ..., 'name': ..., 'version': ...} dicts.
    """
    data     = yaml.safe_load(content)
    services = (data or {}).get("services", {})
    items    = []
    for svc_name, svc in (services or {}).items():
        raw = (svc or {}).get("image", "")
        if not raw:
            continue
        if ":" in raw:
            repo, tag = raw.rsplit(":", 1)
        else:
            repo, tag = raw, "latest"
        items.append({
            "image":   repo,
            "version": tag,
            "name":    _parse_image_name(repo) or svc_name,
        })
    return items


def _norm(s: str | None) -> str:
    return (s or "").lstrip("v")


def _sort_key(s: str | None) -> tuple:
    return tuple(int(x) for x in (_norm(s) or "0").replace("-", ".").split(".") if x.isdigit()) or (0,)


def _derive_status(version: str, latest: str | None) -> str:
    v = _norm(version)
    p = re.split(r"[.\-]", v)[0] if v else ""
    if v in _SKIP_TAGS or p in _SKIP_TAGS:
        return "pinned"
    if not latest:
        return "unknown"
    if _norm(version) == _norm(latest):
        return "up-to-date"
    if _sort_key(version) >= _sort_key(latest):
        return "up-to-date"
    return "outdated"


# ══════════════════════════════════════════════════════════════════════════════
# CATEGORIES
# ══════════════════════════════════════════════════════════════════════════════

@bp.get("/api/categories")
def list_categories():
    # Intentionally public — frontend needs categories before auth to render login
    cats = Category.query.order_by(Category.sort_order, Category.label).all()
    return jsonify([c.to_dict() for c in cats])


@bp.post("/api/categories")
def create_category():
    _, err = require_auth()
    if err:
        return err
    data = request.get_json(silent=True) or {}

    key, e   = require_str(data, "key",   "Category key",   min_len=1)
    if e: return e
    label, e = require_str(data, "label", "Category label", min_len=1)
    if e: return e
    color = clamp((data.get("color") or "#6b6b8a").strip(), "color")

    key = key.lower().replace(" ", "_")
    if Category.query.filter_by(key=key).first():
        return jsonify({"error": "Category key already exists."}), 409

    cat = Category(
        key=key, label=label, color=color,
        keywords=clamp(data.get("keywords", ""), "keywords") or "",
        sort_order=int(data.get("sort_order", 100)),
    )
    db.session.add(cat)
    db.session.commit()
    return jsonify(cat.to_dict()), 201


@bp.patch("/api/categories/<int:cat_id>")
def update_category(cat_id):
    _, err = require_auth()
    if err:
        return err
    cat  = db.get_or_404(Category, cat_id)
    data = request.get_json(silent=True) or {}
    if "label"      in data: cat.label      = clamp(data["label"],    "label")    or cat.label
    if "color"      in data: cat.color      = clamp(data["color"],    "color")    or cat.color
    if "keywords"   in data: cat.keywords   = clamp(data["keywords"], "keywords") or ""
    if "sort_order" in data: cat.sort_order = int(data["sort_order"])
    db.session.commit()
    if "keywords" in data:
        recategorize_all()
    return jsonify(cat.to_dict())


@bp.delete("/api/categories/<int:cat_id>")
def delete_category(cat_id):
    _, err = require_auth()
    if err:
        return err
    cat = db.get_or_404(Category, cat_id)
    if cat.is_default:
        return jsonify({"error": "Built-in categories cannot be deleted."}), 403
    db.session.delete(cat)
    db.session.commit()
    return "", 204


# ══════════════════════════════════════════════════════════════════════════════
# APPS — CRUD
# ══════════════════════════════════════════════════════════════════════════════

@bp.get("/api/apps")
def list_apps():
    _, err = require_auth()
    if err:
        return err
    return jsonify([a.to_dict() for a in TrackedApp.query.order_by(TrackedApp.created_at.desc()).all()])


@bp.post("/api/apps")
def add_app():
    _, err = require_auth()
    if err:
        return err
    data = request.get_json(silent=True) or {}

    image, e   = require_str(data, "image",   "Image")
    if e: return e
    name, e    = require_str(data, "name",    "Name")
    if e: return e
    version, e = require_str(data, "version", "Version")
    if e: return e

    if TrackedApp.query.filter_by(image=image).first():
        return jsonify({"error": "Already tracked."}), 409

    raw_cat  = clamp((data.get("category") or "").strip(), "category")
    category = raw_cat if (raw_cat and raw_cat != "uncategorized") else auto_categorize(image)

    entry = TrackedApp(
        image=image, name=name, version=version,
        category=category, status="unknown",
    )
    db.session.add(entry)
    db.session.commit()
    return jsonify(entry.to_dict()), 201


@bp.post("/api/apps/import")
def import_compose():
    _, err = require_auth()
    if err:
        return err
    content = (request.get_json(silent=True) or {}).get("compose", "")
    if not content:
        return jsonify({"error": "No compose content."}), 400
    try:
        items = _parse_compose_images(content)
    except Exception as exc:
        return jsonify({"error": f"YAML error: {exc}"}), 400

    added, skipped = [], []
    for item in items:
        if TrackedApp.query.filter_by(image=item["image"]).first():
            skipped.append(item["image"])
            continue
        db.session.add(TrackedApp(
            image=item["image"], name=item["name"],
            version=item["version"],
            category=auto_categorize(item["image"]),
            status="unknown",
        ))
        added.append(item["image"])
    db.session.commit()
    return jsonify({"added": added, "skipped": skipped}), 201


@bp.get("/api/apps/export")
def export_apps():
    _, err = require_auth()
    if err:
        return err
    return jsonify({
        "exported_at": now_str(),
        "apps": [a.to_dict() for a in TrackedApp.query.order_by(TrackedApp.created_at).all()],
    })


@bp.post("/api/apps/recategorize")
def recategorize_apps():
    """Re-run auto-categorisation on all non-locked apps."""
    _, err = require_auth()
    if err:
        return err
    updated = recategorize_all()
    apps    = [a.to_dict() for a in TrackedApp.query.order_by(TrackedApp.created_at.desc()).all()]
    return jsonify({"updated": updated, "apps": apps})


@bp.patch("/api/apps/<int:app_id>")
def update_app(app_id):
    _, err = require_auth()
    if err:
        return err
    entry = db.get_or_404(TrackedApp, app_id)
    data  = request.get_json(silent=True) or {}

    if "version" in data:
        entry.version = clamp((data["version"] or "").strip(), "version") or entry.version
        entry.status  = _derive_status(entry.version, entry.latest_version)

    for field in ("category", "notify_policy", "notes",
                  "install_path", "container_id", "ignored_version",
                  "service_name", "auto_update"):
        if field in data:
            setattr(entry, field, clamp(data[field], field))

    # URL fields — only allow http:// and https:// to prevent javascript: and file:// URIs
    for url_field in ("app_url", "version_source_url"):
        if url_field in data:
            raw_url = (data[url_field] or "").strip()
            if raw_url and not raw_url.startswith(("http://", "https://")):
                return jsonify({"error": f"{url_field} must start with http:// or https://"}), 400
            setattr(entry, url_field, clamp(raw_url, url_field) or None)

    if "category" in data:
        chosen = (data["category"] or "").strip()
        entry.category_locked = (chosen != "" and chosen != "uncategorized")

    if "host_id" in data:
        entry.host_id = int(data["host_id"]) if data["host_id"] else None

    if "custom_icon" in data:
        entry.custom_icon = (clamp(data["custom_icon"], "custom_icon") or "").strip() or None

    if "image" in data and (data["image"] or "").strip():
        raw_image = clamp(data["image"].strip(), "image")
        ci, si    = raw_image.rfind(":"), raw_image.rfind("/")
        if ci > si and ci != -1:
            new_image, new_tag = raw_image[:ci], raw_image[ci + 1:]
        else:
            new_image, new_tag = raw_image, None

        conflict = TrackedApp.query.filter(
            TrackedApp.image == new_image, TrackedApp.id != app_id
        ).first()
        if conflict:
            return jsonify({"error": "Another app is already tracking that image."}), 409

        entry.image = new_image
        if new_tag:
            entry.version = clamp(new_tag, "version")
        entry.name = clamp(
            data.get("name", _parse_image_name(new_image)).strip(), "name"
        ) or entry.name

        if "category" not in data:
            best = auto_categorize(new_image)
            if best != "uncategorized":
                entry.category = best

        entry.latest_version     = None
        entry.status             = "unknown"
        entry.detection_channel  = None
        entry.version_source_url = None

    elif "name" in data and (data["name"] or "").strip():
        entry.name = clamp(data["name"].strip(), "name")

    db.session.commit()
    return jsonify(entry.to_dict())


@bp.delete("/api/apps/<int:app_id>")
def delete_app(app_id):
    _, err = require_auth()
    if err:
        return err
    entry = db.get_or_404(TrackedApp, app_id)
    db.session.delete(entry)
    db.session.commit()
    return "", 204


@bp.post("/api/apps/<int:app_id>/icon")
def upload_icon(app_id):
    _, err = require_auth()
    if err:
        return err
    entry = db.get_or_404(TrackedApp, app_id)
    data  = request.get_json(silent=True) or {}

    if not data.get("icon_data"):
        entry.icon_data = None
        db.session.commit()
        return jsonify(entry.to_dict())

    try:
        b64 = data["icon_data"]
        _, encoded = b64.split(",", 1)
        if len(base64.b64decode(encoded)) > MAX_ICON_BYTES:
            return jsonify({"error": "Icon too large (max 512 KB)."}), 413
    except Exception:
        return jsonify({"error": "Invalid icon data."}), 400

    entry.icon_data   = b64
    entry.custom_icon = None
    db.session.commit()
    return jsonify(entry.to_dict())


@bp.post("/api/apps/<int:app_id>/snooze")
def snooze_app(app_id):
    _, err = require_auth()
    if err:
        return err
    entry = db.get_or_404(TrackedApp, app_id)
    data  = request.get_json(silent=True) or {}
    entry.snoozed_until = clamp(data.get("until", ""), "version")
    db.session.commit()
    return jsonify(entry.to_dict())


@bp.delete("/api/apps/<int:app_id>/snooze")
def unsnooze_app(app_id):
    _, err = require_auth()
    if err:
        return err
    entry = db.get_or_404(TrackedApp, app_id)
    entry.snoozed_until = None
    db.session.commit()
    return jsonify(entry.to_dict())


@bp.post("/api/apps/<int:app_id>/ignore")
def ignore_version(app_id):
    _, err = require_auth()
    if err:
        return err
    entry = db.get_or_404(TrackedApp, app_id)
    data  = request.get_json(silent=True) or {}
    entry.ignored_version = clamp(data.get("version"), "version")
    db.session.commit()
    return jsonify(entry.to_dict())


@bp.get("/api/apps/<int:app_id>/history")
def get_history(app_id):
    _, err = require_auth()
    if err:
        return err
    entry = db.get_or_404(TrackedApp, app_id)
    try:
        return jsonify(json.loads(entry.version_history or "[]"))
    except (json.JSONDecodeError, TypeError) as exc:
        log.warning("Failed to parse version_history for app %d: %s", app_id, exc)
        return jsonify([])


# ── Version checks ────────────────────────────────────────────────────────────

@bp.post("/api/apps/<int:app_id>/check")
def check_one_app(app_id):
    """Run a version check for a single app and return the updated record."""
    _, err = require_auth()
    if err:
        return err
    from flask import current_app
    from scheduler import _check_one
    _check_one(app_id, current_app._get_current_object())
    entry = TrackedApp.query.get(app_id)
    if not entry:
        return jsonify({"error": "Not found"}), 404
    return jsonify(entry.to_dict())


@bp.post("/api/check")
def trigger_check():
    """Manually trigger a full version check for all tracked apps."""
    _, err = require_auth()
    if err:
        return err
    from flask import current_app
    from scheduler import run_version_checks
    data    = request.get_json(silent=True) or {}
    app_ids = data.get("app_ids")
    flask_app = current_app._get_current_object()
    threading.Thread(
        target=run_version_checks,
        args=(flask_app, app_ids),
        daemon=True,
    ).start()
    return jsonify({"status": "started"})
