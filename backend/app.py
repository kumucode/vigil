"""
app.py — Flask application factory for Vigil.

Creates the Flask app, wires up the database, runs migrations,
seeds default data, starts the scheduler, and registers all route
blueprints.  Route logic lives in routes/.

Quick-start:
  docker compose up -d
  open http://<server-ip>:3000

Default credentials: admin / admin  (forced change on first login)
"""

import logging
import os
import secrets
from datetime import timedelta

from flask import Flask
from flask_cors import CORS

from migrations import run_migrations
from models import db
from categories import ensure_default_categories, recategorize_all
from scheduler import start_scheduler

log = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


def _seed_config_from_env(flask_app: Flask) -> None:
    """
    One-time seeding of environment variable values into the Settings table.

    Only seeds keys that are absent or empty in the database — never overwrites
    a value the user has already configured via the UI.

    This resolves the dual-source drift problem for check_interval_hours and
    Telegram credentials: env vars serve as initial-setup convenience; after
    first run the database is always authoritative.

    See: vigil-refactor-execution-plan.md Phase P4, CONFIG-01/CONFIG-02.
    """
    from models import Settings

    seeds = [
        ("check_interval_hours", os.getenv("CHECK_INTERVAL_HOURS", "6")),
        ("telegram_token",       os.getenv("TELEGRAM_TOKEN",       "")),
        ("telegram_chat_id",     os.getenv("TELEGRAM_CHAT_ID",     "")),
    ]
    seeded = []
    for key, env_val in seeds:
        if env_val and not Settings.get(key):
            Settings.set(key, env_val)
            seeded.append(key)
            log.info("Config: seeded '%s' from environment.", key)

    if seeded:
        from models import db as _db
        _db.session.commit()
        log.info("Config seeding complete: %s", seeded)
    else:
        log.info("Config seeding: no keys needed seeding.")


def create_app() -> Flask:
    flask_app = Flask(__name__)

    # ── Database ───────────────────────────────────────────────────────────────
    data_dir = os.getenv("DATA_DIR", "/data")
    db_path  = os.path.join(data_dir, "tracker.db")
    flask_app.config["SQLALCHEMY_DATABASE_URI"]        = f"sqlite:///{db_path}"
    flask_app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # ── Secret key: persisted across restarts, generated once ─────────────────
    secret_file = os.path.join(data_dir, ".secret_key")
    if os.path.exists(secret_file):
        with open(secret_file, "rb") as f:
            flask_app.config["SECRET_KEY"] = f.read()
    else:
        key = secrets.token_bytes(32)
        with open(secret_file, "wb") as f:
            f.write(key)
        flask_app.config["SECRET_KEY"] = key

    # ── Session / cookie security ──────────────────────────────────────────────
    # Set SECURE_COOKIES=true when running behind a TLS reverse proxy.
    # SESSION_LIFETIME_HOURS is an absolute session lifetime (not idle timeout):
    # sessions expire N hours after login regardless of activity.
    _session_hours = int(os.getenv("SESSION_LIFETIME_HOURS", "12"))
    flask_app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=_session_hours)
    flask_app.config["SESSION_COOKIE_HTTPONLY"]    = True
    flask_app.config["SESSION_COOKIE_SAMESITE"]    = "Lax"
    flask_app.config["SESSION_COOKIE_SECURE"]      = (
        os.getenv("SECURE_COOKIES", "").lower() in ("1", "true", "yes")
    )

    db.init_app(flask_app)

    # ── CORS ───────────────────────────────────────────────────────────────────
    allowed_origin = os.getenv("ALLOWED_ORIGIN", "*")
    CORS(flask_app,
         resources={r"/api/*": {"origins": allowed_origin}},
         supports_credentials=True)

    # ── Database init & seeding ────────────────────────────────────────────────
    with flask_app.app_context():
        db.create_all()
        run_migrations(db.engine)
        log.info("Database ready at %s", db_path)
        ensure_default_categories()
        recategorize_all()

        # Seed env-var config values into DB on first run (idempotent).
        # Must run after migrations so the settings table exists.
        _seed_config_from_env(flask_app)

    # ── Private CA (TLS for agent communication) ───────────────────────────────
    try:
        from ca import ensure_ca, ensure_vigil_client_cert
        ensure_ca()
        ensure_vigil_client_cert()
    except Exception as e:
        log.warning("Could not initialise Private CA: %s — agent TLS unavailable", e)

    # ── Scheduler ─────────────────────────────────────────────────────────────
    start_scheduler(flask_app)

    # ── Blueprints ─────────────────────────────────────────────────────────────
    from routes.auth     import bp as auth_bp
    from routes.apps     import bp as apps_bp
    from routes.settings import bp as settings_bp
    from routes.hosts    import bp as hosts_bp

    flask_app.register_blueprint(auth_bp)
    flask_app.register_blueprint(apps_bp)
    flask_app.register_blueprint(settings_bp)
    flask_app.register_blueprint(hosts_bp)

    return flask_app


app = create_app()


# ── Entry point (dev only — production uses gunicorn via entrypoint.sh) ────────
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
