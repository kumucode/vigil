# Vigil — Dependency & Risk Audit
**Version:** v2.3  
**Scope:** Analysis only. No code was modified.

---

## Report 1 — Dependency Necessity Matrix

### Backend Dependencies (`requirements.txt`)

---

#### `flask==3.1.0`
- **Purpose:** Core web framework. Provides routing, request/response handling, session management, blueprints, application factory.
- **Import locations:** `app.py`, `routes/auth.py`, `routes/apps.py`, `routes/hosts.py`, `routes/settings.py`, `utils.py`
- **Runtime criticality:** Fatal — the application cannot start without it.
- **Classification: Required**
- **Evidence:** Used in every route file, application factory, and utility module. Flask's session is the sole session mechanism (Flask-Session is not used).

---

#### `flask-sqlalchemy==3.1.1`
- **Purpose:** SQLAlchemy ORM integration for Flask. All database models, queries, and relationships depend on it.
- **Import locations:** `models.py` (sole import: `from flask_sqlalchemy import SQLAlchemy`)
- **Runtime criticality:** Fatal — no database access without it.
- **Classification: Required**
- **Evidence:** `db = SQLAlchemy()` is the root of every model definition and every database operation in the codebase.

---

#### `flask-cors==4.0.1`
- **Purpose:** Cross-Origin Resource Sharing headers for the `/api/*` routes.
- **Import locations:** `app.py` only (`from flask_cors import CORS`)
- **Runtime criticality:** High — without it, browser-based SPA requests from a different origin or port would fail.
- **Classification: Required**
- **Evidence:** Used in `create_app()` to enable credentials with configurable origins. Critical for the React frontend calling the Flask backend when served from different containers.

---

#### `apscheduler==3.10.4`
- **Purpose:** Background job scheduler. Runs the version-check job on a configurable interval.
- **Import locations:** `scheduler.py` (`from apscheduler.schedulers.background import BackgroundScheduler`)
- **Runtime criticality:** High — without it, automatic version checking does not occur (manual checks still work via the API).
- **Classification: Required**
- **Evidence:** `BackgroundScheduler` is created and started in `start_scheduler()`. The `reschedule_interval()` function uses the scheduler's live rescheduling API.

---

#### `requests==2.32.3`
- **Purpose:** HTTP client for all outbound registry calls (Docker Hub, GitHub, GitLab, Gitea, Quay.io) and Telegram/webhook notification delivery.
- **Import locations:** `scheduler.py` (the sole importer; `import requests`)
- **Runtime criticality:** High — all version checking and notification delivery depends on it.
- **Classification: Required**
- **Evidence:** Used in 7 call sites in `scheduler.py` — registry fetchers and notification senders. No alternative HTTP client is present.

---

#### `gunicorn==22.0.0`
- **Purpose:** Production WSGI server. Invoked directly by `entrypoint.sh` to serve the Flask app.
- **Import locations:** Not imported in Python code; called as a subprocess via `exec gosu appuser gunicorn ...` in `entrypoint.sh`.
- **Runtime criticality:** Fatal in production — no production server without it.
- **Classification: Required**
- **Evidence:** `entrypoint.sh` line 14: `exec gosu appuser gunicorn --bind 0.0.0.0:5000 --workers 1 --threads 4 --timeout 300 app:app`. The Flask dev server is explicitly commented as "dev only."

---

#### `greenlet==3.1.1`
- **Purpose:** Low-level coroutine library. Not used directly in Vigil code; it is a transitive runtime dependency of SQLAlchemy.
- **Import locations:** Not imported anywhere in the codebase.
- **Runtime criticality:** Indirect — SQLAlchemy requires it at runtime for async capabilities and connection pooling internals.
- **Classification: Likely Required**
- **Evidence:** No direct import exists. Explicit pinning in requirements.txt may be to ensure a compatible version of SQLAlchemy's C extension dependencies. Removing the explicit pin would likely not break anything as pip would resolve it transitively, but its presence is a defensive pin rather than an error.

---

#### `pyyaml==6.0.2`
- **Purpose:** YAML parsing. Used for parsing `docker-compose.yml` files submitted by users (compose import) and by the agent before writing files.
- **Import locations:** `routes/apps.py` (`import yaml` at module level), `utils.py` (`import yaml` lazy inside `parse_compose_images()`), `agent/vigil-agent.py` (lazy import inside `_handle_write()`)
- **Runtime criticality:** High — compose import and agent write both fail without it.
- **Classification: Required**
- **Evidence:** `yaml.safe_load()` called in `routes/apps.py:69` and `utils.py:134`. Agent uses it for YAML validation before writing compose files.

---

#### `bcrypt==4.2.1`
- **Purpose:** Password and token hashing. Used for user passwords, TOTP backup codes, agent token hashes, and install token hashes.
- **Import locations:** `models.py` (lazy, 6 call sites), `migrations.py` (line 107), `routes/auth.py` (lazy, 2 call sites), `routes/hosts.py` (module-level import, line 17)
- **Runtime criticality:** Fatal — login, TOTP, and agent provisioning all fail without it.
- **Classification: Required**
- **Evidence:** Every authentication and token verification path uses bcrypt. The `hash_password()` and `check_password()` methods on `User` both use it. All install token verification uses it.

---

#### `flask-session==0.8.0`
- **Purpose:** Claimed: server-side session storage for Flask.
- **Import locations:** Not imported anywhere in the codebase. Zero occurrences of `flask_session`, `FlaskSession`, or `from flask_session` in any Python file.
- **Runtime criticality:** None — Flask's built-in cookie-based sessions are used exclusively throughout.
- **Classification: Unused**
- **Evidence:** Confirmed by exhaustive grep across all `.py` files. Flask's native `session` object from `flask import session` is the only session mechanism. This dependency is listed in `requirements.txt`, installed into the Docker image, and never used.

---

#### `reportlab==4.2.5`
- **Purpose:** QR code SVG generation for TOTP setup screen.
- **Import locations:** `routes/auth.py` only, inside the `_qr_svg()` function (lines 42–44), wrapped in a `try/except Exception` that returns `None` on failure.
- **Runtime criticality:** Low — the fallback path (`svg = None`) means TOTP setup works even without it; the user can still manually enter the `secret` key into their authenticator app.
- **Classification: Likely Required**
- **Evidence:** The import is lazy and failure is gracefully handled. The QR code is the primary UX for TOTP setup, making reportlab important for usability even though its absence does not break functionality. The library is large (2MB+) relative to its single use case.

---

#### `tzdata==2024.2`
- **Purpose:** IANA timezone database for `zoneinfo.ZoneInfo()`. Required on platforms (typically Docker/Linux containers) where the system timezone database may not be present.
- **Import locations:** Not imported directly; `zoneinfo` (stdlib) is imported in `scheduler.py:537` and uses `tzdata` as the fallback timezone database when the OS-level tzdata is absent.
- **Runtime criticality:** Medium — digest scheduling with non-UTC timezones fails without it in Docker containers.
- **Classification: Likely Required**
- **Evidence:** `from zoneinfo import ZoneInfo, ZoneInfoNotFoundError` in `scheduler.py`. The Python `zoneinfo` module falls back to `tzdata` when the OS doesn't have `/usr/share/zoneinfo`. Alpine-based or slim Docker images often lack system timezone data. Without `tzdata`, digest scheduling for non-UTC timezones silently falls back to UTC.

---

#### `cryptography==44.0.2`
- **Purpose:** (1) AES-256-GCM encryption/decryption of agent tokens stored in the Settings table. (2) RSA key generation, X.509 certificate creation and signing for the Private CA and mutual TLS. (3) PBKDF2 key derivation for certificate package encryption.
- **Import locations:** `ca.py` (extensive use, 14 import statements across functions), `routes/hosts.py` (2 lazy import sites for AESGCM)
- **Runtime criticality:** High — TLS provisioning and token storage encryption both require it. Fallback exists for token storage (`plain:` prefix) but produces a security warning.
- **Classification: Required**
- **Evidence:** `ca.py` uses `cryptography.x509`, `cryptography.hazmat.primitives.asymmetric.rsa`, `AESGCM`, `PBKDF2HMAC`. All mTLS functionality depends on this library.

---

### Frontend Dependencies (`package.json`)

---

#### `react==18.3.1` + `react-dom==18.3.1`
- **Purpose:** UI framework and DOM renderer. The entire frontend is a React SPA.
- **Runtime criticality:** Fatal.
- **Classification: Required**

#### `@vitejs/plugin-react==4.3.1`
- **Purpose:** Vite build plugin for React (JSX transform, Fast Refresh in dev). Dev/build time only.
- **Classification: Required** (build time)

#### `vite==5.4.1`
- **Purpose:** Build tool and dev server. Produces the compiled static bundle served by nginx.
- **Classification: Required** (build time)

---

### External Runtime CDN Dependencies (Frontend, not in package.json)

| URL | Purpose | Used when |
|-----|---------|-----------|
| `cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png` | App icons | On every card render with icon |
| `cdn.jsdelivr.net/gh/selfhst/icons/png` | App icons (secondary) | Icon search results |
| `data.jsdelivr.com/v1/package/gh/walkxcode/dashboard-icons@master/flat` | Icon library manifest | Icon search panel open |
| `data.jsdelivr.com/v1/package/gh/selfhst/icons@main/flat` | Icon library manifest | Icon search panel open |

These CDN dependencies are not listed in `package.json` and are not installed or bundled. They are fetched at runtime from the browser. Icon display fails silently if the CDN is unavailable; icon search fails visibly.

---

## Report 2 — Dependency Risk Assessment

### Backend

---

#### `flask==3.1.0` — **Low Risk**
- **Maintenance:** Actively maintained by Pallets; 3.1.0 released late 2024; regular security releases.
- **Security history:** Occasional CVEs (typically in Werkzeug dependency); well-patched. No unresolved critical CVEs.
- **Upgrade complexity:** Low — Flask 3.x is stable API. Minor version bumps are typically non-breaking.
- **Replacement difficulty:** Extremely high — the entire application is Flask.
- **Justification:** Flask is a mature, well-maintained framework. The version is recent. Risk is low because the ecosystem is active and the API is stable.

---

#### `flask-sqlalchemy==3.1.1` — **Low Risk**
- **Maintenance:** Actively maintained; aligns with Flask release cadence.
- **Security history:** No significant standalone CVEs; inherits SQLAlchemy's record (excellent).
- **Upgrade complexity:** Low within 3.x; major version jumps may require model changes.
- **Replacement difficulty:** High — all models use SQLAlchemy ORM patterns.
- **Justification:** Stable, low-risk dependency with no notable security history.

---

#### `flask-cors==4.0.1` — **Low Risk**
- **Maintenance:** Maintained; 4.0.x released in 2024.
- **Security history:** Minimal CVE history. Misconfigurations (e.g. `*` with credentials) are a concern at the application level, not the library level.
- **Upgrade complexity:** Low.
- **Replacement difficulty:** Medium — could be replaced with manual CORS headers in a `@after_request` handler.
- **Justification:** Lightweight library, low risk profile.

---

#### `apscheduler==3.10.4` — **Medium Risk**
- **Maintenance:** Active but development pace has slowed. APScheduler 4.x is in development (not released as stable). The 3.x branch receives maintenance fixes.
- **Security history:** No notable CVEs. The library's risk is architectural (in-process scheduler tied to single-worker gunicorn).
- **Upgrade complexity:** Medium — APScheduler 4.x will introduce breaking changes to the API.
- **Replacement difficulty:** Medium — could be replaced with Celery Beat or a cron-triggered approach, but would require significant refactoring.
- **Justification:** Medium risk due to the upcoming major version transition and the single-worker constraint it imposes on the production deployment. The scheduler is tightly coupled to the Flask application process.

---

#### `requests==2.32.3` — **Low Risk**
- **Maintenance:** Very actively maintained; one of the most widely used Python libraries.
- **Security history:** Historical CVEs related to redirect handling and SSL verification; all patched promptly. 2.32.x is current.
- **Upgrade complexity:** Low — extremely stable API.
- **Replacement difficulty:** Medium — `httpx` or `urllib3` could replace it, but all 7 call sites would need updating.
- **Justification:** Industry-standard library, well-maintained, current version.

---

#### `gunicorn==22.0.0` — **Low Risk**
- **Maintenance:** Actively maintained; 22.x is current.
- **Security history:** Occasional CVEs (typically HTTP request smuggling related); 22.x addresses known issues.
- **Upgrade complexity:** Low — the command-line interface is stable.
- **Replacement difficulty:** Low — could be replaced with `uvicorn`, `waitress`, or `uWSGI` with minimal change to `entrypoint.sh`.
- **Justification:** Mature, well-maintained WSGI server. Current version.

---

#### `greenlet==3.1.1` — **Low Risk**
- **Maintenance:** Maintained as a dependency of SQLAlchemy and gevent.
- **Security history:** No notable CVEs.
- **Upgrade complexity:** Managed transitively by pip.
- **Replacement difficulty:** N/A — it is a transitive dependency.
- **Justification:** Low-risk transitive dependency. The explicit pin in requirements.txt is defensive; its necessity is unverified.

---

#### `pyyaml==6.0.2` — **Low Risk**
- **Maintenance:** Actively maintained; 6.x resolved the long-standing `yaml.load()` arbitrary code execution issue.
- **Security history:** The infamous `yaml.load()` CVE (CVE-2017-18342) is mitigated by consistent use of `yaml.safe_load()` throughout Vigil. 6.0.2 is current.
- **Upgrade complexity:** Low.
- **Replacement difficulty:** Low — `ruamel.yaml` or stdlib-based solutions exist.
- **Justification:** Low risk because `yaml.safe_load()` is used exclusively. Current version.

---

#### `bcrypt==4.2.1` — **Low Risk**
- **Maintenance:** Actively maintained; backed by the `cryptography` team (PyCA).
- **Security history:** No notable CVEs. The library is routinely audited.
- **Upgrade complexity:** Low — stable API.
- **Replacement difficulty:** High — would require migrating all stored hashes.
- **Justification:** Industry-standard password hashing library, current version, well-maintained.

---

#### `flask-session==0.8.0` — **Low Risk** (but classified Unused)
- **Maintenance:** Maintained.
- **Security history:** No critical CVEs; but being in requirements.txt while unused adds unnecessary attack surface.
- **Justification:** The risk is not that the library is dangerous, but that it is an unused installed dependency — an unnecessary component in the container image. Any CVE in flask-session would affect Vigil even though the library provides no functionality.

---

#### `reportlab==4.2.5` — **Medium Risk**
- **Maintenance:** Actively maintained by ReportLab Inc.
- **Security history:** ReportLab has had CVEs related to PDF generation and XML parsing (e.g., CVE-2023-33733 — RCE via malicious ReportLab XML). However, Vigil uses only `QrCodeWidget` and `renderSVG`, not the PDF or XML subsystems. Exposure is limited but the attack surface of the full library is present in the container.
- **Upgrade complexity:** Low within 4.x.
- **Replacement difficulty:** Medium — QR code SVG generation could be replaced with the lightweight `qrcode` library (~50KB vs ~2MB) with minimal code change.
- **Justification:** Medium risk because the library is significantly heavier than needed for its single use case, and its PDF/XML subsystems (with historical CVE history) are present in the image even though unused by Vigil.

---

#### `tzdata==2024.2` — **Low Risk**
- **Maintenance:** Automatically synchronized from the IANA timezone database; updated regularly.
- **Security history:** No CVEs. Pure data package.
- **Upgrade complexity:** Low — just a data update.
- **Replacement difficulty:** N/A — it is a platform data dependency.
- **Justification:** Pure timezone data, no code execution surface. Low risk.

---

#### `cryptography==44.0.2` — **Low Risk**
- **Maintenance:** Actively maintained by PyCA; one of the most security-critical Python libraries.
- **Security history:** Occasional CVEs in OpenSSL bindings; PyCA patches rapidly. 44.0.2 is very recent (early 2025).
- **Upgrade complexity:** Low within 44.x; hazmat API is stable.
- **Replacement difficulty:** High — all mTLS and token encryption functionality depends on it.
- **Justification:** This is the correct library for the cryptographic operations performed. Current version, actively audited.

---

### Frontend

#### `react/react-dom==18.3.1` — **Low Risk**
- React 18.3.x is current and actively maintained by Meta. Security issues are rare; the library's vast user base means rapid response to any issues.

#### `vite==5.4.1` — **Low Risk**
- Vite 5.4.x is maintained. Build-time only dependency; no runtime risk.

#### External CDN dependencies (`cdn.jsdelivr.net`) — **Medium Risk**
- **jsDelivr** is a free CDN with no SLA. Icons being served from an external CDN means icon display depends on CDN availability and content integrity. There is no Subresource Integrity (SRI) hash verification on fetched icon images. A CDN compromise could theoretically serve malicious images, though the practical risk in this context (icon `.png` files displayed in a local dashboard) is low.

---

## Report 3 — Configuration Risk Analysis

### Environment Variables

| Variable | Default | Type | Risk Level |
|----------|---------|------|------------|
| `PORT` | `3000` | Deployment | Low |
| `DATA_DIR` | `/data` | Path | Low |
| `SECURE_COOKIES` | `""` (false) | Security | **High** |
| `SESSION_LIFETIME_HOURS` | `12` | Session | Medium |
| `ALLOWED_ORIGIN` | `"*"` | Security | **High** |
| `CHECK_INTERVAL_HOURS` | `6` | Scheduling | Low |
| `TELEGRAM_TOKEN` | `""` | Secret | High |
| `TELEGRAM_CHAT_ID` | `""` | Secret | Medium |
| `GITHUB_TOKEN` | `""` | Secret | Medium |
| `GITLAB_TOKEN` | `""` | Secret | Medium |
| `GITEA_TOKEN` | `""` | Secret | Medium |

---

### Dangerous Defaults

**1. `SECURE_COOKIES` defaults to `false`**

`app.py` line 65: `os.getenv("SECURE_COOKIES", "").lower() in ("1", "true", "yes")`. The default is effectively `false`. When `SECURE_COOKIES=false`, `SESSION_COOKIE_SECURE=False`, meaning the session cookie is transmitted over plain HTTP. This is by design for LAN deployments, but creates a risk if Vigil is exposed to the internet without this being explicitly set. The session cookie is also the sole authentication mechanism for the entire API. Intercepting it grants full access.

**2. `ALLOWED_ORIGIN` defaults to `"*"`**

`app.py` line 71: `allowed_origin = os.getenv("ALLOWED_ORIGIN", "*")`. CORS with `*` and `supports_credentials=True` (line 73) is technically disallowed by the CORS specification (credentialed requests require explicit origins, not wildcards). In practice, Flask-CORS with `*` and `supports_credentials=True` may behave differently depending on the library version. If CORS enforcement is inadvertently relaxed, any website could make credentialed requests to the Vigil API. The `.env.example` documents this but does not flag it as a security concern.

**3. `/api/agent-provision` has no rate limiting**

`routes/hosts.py` line 664: the `agent_provision()` endpoint is public (no `require_auth()`). The endpoint accepts bcrypt-hashed install tokens — bcrypt verification is deliberately slow, making brute force impractical. However, there is no IP-based rate limiting. A high-volume automated attacker could exhaust server CPU with bcrypt computations, constituting a denial-of-service vector. All other auth endpoints use `@rate_limited(max_hits=10, window_seconds=60)`.

---

### Undocumented Settings

**1. `GITEA_TOKEN`**

`scheduler.py` line 354: `token = os.getenv("GITEA_TOKEN", "")`. This variable is read at runtime and used as an authentication header for Gitea/Forgejo/Codeberg API requests. It is **not present in `.env.example`**, meaning users who self-host Gitea or use Codeberg images will not know this variable exists. Without it, they are subject to unauthenticated API rate limits.

**2. `SESSION_LIFETIME_HOURS`**

Present in `.env.example` but documented only as a comment: `# idle session timeout in hours (default 12)`. No documentation on what constitutes "idle" (this is a `PERMANENT_SESSION_LIFETIME`, not an inactivity timeout — Flask's permanent sessions do not expire on inactivity; they expire at the absolute lifetime). The naming is misleading — the behavior is an absolute expiry, not an idle timeout.

---

### Misleading Settings

**1. `SESSION_LIFETIME_HOURS` — not an idle timeout**

`app.py` line 61: `flask_app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=_session_hours)`. Flask permanent sessions expire at an absolute time after creation. They do not reset on activity. The comment in `.env.example` describes it as "idle session timeout," which is inaccurate. A user who creates a session and actively uses it will still be logged out after 12 hours.

**2. `CHECK_INTERVAL_HOURS` — dual source with potential divergence**

The check interval is read from `os.getenv("CHECK_INTERVAL_HOURS", "6")` at scheduler startup (line 852 of `scheduler.py`). It is also stored in and readable from the Settings table via `Settings.get("check_interval_hours", ...)` in `routes/settings.py` (line 51). When a user changes the interval in the UI, `reschedule_interval()` is called (line 102 of `settings.py`), which updates the live scheduler. However, on container restart, the scheduler reads from the environment variable, not the database, ignoring any UI change. This constitutes silent configuration drift: the UI shows one value, the scheduler uses another after a restart.

---

### Configuration Drift

**1. `CHECK_INTERVAL_HOURS` vs. DB `check_interval_hours` key**

As described above: environment variable takes precedence on restart; DB value takes precedence at runtime. These can diverge silently after a container restart.

**2. `TELEGRAM_TOKEN` / `TELEGRAM_CHAT_ID` — env vs. DB**

The Docker Compose file passes `TELEGRAM_TOKEN` and `TELEGRAM_CHAT_ID` as environment variables to the backend. However, at runtime, the scheduler reads these from `Settings.get("telegram_token", "")` and `Settings.get("telegram_chat_id", "")` (lines 780–781 of `scheduler.py`). The settings UI allows modifying these. After a UI change, the DB value diverges from the environment variable. On the next restart, the env vars are not automatically re-synced to the DB. The source of truth after first run is the DB; the env vars become stale documentation.

**3. `SECRET_KEY` — loss invalidates all agent tokens**

`app.py` lines 42–52: the `SECRET_KEY` is generated once and persisted to `/data/.secret_key`. If this file is lost (e.g., volume deletion), all AES-256-GCM encrypted agent tokens become undecryptable. The `_decrypt_token()` function (hosts.py line 94) will return `None`, silently breaking all host connections. The legacy `plain:` prefix fallback will not help because new tokens are always written as `enc1:`. This is documented in a code comment but is not surfaced to users as an operational concern.

---

## Report 4 — Database Growth Analysis

### Table-by-Table Analysis

---

#### `schema_version` — Static
- **Growth:** Single row. Written once at initial creation, updated once per migration run.
- **Retention:** Permanent. Never deleted.
- **Cleanup:** None needed.
- **Unbounded growth risk:** None.

---

#### `users` — Static (single-user design)
- **Growth:** Designed for a single admin user. No multi-user support exists in the schema or application logic.
- **Retention:** Permanent.
- **Cleanup:** None.
- **Unbounded growth risk:** None. Maximum practical row count: 1.

---

#### `categories` — Slow growth
- **Growth:** 7 default categories seeded at startup. Users can add custom categories. Growth is bounded by the number of service categories a user chooses to create — typically a small number.
- **Retention:** Permanent unless manually deleted.
- **Cleanup:** User-initiated only.
- **Unbounded growth risk:** Negligible. No automated insertion mechanism.

---

#### `tracked_apps` — Moderate, bounded
- **Growth:** One row per tracked Docker image. Growth is bounded by the user's number of managed applications.
- **Retention:** Permanent unless manually deleted.
- **Cleanup:** User-initiated via Delete app.
- **Large payload fields:**
  - `icon_data (Text)`: Stores base64-encoded PNG data up to 512 KB per row. With 50 apps each with a custom icon, this column alone could store 25 MB in the `tracked_apps` table.
  - `version_history (Text)`: JSON array capped at 20 entries by `MAX_HISTORY`. Max size per row is approximately 2 KB. Not a concern.
  - `notes (Text)`: Free-form text, capped at 2000 characters by `LEN["notes"]`. Not a concern.
  - `last_error (Text)`: Uncapped. In theory, an exception message with a full traceback could be large, but in practice error messages are short.
- **`GET /api/apps` response size:** Every API call to list apps returns all fields including `icon_data` for every row. With many apps using large custom icons, this response can become multi-megabyte.
- **Unbounded growth risk:** Low for row count; moderate for `icon_data` column aggregate size as the number of tracked apps grows.

---

#### `hosts` — Small, bounded
- **Growth:** One row per remote agent host. Bounded by infrastructure.
- **Retention:** Permanent unless manually deleted.
- **Cleanup:** User-initiated.
- **Unbounded growth risk:** None.

---

#### `install_tokens` — **Unbounded growth (finding)**
- **Growth mechanism:** A new row is inserted every time `POST /api/hosts/<id>/generate-install-token` is called. This endpoint is called each time the user opens the "Add remote host" wizard step 2.
- **Cleanup behavior:** At the start of `generate_install_token()`, `InstallToken.query.filter_by(host_id=host_id, used=False).delete()` removes unused tokens for that specific host. However, **used tokens** (`used=True`) are never deleted. Each successful agent installation marks `matched.used = True` (line 705) and commits, but no subsequent deletion occurs.
- **Unbounded growth risk: High.** Over time, every successful agent installation accumulates a permanent used-token row. Every abandoned installation wizard attempt (where `used=False` rows are cleaned per-host on next open, but tokens for deleted hosts are not cleaned) can also leave orphaned rows. There is no background cleanup job, no TTL-based deletion, and no administrative purge endpoint.
- **Practical estimate:** Low volume in homelab use, but a user who reinstalls agents repeatedly (e.g., during troubleshooting) generates one permanent row per installation.

---

#### `update_log` — **Moderate unbounded growth (finding)**
- **Growth mechanism:** One row per update or revert operation. With multiple hosts and apps and active update workflows, rows accumulate over time.
- **Retention behavior:** The `GET /api/apps/<id>/logs` endpoint applies a `.limit(50)` at query time, but this is a display limit — rows beyond 50 are not deleted.
- **Cleanup behavior:** `DELETE /api/apps/<id>/logs` exists but is user-initiated. There is no automatic retention policy, no scheduled cleanup, and no maximum row count enforced in the model or at write time.
- **Unbounded growth risk: Medium.** Growth rate depends on update frequency. In a homelab with 20 apps updated weekly, this table could accumulate hundreds of rows per year — manageable. In environments with automated or frequent updates, growth would be faster. No row limit is enforced at write time.
- **Cascade behavior:** When a `tracked_app` is deleted, its update log entries are cascade-deleted (`ON DELETE CASCADE`). However, updates are infrequent enough that most apps are unlikely to be deleted, making cascade deletion an unreliable cleanup mechanism.

---

#### `settings` — Moderate, with large payload concern
- **Growth:** Key-value store with a fixed set of known keys. Growth is bounded by the number of settings keys.
- **Large payload fields:**
  - `app_logo (Text)`: Stores the full base64-encoded logo PNG. The default logo (in `_default_logo.py`) is a large base64 string (`DEFAULT_LOGO_B64`). The `app_logo` value is returned on every `GET /api/settings` call and is also transmitted to the frontend on the pre-login branding fetch. This is a single large value (potentially hundreds of KB for a custom logo) transmitted on every settings load.
  - `host_{id}_token` keys: One key per host storing the AES-256-GCM encrypted agent token. These are small (a few hundred bytes). When a host is deleted, `_delete_token()` explicitly removes the corresponding key. No orphan concern for current code.
  - `custom_css (Text)`: Uncapped. Users can store arbitrary CSS. Not a growth concern in practice.
- **Unbounded growth risk:** Low for row count. Moderate for `app_logo` size if users upload large logos.

---

#### Summary of Growth Concerns

| Table | Risk Level | Primary Concern |
|-------|-----------|-----------------|
| `install_tokens` | **High** | Used tokens never deleted; permanent accumulation per agent install |
| `update_log` | Medium | No automatic retention; user-initiated cleanup only |
| `tracked_apps` | Low-Medium | `icon_data` column size per row; `GET /api/apps` response bloat |
| `settings` | Low | `app_logo` size in `GET /api/settings` response |
| All others | Low | Bounded by user activity |

---

## Report 5 — Security Surface Inventory

### Authentication Mechanisms

**Primary: Session-based cookie authentication**
- Mechanism: Flask `session` dictionary stored in a signed cookie (HMAC-SHA1 using `SECRET_KEY`).
- Cookie attributes: `HttpOnly=True`, `SameSite=Lax`, `Secure` controlled by `SECURE_COOKIES` env var (default: `False`).
- Session lifetime: Absolute expiry set by `PERMANENT_SESSION_LIFETIME` (default: 12 hours). Sessions are permanent (do not auto-renew on activity).
- Login flow: `POST /api/auth/login` → verifies bcrypt password → if TOTP disabled, sets `session["user_id"]`; if TOTP enabled, sets `session["totp_pending_user_id"]` and `session["totp_pending_at"]` pending second factor.
- Session validation: `current_user()` in `utils.py` reads `session.get("user_id")` and looks up the User from DB. `require_auth()` wraps this for route protection.
- No server-side session store: Flask-Session is installed but not imported or used. All session data is in the signed client-side cookie.

**Agent: Token-based authentication (HTTP header)**
- Mechanism: `X-Vigil-Token` header on every agent request.
- Token storage: AES-256-GCM encrypted in `settings` table under `host_{id}_token`. Key derived from `SECRET_KEY` via SHA-256 with a fixed prefix (`"vigil-token-enc-v1:"`).
- Token format: `"vigil-" + secrets.token_hex(32)` (69 characters).
- Agent-side storage: Token stored in `/etc/vigil-agent/config.yml` (mode 600).
- Comparison: Token is retrieved via `_get_token()`, decrypted, and passed in the HTTP request header. The agent compares it using `hmac.compare_digest()` style (exact string comparison after config load — no constant-time comparison is explicitly used in `_check_token()` in the agent; it performs `cfg_token == req_token`).
- Legacy format: Tokens stored before encryption was added used `plain:` prefix; these are still accepted by `_decrypt_token()`.

**Note on `host.token_hash`:** `host.token_hash` is written (bcrypt hash of the agent token) on every host creation and token regeneration, but `host.check_token()` is never called anywhere in production code. The actual token lookup uses `_get_token()` (Settings table, AES path), not `host.token_hash`. This field appears vestigial.

---

### Session Handling

- **Backend type:** Client-side signed cookie (Flask default). No server-side session store.
- **Cookie signing:** HMAC using Flask's `SECRET_KEY` (32 random bytes, generated once, persisted to `/data/.secret_key`).
- **TOTP pending state:** The `totp_pending_user_id`, `totp_pending_at`, and `totp_pending_secret` are stored in the session cookie — i.e., in the client. The pending TOTP secret (generated but not yet confirmed) is stored client-side in the session cookie until TOTP confirmation.
- **Session cookie contents at login:** `{"user_id": <int>}`.
- **Session cookie contents during TOTP setup:** `{"user_id": <int>, "totp_pending_secret": "<base32_secret>"}`.
- **TOTP pending TTL:** 300 seconds checked in `_get_totp_pending_user()` using `time.time()` comparison (line 153–157 of auth.py).
- **Logout:** `session.clear()` — removes all session data.

---

### TOTP Handling

- **Implementation:** Custom from-scratch RFC 6238 TOTP using Python stdlib only (`hmac`, `struct`, `base64`, `time`). No external TOTP library.
- **Secret generation:** `base64.b32encode(secrets.token_bytes(20))` — 20 random bytes encoded as base32.
- **Code verification:** ±1 time-step window (±30 seconds) tolerance for clock drift (`_totp_verify()` checks `t-1`, `t`, `t+1`).
- **Secret storage:** `users.totp_secret` stored as plaintext base32 string in the database. Not encrypted at rest. (Agent tokens use AES-256-GCM; TOTP secrets do not.)
- **Backup codes:** 8 one-time codes, 10 characters each (format `XXXXX-XXXXX`). Stored as JSON array of bcrypt hashes in `users.totp_backup_codes`. bcrypt cost factor: 10. Legacy SHA-256 hashes accepted for backward compatibility.
- **QR code:** Generated as SVG using `reportlab.graphics.barcode.qr.QrCodeWidget`. The TOTP URI includes app name from settings (`otpauth://totp/AppName:username`).
- **Setup flow:** (1) `POST /api/auth/totp/setup` generates secret + stores in session; (2) `POST /api/auth/totp/confirm` verifies one code and enables TOTP.

---

### Certificate Handling

- **Private CA:** 4096-bit RSA key, self-signed X.509 certificate, 3650-day (10-year) validity. Stored as PEM files in `/data/vigil-ca.key` (mode 600) and `/data/vigil-ca.crt`.
- **Agent certificates:** 2048-bit RSA, signed by the Private CA, 3650-day validity. Issued per agent in `ca.py:issue_agent_cert()`. Subject Alternative Names include the host IP.
- **Vigil client certificate:** 2048-bit RSA (`vigil-client.crt`/`vigil-client.key`), signed by the Private CA. Used by Vigil when making outbound mTLS connections to agents.
- **Certificate package delivery:** Agent cert + key + CA cert encrypted with AES-256-GCM using a PBKDF2-derived key from the user-provided decryption key. The encrypted blob is transmitted over the network; the decryption key is typed locally by the user and never transmitted.
- **Fingerprint verification:** SHA-256 fingerprint of the agent certificate is stored in `hosts.cert_fingerprint`. During TLS provisioning, the user visually compares the fingerprint shown in the terminal with what Vigil fetched from the agent. Segments are highlighted red/green in the UI.
- **Certificate revocation:** No mechanism exists. No CRL, no OCSP, no certificate expiry or renewal logic.
- **TLS context building:** `_tls_context()` in `hosts.py` builds `ssl.create_default_context()` with CA verification and client cert loading. `check_hostname=False` because agents are accessed by IP, not hostname. `verify_mode=ssl.CERT_REQUIRED`.

---

### Token Handling

**Install tokens:**
- Single-use, 5-minute TTL.
- Token: `secrets.token_urlsafe()` or similar; stored as bcrypt hash in `install_tokens.token_hash`.
- Decryption key: Independent random value; stored as bcrypt hash in `install_tokens.dec_key_hash`.
- Neither value is stored in plaintext. The decryption key is never transmitted over the network.
- Cleanup: Unused tokens for a host are deleted on new token generation. Used tokens remain permanently (see Report 4).

**Agent runtime tokens:**
- Format: `"vigil-" + secrets.token_hex(32)`.
- Storage: AES-256-GCM encrypted in `settings` table under `host_{id}_token`.
- Encryption key: Derived from `SECRET_KEY` using `SHA-256("vigil-token-enc-v1:" + secret_key)`.
- Plaintext fallback: If the `cryptography` package is unavailable, tokens are stored as `plain:<token>` with a warning log.

---

### Encryption Usage

| Context | Algorithm | Key | Where |
|---------|-----------|-----|-------|
| Agent token storage | AES-256-GCM | SHA-256(SECRET_KEY) | `routes/hosts.py` |
| Certificate package delivery | AES-256-GCM | PBKDF2(user_dec_key, salt, 100000 iter, SHA-256) | `ca.py` |
| CA and agent keys at rest | PEM files, file system permissions (mode 600) | N/A | `/data/` volume |
| Session cookie | HMAC-SHA1 (Flask default) | SECRET_KEY | Flask framework |
| User passwords | bcrypt | (self-contained) | `models.py` |
| TOTP backup codes | bcrypt (cost 10) | (self-contained) | `routes/auth.py` |
| TOTP secrets | None (plaintext in DB) | N/A | `users.totp_secret` |
| Agent tokens in transit | TLS 1.2+ (mTLS) | Agent/Vigil client certs | `urllib.request.urlopen` with ssl context |

---

### Secrets Storage

| Secret | Location | Format | Encrypted? |
|--------|----------|--------|-----------|
| Flask SECRET_KEY | `/data/.secret_key` (binary file) | Raw bytes | File system only (mode depends on volume mount) |
| CA private key | `/data/vigil-ca.key` | PEM | File system (mode 600) |
| Vigil client key | `/data/vigil-client.key` | PEM | File system (mode 600) |
| User password | DB `users.password_hash` | bcrypt hash | Yes (bcrypt) |
| TOTP secret | DB `users.totp_secret` | Plaintext base32 | **No** |
| TOTP backup codes | DB `users.totp_backup_codes` | JSON bcrypt hashes | Yes (bcrypt) |
| Agent token | DB `settings.host_{id}_token` | AES-256-GCM base64 | Yes |
| Install token | DB `install_tokens.token_hash` | bcrypt hash | Yes (bcrypt) |
| Telegram token | DB `settings.telegram_token` | Plaintext | **No** |
| Telegram chat ID | DB `settings.telegram_chat_id` | Plaintext | **No** |
| GitHub/GitLab/Gitea tokens | Environment variables only | Plaintext | **No** (env var) |

---

## Report 6 — Scheduler Risk Analysis

### Registered Jobs

Only one scheduled job is registered: `run_version_checks`.

**Registration:**
```python
_scheduler.add_job(
    run_version_checks,
    args=[flask_app],
    trigger="interval",
    hours=hours,
    id="version_check",
    next_run_time=datetime.now()  # fires immediately on startup
)
```

**Persistence:** `MemoryJobStore` (default). No persistence across restarts. Job re-registers on every container start.

**Backend:** `BackgroundScheduler(daemon=True)` — runs in a daemon thread. Killed when the main process exits.

---

### External Dependencies

The scheduler depends on external services during every job run:

| Service | Endpoint | Purpose | Timeout |
|---------|----------|---------|---------|
| Docker Hub API | `hub.docker.com/v2/repositories/` | Docker Hub version fetch | 12s |
| GitHub API | `api.github.com/repos/` | GitHub Releases fetch | 12s |
| GitLab API | `gitlab.com/api/v4/projects/` | GitLab Releases fetch | 12s |
| Gitea API | Various hosts | Gitea Releases fetch | 12s |
| Quay.io API | `quay.io/api/v1/repository/` | Quay.io tags fetch | 12s |
| Telegram Bot API | `api.telegram.org` | Notification delivery | 10s |
| Webhook URL | User-configured | Notification delivery | 10s |

All these are external internet services. Version checks fail silently (per-app `status = "error"`) when they are unreachable.

---

### Failure Points

**1. No retry logic for failed registry fetches**

When a registry fetch fails (network error, timeout, rate limit, HTTP error), the exception is caught and `entry.status = "error"` is set with `entry.last_error = str(exc)`. There is no retry or backoff. The next retry is the next scheduled job run (hours later). If a registry is temporarily unavailable, every affected app shows `status = "error"` until the next scheduled run.

**2. No Docker Hub rate limit handling**

Docker Hub imposes rate limits on anonymous API requests (100 pulls/6h for anonymous, 200/6h for authenticated). The scheduler makes unauthenticated requests to Docker Hub for every tracked app on every check run. With many apps, the scheduler can exhaust Docker Hub's anonymous rate limit. When a 429 or 401 response occurs, `requests.get(...).raise_for_status()` raises an `HTTPError` which is caught by the outer exception handler and recorded as `status = "error"`. No detection of rate limiting occurs; the scheduler does not back off or slow down.

**3. SQLite write contention under concurrent checks**

The scheduler uses `ThreadPoolExecutor(max_workers=10)` (line 768) to run `_check_one()` for up to 10 apps simultaneously. Each `_check_one()` call opens its own Flask app context and calls `db.session.commit()` (lines 636 and 734). SQLite allows only one writer at a time. Under concurrent writes from 10 threads, SQLite will serialize them with its write lock. Under normal load this works, but if commits are slow (e.g., database file on slow storage), threads will contend on the SQLite write lock and may timeout.

No WAL mode (`PRAGMA journal_mode=WAL`) is enabled; no `check_same_thread=False` is set in the SQLAlchemy connection string; SQLAlchemy's default pool behavior handles this through its connection pool, but the underlying SQLite write-lock contention remains.

**4. Notification delivery failures are silently swallowed**

`send_telegram()` and `_send_webhook()` each call `requests.post()` wrapped in `try/except` blocks that log warnings but do not propagate errors. A Telegram bot token revocation, network outage, or webhook endpoint failure results in a silent loss of notification with only a log line.

**5. Scheduler does not persist state across restarts**

`MemoryJobStore` means the scheduler state is entirely in-memory. If the container restarts, the `_last_run_at`, `_last_run_ok`, and `_last_run_finished_at` global variables are reset to `None`. The scheduler will immediately run a version check on startup (due to `next_run_time=datetime.now()`), regardless of when the last check occurred. In a deploy-heavy workflow, this could trigger multiple rapid consecutive checks.

---

### Race Conditions

**1. `_last_run_at`/`_last_run_ok`/`_last_run_finished_at` — global mutable state**

These three module-level globals are written by `run_version_checks()` (running in the APScheduler background thread) and read by `get_scheduler_status()` (called from Flask request handlers in gunicorn threads). There is no mutex protecting these reads/writes. In theory, a Flask thread reading `_last_run_finished_at` while the scheduler thread is writing it could see a torn value. Python's GIL makes this safe for simple assignments (not for compound operations), but it is not explicitly documented as thread-safe.

**2. SQLite database written by scheduler threads and Flask request threads simultaneously**

Flask request handlers (e.g., `POST /api/check`, `POST /api/apps/<id>/check`) call `run_version_checks()` or `_check_one()` directly in the gunicorn worker threads. The scheduler also runs `run_version_checks()` in its background thread. Both paths write to the SQLite database. SQLAlchemy's connection pooling mediates this, but there is no explicit guard preventing a scheduled run and a user-triggered run from operating concurrently on the same app row.

---

### Recovery Behavior

- **Individual app check failure:** Gracefully handled. `status = "error"` set, `last_error` populated. App continues to exist and will be checked again on the next run.
- **Entire job failure:** The outer `try/except Exception` in `run_version_checks()` at the `ThreadPoolExecutor` level (line 776) catches worker errors, increments `errors`, and continues. `_last_run_ok = errors == 0` records whether any checks failed.
- **Container restart:** All scheduler state is lost. Scheduler restarts fresh with immediate execution.
- **Notification failure:** Silent — logged at WARNING level, not bubbled to user.

---

## Report 7 — Frontend Maintainability Assessment

### File Size Overview

| File | Lines | Role |
|------|-------|------|
| `frontend/src/App.jsx` | 4,515 | **Entire frontend — all views, state, CSS, components** |
| `frontend/src/main.jsx` | 9 | React root mount |
| `frontend/index.html` | ~15 | HTML entry point |

The frontend is a **single-file application**. Every component, every style, every utility function, every state variable, and every API call is in one 4,515-line file.

---

### Component Inventory

**Top-level functions defined before `export default function App()` (23 functions):**

| Function | Type | Lines (approx) |
|----------|------|----------------|
| `copyText` | Utility | 5 |
| `_copyFallback` | Utility | 10 |
| `resolveIconUrl` | Utility | 16 |
| `Tooltip` | Component | ~30 |
| `TzSelect` | Component | ~50 |
| `hsvToRgb`, `rgbToHsv`, `hexToRgb`, `rgbToHex` | Math utilities | ~20 total |
| `AccentColorPicker` | Component | ~200 |
| `parseImage` | Utility | ~20 |
| `AppIcon` | Component | ~30 |
| `resolveChannelUrl` | Utility | ~50 |
| `ChannelPill` | Component | ~35 |
| `stripBlackBackground` | Utility | ~25 |
| `_hexToRgba`, `_contrastOn` | Color utilities | ~15 |
| `LoginScreen` | Component | ~140 |
| `ChangePasswordScreen` | Component | ~65 |
| `CategoryPopover` | Component | ~90 |
| `matchCategory` | Utility | ~15 |
| `Step3Poll` | Component | ~30 |
| `Step2Body` | Component | ~120 |

**Inside `export default function App()` (nested functions, lines 1364–4515):**

| Function | Lines (approx) |
|----------|---------------|
| `autoCategory` | ~55 |
| `getSortedApps` | ~50 |
| `CardMenu` | ~200 (nested component with 5 hooks) |

---

### Hook Density

**Total hooks across the file:** 163
- `useState`: 110
- `useEffect`: 18
- `useCallback`: 11
- `useRef`: 23
- `useMemo`: 1

**In `App()` function alone:** 122 hooks
- `useState`: 87 (87 separate state variables in a single function)
- `useEffect`: 12
- `useCallback`: 9
- `useRef`: 14

**By comparison, React documentation recommends extracting state into custom hooks or sub-components when a component manages more than a handful of state variables.** 87 `useState` declarations in a single function represents one of the highest concentrations of React state in a single component found in self-hosted applications.

---

### State Management Patterns

**No external state management library.** All application state is managed via React `useState` within the single `App()` component. State is passed down to sub-components as props or via closure access (since sub-components are either defined inside `App()` or access module-level functions).

**State categories in `App()`:**
1. Authentication state (`authState`, `currentUser`) — 2 vars
2. Application data (`apps`, `categories`, `hosts`) — 3 vars
3. UI preferences (`darkMode`, `viewMode`, `sortMode`, `cardOrder`) — 4 vars, backed by `localStorage`
4. Modal state (`modal`, `activeApp`, `hostModal`, `activeHost`, etc.) — 10+ vars
5. Form state (edit form fields, compose text, import results) — 15+ vars
6. Settings state (`settings` object + individual field state) — 5+ vars
7. TOTP state (`totpSetup`, `totpConfirmCode`, `totpError`, etc.) — 6 vars
8. Agent/TLS wizard state (`installToken`, `decKey`, `newToken`, `tokenExpiry`, etc.) — 10+ vars
9. UI feedback state (`copiedCurl`, `copiedToken`, etc.) — 4 vars
10. Notification/polling state (`notif`, `schedulerStatus`, `timerTick`) — 3 vars
11. Loading/progress state (`checkingAll`, `updatingApp`, `hostTesting`, `tgTesting`) — 4 vars
12. Filter/search state (`filterCat`, `filterStatus`, `search`) — 3 vars
13. Dropdown/menu state (`open`, `catOpen`, `bellOpen`, `menuPos`, `bellPos`) — 5 vars

---

### Cross-Component Coupling

**`CardMenu` is defined inside `App()`** (line 2278). This means `CardMenu` has access to the entire `App()` scope via closure — it can read and call any state variable or callback without explicit props. This creates tight hidden coupling: modifying any state variable in `App()` could inadvertently affect `CardMenu`'s behavior, and the dependency is invisible in the function signature. This is also where the hooks ordering violation that caused the black-screen bug originated.

**All major views (dashboard, settings, agents, history) are rendered as inline conditional JSX blocks within `App()`'s return statement.** None are separate route components. All share the same state scope.

**The `api` callback** (`useCallback` at line 1492) is the sole API communication function. All 10+ fetch points in `App()` use this callback. A change to `api()`'s behavior affects every API call simultaneously.

---

### Inline Style Density

**411 `style={{...}}` occurrences.** There is no CSS-in-JS library, no CSS modules, no Tailwind. All component-level styling uses inline style objects. This means:
- Styles are not reusable — similar styles are repeated inline in many places.
- Inline styles cannot be overridden by external CSS or user `custom_css` settings (inline styles have higher specificity than class-based rules).
- No compile-time validation of style properties.

One embedded CSS template string (lines 438–462) defines global component classes via a `<style>` element injected into the document. This template contains approximately 450 lines of CSS definitions. However, it does not cover component-level variants, which fall back to inline styles.

---

### Areas Likely to Generate Regression Bugs

**1. React hooks ordering in `App()`**

With 122 hooks in `App()` and 12 `useEffect` calls, some of which have `return` statements (early returns) between them, the hooks ordering constraint is critical. The black-screen bug observed during development (`authState === "loading"` early return placed after hook declarations) is a documented instance of this. Any future addition of an early return or conditional hook call in `App()` can silently trigger React Error #310 at runtime.

**2. `CardMenu` as a nested component**

`CardMenu` is defined with 5 hooks (`useState`, `useRef`) inside `App()`'s scope. React prohibits conditional or dynamic rendering of components that contain hooks in the same render cycle as their parent. This creates a fragile structure where re-ordering `App()`'s render logic near the `CardMenu` usage can produce hooks rule violations.

**3. 87 independent state variables — update atomicity**

Multiple UI interactions require coordinated updates to several state variables. For example, the agent wizard uses `installToken`, `decKey`, `newToken`, `tokenExpiry`, `isPublicIp`, `copiedInstall`, `copiedDecKey`, `copiedToken`, and `copiedCurl` simultaneously. Because these are separate `useState` calls, they update in separate render cycles. Logic that reads multiple of these in a single operation may see inconsistent intermediate states.

**4. `localStorage` and state initialization**

Four state variables are initialized from `localStorage` (`cardOrder`, `sortMode`, `darkMode`, `viewMode`). Any change to the key names or value formats in localStorage will silently revert to defaults for existing users, with no migration or error surfacing.

**5. External CDN availability**

Icon display depends on jsDelivr being reachable. Icon search depends on jsDelivr's API returning a specific JSON format. Changes to the jsDelivr API structure (e.g., file list format) would silently break icon search. No versioning or fallback is implemented beyond `Promise.allSettled`.

---

## Report 8 — Risk Register

| Risk ID | Description | Evidence | Impact Area |
|---------|-------------|---------|-------------|
| RISK-01 | **`flask-session` installed but unused** — The `flask-session==0.8.0` package is listed in `requirements.txt` and installed into the Docker image. Zero imports exist in any `.py` file. Any CVE in `flask-session` affects Vigil despite providing no functionality. | `requirements.txt` line 10; `grep -rn "flask_session"` returns zero results | Security, Maintainability |
| RISK-02 | **`ALLOWED_ORIGIN=*` default with credentialed requests** — CORS is configured with wildcard origin and `supports_credentials=True`. The CORS specification prohibits credentialed cross-origin requests with `*` origin; actual behavior depends on Flask-CORS version. If credentialed requests are allowed from any origin, any website can impersonate a logged-in user. | `app.py` lines 71–73 | Security |
| RISK-03 | **`SECURE_COOKIES` defaults to false** — Session cookies are transmitted over plain HTTP by default. The session cookie is the sole authentication credential for the API. | `app.py` line 65; `.env.example` comment | Security |
| RISK-04 | **TOTP secrets stored in plaintext** — `users.totp_secret` stores the base32 TOTP seed unencrypted in the SQLite database. If the database file is extracted, an attacker can generate valid TOTP codes. Agent tokens and user passwords receive encryption or bcrypt protection; TOTP secrets do not. | `models.py` line 29; contrast with `routes/hosts.py` AES encryption for agent tokens | Security |
| RISK-05 | **`/api/agent-provision` has no rate limiting** — The public endpoint accepts bcrypt verification requests. While bcrypt makes brute force impractical, an attacker can submit thousands of requests per minute. Each request triggers bcrypt comparison CPU work. All other auth endpoints use `@rate_limited`. | `routes/hosts.py` line 664; no `@rate_limited` decorator; contrast with `routes/auth.py` rate-limited endpoints | Security, Reliability |
| RISK-06 | **`install_tokens` table grows unbounded** — Used install tokens (`used=True`) are never deleted. Each successful agent installation leaves a permanent row. Only unused tokens for a specific host are cleaned on new token generation. No background cleanup, no TTL deletion, no administrative purge. | `routes/hosts.py` lines 633, 705; no DELETE for used tokens anywhere | Reliability, Performance |
| RISK-07 | **`update_log` table has no automatic retention** — No row limit is enforced at write time. The display endpoint applies `.limit(50)` at query time but does not delete rows. The only cleanup is user-initiated via `DELETE /api/apps/<id>/logs`. | `routes/hosts.py` line 531–534; no scheduled cleanup; `UpdateLog` model has no row limit | Reliability, Performance |
| RISK-08 | **Configuration drift: `CHECK_INTERVAL_HOURS`** — The check interval is read from the environment variable on startup but from the database at runtime. After a container restart, the scheduler uses the env var value, ignoring any UI-configured value. The two sources can diverge silently. | `scheduler.py` line 852; `routes/settings.py` lines 51–52, 102 | Architecture, Reliability |
| RISK-09 | **Configuration drift: `TELEGRAM_TOKEN`/`TELEGRAM_CHAT_ID`** — Passed as env vars in `docker-compose.yml` but stored/modified in the DB via the UI. After UI changes, env vars become stale. On restart, env var values do not re-sync to DB. | `docker-compose.yml` env vars; `scheduler.py` lines 780–781 reading `Settings.get()`; no sync-from-env on startup | Architecture, Reliability |
| RISK-10 | **`SECRET_KEY` loss invalidates all agent tokens** — If `/data/.secret_key` is deleted or the volume is recreated, all AES-256-GCM encrypted agent tokens cannot be decrypted. All host connections silently fail. No user-facing warning, no graceful degradation. | `routes/hosts.py` lines 64–91; `_decrypt_token()` returns `None` on failure; no downstream alert | Reliability, Documentation |
| RISK-11 | **`host.token_hash` is vestigial** — `host.token_hash` is written on every host creation and regeneration but `host.check_token()` is never called in production code. The actual authentication path uses `_get_token()` (Settings table, AES path). The bcrypt-hashed field stores a value that is never verified. | `routes/hosts.py` lines 271, 356; `host.check_token()` definition in `models.py` line 163; no call sites | Architecture, Maintainability |
| RISK-12 | **`auto_update` field is unimplemented** — The `auto_update` column (`off`/`ask`/`auto`/`silent`) is defined in the model, surfaced in the UI, and stored in the database. The scheduler never reads it to trigger automated updates. Users setting `auto_update = "auto"` will observe no automated behavior. | `models.py` line 108; `scheduler.py` — zero references to `auto_update` | Architecture, Documentation |
| RISK-13 | **`triggered_by` field has dead values** — The `update_log.triggered_by` column accepts `"user"`, `"schedule"`, and `"telegram"`. Only `"user"` is ever written at runtime (in `_log_update()`). `"schedule"` and `"telegram"` are defined in the schema comment but never used. | `models.py` line 237 (default `"user"`); `routes/hosts.py` `_log_update()` — only `"user"` trigger | Documentation, Architecture |
| RISK-14 | **`container_id` field name is misleading** — The column comment says `# e.g. "LXC 101" or "VM 105"`. The field stores a human-readable infrastructure label, not a Docker container ID. The name implies Docker integration that does not exist. | `models.py` line 100 | Documentation, Maintainability |
| RISK-15 | **`GITEA_TOKEN` is undocumented** — The environment variable is read in `scheduler.py` line 354 but is absent from `.env.example`. Users with self-hosted Gitea instances or Codeberg images receive no guidance on this variable. | `scheduler.py` line 354; `.env.example` — no mention of `GITEA_TOKEN` | Documentation |
| RISK-16 | **No Docker Hub rate limit handling** — Registry checks use unauthenticated Docker Hub API requests. With many tracked apps, the 100-request/6h anonymous rate limit can be exhausted. When rate-limited (HTTP 401 or 429), apps are marked `status = "error"` with no diagnostic distinction from other errors. | `scheduler.py` line 193; no 429/rate-limit detection logic | Reliability |
| RISK-17 | **SQLite concurrent write contention** — Up to 10 concurrent threads in `ThreadPoolExecutor` each open a Flask app context and call `db.session.commit()`. SQLite serializes writes. No WAL mode, no `check_same_thread=False` guard, no connection pool tuning. Under slow storage or high app count, write contention may cause delays or SQLite busy errors. | `scheduler.py` lines 636, 734, 768; no PRAGMA WAL anywhere | Reliability, Performance |
| RISK-18 | **App.jsx is a 4,515-line monolith** — The entire frontend — 87 `useState` variables, 12 `useEffect` calls, all views, all CSS, all components — is in one file. The hooks ordering violation that caused the production black-screen bug is a direct consequence of this architecture. Future additions of early returns or conditional logic near hook declarations carry ongoing regression risk. | `App.jsx` line count; hooks analysis; documented black-screen bug incident | Maintainability, Reliability |
| RISK-19 | **`CardMenu` is a hooks-bearing component nested inside `App()`** — React's hooks rules prohibit hooks in functions that are conditionally called or defined inside other components' render scope. `CardMenu` is defined at line 2278 inside `App()` with 5 hook calls. Any conditional rendering pattern applied to it can silently violate hooks rules. | `App.jsx` line 2278; `CardMenu` has `useState`, `useRef` calls | Maintainability, Reliability |
| RISK-20 | **`app_logo` transmitted on every settings load** — The Settings table stores the full base64-encoded logo PNG (potentially hundreds of KB). Every `GET /api/settings` call returns this value. The frontend also fetches `/api/categories` pre-login for branding, but the logo is included on every settings fetch. With a large custom logo, this inflates every settings API response. | `routes/settings.py` line 55; `categories.py` stores default logo; no lazy loading of logo separate from other settings | Performance |
| RISK-21 | **`icon_data` in `GET /api/apps` response** — Every `tracked_apps` row includes `icon_data` (up to 512 KB per row) in `to_dict()`. `GET /api/apps` returns all apps with all fields. With 50 apps each having custom icons, the response can be 25+ MB per request. | `models.py` line 123; `routes/apps.py` `list_apps()` returns all `to_dict()`; no field projection | Performance |
| RISK-22 | **External CDN icon dependencies with no integrity verification** — App icons are loaded at runtime from `cdn.jsdelivr.net`. Icon search fetches manifests from jsDelivr API. No Subresource Integrity (SRI) verification. jsDelivr unavailability causes silent icon failure; a jsDelivr API format change breaks icon search. | `App.jsx` lines 21, 1827–1844 | Reliability, Security |
| RISK-23 | **`SESSION_LIFETIME_HOURS` is documented as "idle timeout" but is absolute** — The `.env.example` comment says "idle session timeout in hours." Flask's `PERMANENT_SESSION_LIFETIME` is an absolute expiry from session creation, not an inactivity timer. A user who actively works for 13 hours is logged out at hour 12 regardless of activity. | `app.py` line 61; `.env.example` comment | Documentation |
| RISK-24 | **`reportlab` carries disproportionate attack surface** — The library (2MB+) includes PDF generation, XML processing, and chart rendering subsystems with historical CVEs (e.g., CVE-2023-33733 affecting XML parsing). Vigil uses only `QrCodeWidget` for TOTP QR SVG, but the full library is installed and present in the container image. | `requirements.txt`; `routes/auth.py` lines 42–44; ReportLab CVE history | Security, Maintainability |
| RISK-25 | **Notification delivery failures are silent** — Telegram and webhook notification failures are logged at WARNING level but not surfaced to the UI. A user who has configured notifications has no way to know that notifications are failing without checking container logs. | `scheduler.py` lines 799–800; `send_telegram()` exception handling | Reliability, Documentation |
| RISK-26 | **Scheduler job re-runs immediately on every container restart** — `next_run_time=datetime.now()` causes the version check job to execute immediately on each container start. In a deployment workflow involving multiple restarts (e.g., build, test, deploy), this triggers repeated immediate version checks regardless of when the last check ran. | `scheduler.py` line 854–857 | Reliability, Performance |
