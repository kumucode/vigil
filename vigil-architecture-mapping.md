# Vigil — Architecture Mapping
**Version:** v2.3  
**Scope:** Analysis only. No code was modified.

---

## Report 1 — System Context Map

### Subsystem Inventory

---

#### 1. Frontend (React SPA)

**Responsibility:** Renders the entire user interface. Manages all client-side state. Handles authentication screens, the app dashboard (grid/list/table views), settings panel, category management, agent provisioning wizard, and update/revert log views.

**Inputs:**
- User interactions (mouse, keyboard)
- HTTP responses from the backend API (`/api/*`)
- localStorage values (`dt-card-order`, `dt-sort`, `dt-dark`, `dt-view`)
- External CDN responses (icon images from `cdn.jsdelivr.net`, icon manifests from `data.jsdelivr.com`)
- `window.focus` events

**Outputs:**
- HTTP requests to the backend API
- Mutations to `localStorage`
- DOM updates (rendered UI)
- `<style>` element injection (custom CSS from settings)

**Dependencies:**
- Flask backend (via nginx reverse proxy, `GET/POST /api/*`)
- jsDelivr CDN (runtime, icon images)
- `window.localStorage` (sort order, view mode, dark mode, card order)

---

#### 2. nginx Reverse Proxy

**Responsibility:** Single entry point for all external traffic. Routes requests to either the frontend container or the backend container based on URL prefix. Applies HTTP security headers. Provides per-route timeout configuration for long-running update/revert operations.

**Inputs:**
- HTTP requests from the browser (port 3000 → port 80 inside the container)

**Outputs:**
- Proxied requests to `http://frontend:80` (for `/` and static assets)
- Proxied requests to `http://backend:5000` (for `/api/*` and `/agent/*`)

**Configuration:**
- Default `proxy_read_timeout 120s` for all `/api/` routes
- Extended `proxy_read_timeout 300s` for `^/api/apps/[0-9]+/update` and `^/api/apps/[0-9]+/revert`
- Security headers: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- Gzip compression for text, CSS, JSON, JavaScript

---

#### 3. Flask API

**Responsibility:** Handles all authenticated API requests from the frontend. Implements all CRUD operations on apps, categories, hosts, and settings. Manages authentication state. Triggers scheduler operations. Serves agent installation scripts. Validates and sanitizes all inputs.

**Inputs:**
- HTTP requests from nginx (`/api/*`, `/agent/*`)
- Startup signals from Python process
- Database reads via SQLAlchemy

**Outputs:**
- JSON responses to all API callers
- Database writes (via SQLAlchemy)
- File reads (`/data/*.key`, `/data/*.crt`, `/data/tracker.db`)
- Calls into `scheduler.py` functions (`run_version_checks`, `_check_one`, `reschedule_interval`, `send_telegram`)
- Calls into `ca.py` functions (`ensure_ca`, `ensure_vigil_client_cert`, `issue_agent_cert`, `ca_fingerprint`)

**Blueprints:**
- `routes/auth.py` — login, TOTP, password change, username change
- `routes/apps.py` — tracked app CRUD, compose import, check triggers
- `routes/settings.py` — settings KV, health, Telegram test, scan summary
- `routes/hosts.py` — host CRUD, agent communication, TLS provisioning, update/revert

**Dependencies:**
- SQLite database (`/data/tracker.db`)
- `scheduler.py` (direct function imports, no inter-process)
- `ca.py` (on-demand lazy imports)
- `models.py` (all ORM models)
- `categories.py` (auto-categorization, seeding)
- `config.py` (constants, rate limiter)
- `utils.py` (auth helpers, validation)
- `migrations.py` (schema versioning, called at startup)

---

#### 4. APScheduler (Background Scheduler)

**Responsibility:** Runs version checks on a configurable interval. Lives in the same Python process as Flask. Uses a daemon thread. Executes `run_version_checks()` which fans out to 10 concurrent registry fetch workers via `ThreadPoolExecutor`.

**Inputs:**
- Flask application context (passed as argument)
- `CHECK_INTERVAL_HOURS` environment variable (read once at startup)
- `Settings` table keys (`telegram_token`, `telegram_chat_id`, `webhook_url`, `digest_mode`, `notify_template`, etc.)
- Registry HTTP responses

**Outputs:**
- Writes to `TrackedApp` table (status, latest_version, last_checked_at, version_history, last_error)
- Writes to `Settings` table (`last_digest_sent`)
- HTTP POST to Telegram Bot API
- HTTP POST to webhook URLs
- Module-level global state updates (`_last_run_at`, `_last_run_ok`, `_last_run_finished_at`)

**Dependencies:**
- `apscheduler.schedulers.background.BackgroundScheduler`
- `concurrent.futures.ThreadPoolExecutor`
- `requests` (all registry calls)
- Flask app context (each worker thread creates its own)
- Docker Hub API, GitHub API, GitLab API, Gitea API, Quay.io API (external)
- Telegram Bot API, webhook URLs (external, notification path only)

---

#### 5. SQLite Database

**Responsibility:** Persistent storage for all application data. Single file at `/data/tracker.db` on the named Docker volume `tracker-data`.

**Tables:** `schema_version`, `users`, `categories`, `tracked_apps`, `hosts`, `install_tokens`, `update_log`, `settings`

**Inputs:**
- SQLAlchemy ORM write operations from Flask request handlers and scheduler threads

**Outputs:**
- SQLAlchemy ORM read operations

**Dependencies:**
- `/data/tracker.db` on the Docker volume `tracker-data`

---

#### 6. Registry Integrations

**Responsibility:** Fetch the latest available version tag for a given Docker image. Implements detection logic for six channels: Docker Hub, GitHub Releases, GitLab Releases, Gitea/Forgejo, Quay.io, LinuxServer.io (lscr).

**Inputs:**
- Image string (e.g. `linuxserver/sonarr:develop`, `ghcr.io/owner/repo:latest`)
- Optional version hint (current tag, used for channel prefix detection)
- GitHub token (`GITHUB_TOKEN` env var), GitLab token (`GITLAB_TOKEN` env var), Gitea token (`GITEA_TOKEN` env var)

**Outputs:**
- `(latest_version_string, channel_name)` tuple
- Or `(None, "unknown")` on failure

**Routing logic** (in `resolve_latest_version()`):
1. `ghcr.io/*` → try GitHub Releases API, fallback to Docker Hub
2. `lscr.io/*` → Docker Hub (lscr routes through Docker Hub tags), returns `"lscr"` channel key
3. `registry.gitlab.com/*` → GitLab Releases API
4. `quay.io/*` → Quay.io Tags API
5. Host containing `gitea`, `forgejo`, or `codeberg` → Gitea Releases API
6. Everything else → Docker Hub Tags API

---

#### 7. Authentication

**Responsibility:** Enforces login, manages sessions, handles TOTP 2FA, manages backup codes. Implements rate limiting on auth endpoints.

**Inputs:**
- HTTP requests with JSON body (`/api/auth/*`)
- Flask `session` cookie (HMAC-signed by `SECRET_KEY`)

**Outputs:**
- JSON responses
- Session mutations (`session["user_id"]`, `session["totp_pending_*"]`, `session["totp_pending_secret"]`)
- Database writes (User table: `password_hash`, `totp_secret`, `totp_enabled`, `totp_backup_codes`, `must_change_pw`, `username`)

**Dependencies:**
- `bcrypt` (password and backup code hashing)
- `reportlab` (QR code SVG for TOTP setup, optional)
- Python stdlib (`hmac`, `hashlib`, `struct`, `base64`, `time`) for TOTP

---

#### 8. Certificate Authority (Private CA)

**Responsibility:** Generates and maintains the Vigil Private CA and the Vigil client certificate on first start. Issues signed agent certificates on demand during provisioning. Encrypts certificate packages for secure delivery. Never stores agent private keys.

**Inputs:**
- Filesystem reads from `/data/vigil-ca.key`, `/data/vigil-ca.crt`, `/data/vigil-client.key`, `/data/vigil-client.crt`
- `host.name`, `host.ip` for certificate Subject Alternative Names
- Raw decryption key (plaintext, user-provided, used as PBKDF2 input)

**Outputs:**
- PEM files written to `/data/` on first run
- `(ca_cert_pem, agent_cert_pem, agent_key_pem)` tuples — agent_key_pem is never stored
- AES-256-GCM encrypted base64 blob (the certificate package transmitted to the installer)
- SHA-256 fingerprint strings

**Dependencies:**
- `cryptography` library (x509, RSA, AES-256-GCM, PBKDF2HMAC)
- `/data/` volume

---

#### 9. Agent Provisioning

**Responsibility:** Generates short-lived install tokens, issues agent certificates through the CA, encrypts and delivers certificate packages to remote agents, confirms TLS enablement after fingerprint verification.

**Inputs:**
- Authenticated UI requests (generate token, confirm TLS)
- Public request from agent installer (`POST /api/agent-provision`) carrying install token + decryption key
- `Host` record (name, IP for certificate SANs)

**Outputs:**
- `InstallToken` rows in database
- Certificate package blob (returned to installer)
- `host.cert_fingerprint` and `host.tls_enabled` updates in database
- Agent token stored encrypted in `settings` table

---

#### 10. Agent (Remote Process)

**Responsibility:** Runs on remote homelab hosts as a standalone Python HTTP server. Listens on port 7777. Accepts three commands: read a docker-compose.yml, write a patched docker-compose.yml + restart service, revert to a backup. Enforces path traversal protection. Optionally uses mutual TLS.

**Inputs:**
- HTTP requests (with `X-Vigil-Token` header) from the Vigil backend
- Config file `/etc/vigil-agent/config.yml`

**Outputs:**
- JSON responses to the Vigil backend
- Filesystem writes (compose file patches, backups in `.vigil-backups/`)
- `docker compose up -d [service]` subprocess execution

**Dependencies:**
- Python stdlib only (`http.server`, `subprocess`, `hmac`, `ssl`, `pathlib`)
- PyYAML (optional, falls back to simple key:value parser for config; required for compose file validation)
- `/etc/vigil-agent/agent.crt`, `agent.key`, `vigil-ca.crt` (optional, for mTLS)

---

### Textual Architecture Map

```
Browser
  │
  │  HTTP :3000
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  nginx (reverse proxy)                                              │
│  /            → frontend:80  (React SPA static files)              │
│  /api/*        → backend:5000                                       │
│  /agent/*      → backend:5000  (agent scripts served by Flask)     │
└───────────────────┬───────────────────────┬────────────────────────┘
                    │                       │
         ┌──────────▼──────────┐  ┌─────────▼─────────┐
         │  Frontend (nginx)   │  │  Flask Backend     │
         │  React SPA bundle   │  │  (gunicorn, 1W4T)  │
         │  Built by Vite      │  │                    │
         └──────────┬──────────┘  │  routes/auth.py    │
                    │             │  routes/apps.py    │
                 Browser          │  routes/hosts.py   │
                 fetches          │  routes/settings.py│
                 icon PNGs        │                    │
                 from jsDelivr    │  + APScheduler     │
                                  │    (daemon thread) │
                                  └─────────┬──────────┘
                                            │
                    ┌───────────────┬───────┴────────────────────────┐
                    │               │                                │
         ┌──────────▼──────┐ ┌──────▼──────┐       ┌───────────────▼───┐
         │  SQLite DB      │ │  Private CA │       │  Registry APIs     │
         │  /data/tracker  │ │  /data/*.key│       │  Docker Hub        │
         │  .db            │ │  /data/*.crt│       │  GitHub Releases   │
         │                 │ └─────────────┘       │  GitLab Releases   │
         │  7 tables       │                       │  Gitea/Forgejo     │
         └─────────────────┘       ┌───────────────│  Quay.io           │
                                   │               │  lscr.io           │
                                   │               └────────────────────┘
                            ┌──────▼──────┐
                            │  Telegram   │       ┌───────────────────┐
                            │  Bot API    │       │  Remote Agents    │
                            │  (notify)  │       │  vigil-agent.py   │
                            └────────────┘       │  port 7777        │
                                                  │  per homelab host │
                                                  └───────────────────┘
```

---

## Report 2 — Data Ownership Map

### Users

**Authoritative source:** `users` table (single row, `id=1` in practice)  
**Writers:** `migrations.py` (seeds default `admin` user on first run), `routes/auth.py` (password change, username change, TOTP enable/disable/regenerate)  
**Readers:** `utils.py::current_user()`, `routes/auth.py` (all auth endpoints), `routes/apps.py` (via `require_auth`)  
**Lifecycle:** Created once during `run_migrations()` on first startup. Never deleted. Modified by auth endpoints.

---

### Hosts

**Authoritative source:** `hosts` table  
**Writers:** `routes/hosts.py` — create (`add_host`), update (`update_host`, `regenerate_token`, `test_host`, `confirm_tls`), delete (`delete_host`)  
**Readers:** `routes/hosts.py` (all host endpoints), `routes/apps.py` (indirect — `TrackedApp.host_id` FK)  
**Lifecycle:** Created by user via UI. Deleted explicitly. On deletion: `_delete_token()` removes the Settings key, associated apps have `host_id` set to NULL (SET NULL FK behavior).

**Note — dual token storage (multiple sources of truth):**
- `hosts.token_hash` (bcrypt hash): Written on every host creation and token regeneration. `host.check_token()` is defined but never called.
- `settings.host_{id}_token` (AES-256-GCM encrypted): Written on every host creation and token regeneration via `_store_token()`. Read by `_get_token()` for all actual authentication.

These two representations coexist but only the `settings` path is used for agent authentication.

---

### Applications (TrackedApp)

**Authoritative source:** `tracked_apps` table  
**Writers:**
- `routes/apps.py` — create (manual, compose import), update (edit, icon, snooze, ignore), delete
- `scheduler.py::_check_one()` — updates `status`, `latest_version`, `last_checked_at`, `last_successful_check`, `last_error`, `detection_channel`, `version_history`
- `routes/hosts.py::update_app_version()` — updates `version`, `status` after a live compose update
- `categories.py::recategorize_all()` — updates `category` for non-locked apps
**Readers:** `routes/apps.py` (list, export), `scheduler.py` (all IDs at check start, each app in worker), `routes/hosts.py` (for update/revert), `routes/settings.py::scan_summary()`  
**Lifecycle:** Created manually or via compose import. Deleted explicitly (cascade deletes associated `update_log` rows). `host_id` goes NULL if the linked host is deleted.

---

### Settings

**Authoritative source:** `settings` table (key-value store)  
**Writers:**
- `categories.py::ensure_default_categories()` — seeds `app_logo`
- `routes/settings.py::save_settings()` — all user-configurable settings
- `routes/hosts.py::_store_token()` / `_delete_token()` — `host_{id}_token` keys
- `scheduler.py::run_version_checks()` — `last_digest_sent`  
**Readers:**
- `routes/settings.py::get_settings()` — all settings for UI
- `scheduler.py::run_version_checks()` — `telegram_token`, `telegram_chat_id`, `webhook_url`, `digest_mode`, `notify_template`, `scan_summary_notify`, `digest_interval_hours`, `digest_time`, `digest_timezone`, `digest_day`, `last_digest_sent`
- `routes/hosts.py::_get_token()` / `_notify_action()` — per-host token keys, notification credentials
- `routes/auth.py::_totp_uri()` — `app_name`  
**Lifecycle:** Keys are upserted (created or updated) by `Settings.set()`. No automatic deletion except `_delete_token()` when a host is deleted.

**Multiple sources of truth:**
- `check_interval_hours`: Initial value from `CHECK_INTERVAL_HOURS` env var (read at scheduler startup). Subsequent changes go to DB (via `reschedule_interval`). On restart the env var is re-read, ignoring any DB value.
- `telegram_token` / `telegram_chat_id`: Passed as env vars in `docker-compose.yml`, stored/modified in DB via the settings UI. DB is authoritative at runtime; env vars become stale after first UI edit.

---

### Notifications

**Authoritative source:** Not persisted. Notifications are fire-and-forget HTTP requests.  
**Writers:** `scheduler.py::run_version_checks()` (version update notifications, digest notifications, scan summary), `routes/hosts.py::_notify_action()` (update/revert action notifications), `routes/settings.py::test_telegram()` / `scan_summary()`  
**Readers:** N/A — notifications are outbound, not stored (except `last_digest_sent` in Settings)  
**Lifecycle:** Generated at check time or on update/revert events. Not retried on failure.

---

### Certificates

**Authoritative source:** PEM files in `/data/` on the `tracker-data` volume  
**Writers:**
- `ca.py::ensure_ca()` — writes `vigil-ca.key` (mode 600) and `vigil-ca.crt` (mode 644) on first start
- `ca.py::ensure_vigil_client_cert()` — writes `vigil-client.crt` and `vigil-client.key` on first start
- `ca.py::issue_agent_cert()` — generates cert/key in memory; agent cert PEM returned but NOT stored to disk (by design — stored on agent host)
- `routes/hosts.py::agent_provision()` — writes `host.cert_fingerprint` to `hosts` table  
**Readers:** `ca.py` (all functions read PEM files), `routes/hosts.py::_tls_context()` (builds SSL context from files)  
**Lifecycle:** CA and client cert created once on first startup, never rotated. Agent certs issued per provisioning event, 10-year lifetime, no revocation mechanism.

---

### Install Tokens

**Authoritative source:** `install_tokens` table  
**Writers:** `routes/hosts.py::generate_install_token()` — creates new tokens; also deletes unused previous tokens for the same host  
**Readers:** `routes/hosts.py::agent_provision()` — reads all unused tokens for bcrypt comparison  
**Lifecycle:** Created on wizard step 2. Marked `used=True` immediately when the installer calls `/api/agent-provision`. Unused tokens for a host are deleted when a new token is generated for that same host. Used tokens are never deleted.

---

### Scan Results / Version Check Outcomes

**Authoritative source:** Fields on each `TrackedApp` row: `status`, `latest_version`, `last_checked_at`, `last_successful_check`, `last_error`, `detection_channel`, `version_history`  
**Writers:** `scheduler.py::_check_one()` (scheduled and on-demand checks)  
**Readers:** `routes/apps.py::list_apps()`, `routes/settings.py::scan_summary()`, frontend (via `GET /api/apps`)  
**Lifecycle:** Updated on every version check. `version_history` is a JSON array capped at 20 entries by `MAX_HISTORY`. Retained as long as the app row exists.

---

### Update Status (Update Log)

**Authoritative source:** `update_log` table  
**Writers:** `routes/hosts.py::_log_update()` — called after every update or revert attempt  
**Readers:** `routes/hosts.py::get_update_logs()` — returns the 50 most recent per app; `routes/hosts.py::revert_update()` — reads by ID to find backup path  
**Lifecycle:** Rows accumulate permanently. `DeleteAppCascade` on `tracked_apps.id` (ON DELETE CASCADE). No automatic retention. User-initiated clear via `DELETE /api/apps/<id>/logs`.

---

## Report 3 — Configuration Flow Map

### `CHECK_INTERVAL_HOURS`

**Origin:** Environment variable `CHECK_INTERVAL_HOURS` in `docker-compose.yml`  
**Storage:** Scheduler startup (`scheduler.py` line 852), and also `Settings` table under key `check_interval_hours` (after first UI save)  
**Read locations:** `scheduler.py::start_scheduler()` (env var, once at startup); `routes/settings.py::get_settings()` (DB with env var fallback); `routes/settings.py::save_settings()` (triggers `reschedule_interval()`)  
**Update locations:** UI → `POST /api/settings` → `Settings.set("check_interval_hours", ...)` + `reschedule_interval(hours)`  
**Runtime reload behavior:** Calling `reschedule_interval()` via `_scheduler.reschedule_job()` updates the live scheduler immediately without restart  
**Drift:** On container restart, `start_scheduler()` re-reads the environment variable, ignoring any UI-modified DB value. **Can silently diverge.**

---

### `TELEGRAM_TOKEN` / `TELEGRAM_CHAT_ID`

**Origin:** Environment variables in `docker-compose.yml`  
**Storage:** DB `settings` table under keys `telegram_token` and `telegram_chat_id` (after first UI save)  
**Read locations:** `scheduler.py::run_version_checks()` — reads from `Settings.get(...)` only; `routes/hosts.py::_notify_action()` — reads from `Settings.get(...)` only; `routes/settings.py::test_telegram()` — reads from request body or `Settings.get(...)`  
**Update locations:** UI → `POST /api/settings` → `Settings.set("telegram_token", ...)`  
**Runtime reload behavior:** No reload mechanism; DB value is used at runtime  
**Drift:** Env vars are never read at runtime (only at Docker Compose provisioning stage). If env vars are passed to the container but the UI has never been saved, the DB value will be empty. **The env vars appear to drive initial values but have no mechanism to seed the DB.** The scheduler always reads from DB.

---

### `GITHUB_TOKEN` / `GITLAB_TOKEN` / `GITEA_TOKEN`

**Origin:** Environment variables only (`GITHUB_TOKEN` in `docker-compose.yml`; `GITLAB_TOKEN` and `GITEA_TOKEN` undocumented)  
**Storage:** Not persisted to DB  
**Read locations:** `scheduler.py::_gh_headers()` and `_gl_headers()` (at check time, via `os.getenv`); Gitea token via `os.getenv("GITEA_TOKEN", "")` inline in `fetch_gitea_latest`  
**Update locations:** Only via Docker Compose environment variables; requires container restart  
**Runtime reload behavior:** Requires restart  
**Drift:** Cannot drift; single source (env var), read on each check

---

### `SECURE_COOKIES`

**Origin:** Environment variable  
**Storage:** Not persisted; read once at app creation in `create_app()` and applied to Flask config  
**Read locations:** `app.py::create_app()` at startup  
**Update locations:** Only via container restart with changed env var  
**Runtime reload behavior:** Requires restart  
**Drift:** None; single source

---

### `SESSION_LIFETIME_HOURS`

**Origin:** Environment variable  
**Storage:** Not persisted; read once at app creation  
**Read locations:** `app.py::create_app()` at startup  
**Update locations:** Only via container restart  
**Runtime reload behavior:** Requires restart  
**Drift:** None; single source

---

### `ALLOWED_ORIGIN`

**Origin:** Environment variable  
**Storage:** Not persisted; read once at app creation  
**Read locations:** `app.py::create_app()` at startup (applied to Flask-CORS)  
**Update locations:** Only via container restart  
**Runtime reload behavior:** Requires restart  
**Drift:** None; single source

---

### `SECRET_KEY`

**Origin:** Generated once by `create_app()`, persisted to `/data/.secret_key`  
**Storage:** `/data/.secret_key` (binary file), loaded into Flask config `SECRET_KEY` at startup  
**Read locations:** `app.py::create_app()` (to load Flask `SECRET_KEY`); `routes/hosts.py::_derive_encryption_key()` (SHA-256 of SECRET_KEY used for token encryption)  
**Update locations:** Only regenerated if file is absent at startup  
**Runtime reload behavior:** Requires restart  
**Drift:** None in normal operation; losing the file invalidates all encrypted tokens and all sessions

---

### UI-configurable settings (app_name, app_logo, app_accent, custom_css, notify_template, webhook_url, digest_*)

**Origin:** Default values defined inline in `routes/settings.py::get_settings()` (fallback strings)  
**Storage:** `settings` table  
**Read locations:** `routes/settings.py::get_settings()`, `routes/auth.py::_totp_uri()` (reads `app_name`)  
**Update locations:** UI → `POST /api/settings` → `Settings.set()`  
**Runtime reload behavior:** Immediate; next read of `Settings.get()` returns new value  
**Drift:** None; single source (DB)

---

### Per-host agent tokens

**Origin:** Generated by `_generate_token()` in `routes/hosts.py`  
**Storage:** DB `settings` table under key `host_{id}_token` (AES-256-GCM encrypted); also `hosts.token_hash` (bcrypt, vestigial)  
**Read locations:** `routes/hosts.py::_get_token()` → `Settings.get(f"host_{id}_token")`; `routes/hosts.py::test_host()`, `update_app_version()`, `revert_update()`  
**Update locations:** `routes/hosts.py::add_host()`, `routes/hosts.py::regenerate_token()`  
**Runtime reload behavior:** Immediate; retrieved fresh on each agent call  
**Drift:** `hosts.token_hash` and `settings.host_{id}_token` are both written together but only the settings path is ever read back

---

## Report 4 — Scheduler Execution Map

### Workflow 1 — Scheduled Version Check (interval trigger)

**Trigger source:** `BackgroundScheduler.add_job(run_version_checks, trigger="interval", hours=hours)` with `next_run_time=datetime.now()` (fires immediately on startup).

**Execution path:**

```
BackgroundScheduler (daemon thread)
  └─ run_version_checks(flask_app)
       │
       ├─ [1] Set _last_run_at = now()
       │
       ├─ [2] DB read (app context): SELECT id FROM tracked_apps → all_ids
       │
       ├─ [3] ThreadPoolExecutor(max_workers=10)
       │       └─ For each app_id: submit _check_one(app_id, flask_app)
       │                │
       │                ├─ [4] New app context per thread
       │                ├─ [5] DB read: SELECT * FROM tracked_apps WHERE id=app_id
       │                ├─ [6] resolve_latest_version(image, version_hint=version)
       │                │       │
       │                │       ├─ Route: ghcr.io/* → fetch_github_latest_smart()
       │                │       │   └─ GET https://api.github.com/repos/{owner}/{repo}/releases
       │                │       │       (GITHUB_TOKEN header if set)
       │                │       │
       │                │       ├─ Route: lscr.io/* → fetch_dockerhub_latest()
       │                │       │   └─ GET https://hub.docker.com/v2/repositories/{ns}/{repo}/tags/
       │                │       │   Returns channel = "lscr"
       │                │       │
       │                │       ├─ Route: registry.gitlab.com/* → fetch_gitlab_latest()
       │                │       │   └─ GET https://gitlab.com/api/v4/projects/{id}/releases
       │                │       │       (GITLAB_TOKEN header if set)
       │                │       │
       │                │       ├─ Route: quay.io/* → fetch_quay_latest()
       │                │       │   └─ GET https://quay.io/api/v1/repository/{ns}/{repo}
       │                │       │
       │                │       ├─ Route: gitea|forgejo|codeberg host → fetch_gitea_latest()
       │                │       │   └─ GET https://{host}/api/v1/repos/{owner}/{repo}/releases
       │                │       │       (GITEA_TOKEN header if set)
       │                │       │
       │                │       └─ Default → fetch_dockerhub_latest()
       │                │           └─ GET https://hub.docker.com/v2/repositories/{ns}/{repo}/tags/
       │                │
       │                ├─ [7] Version comparison logic (_is_version_tag, _smart_gte)
       │                │       → Sets entry.status = "up-to-date" | "outdated" | "pinned" | "unknown" | "error"
       │                │
       │                ├─ [8] Update version_history JSON (capped at MAX_HISTORY=20)
       │                │
       │                ├─ [9] DB write: UPDATE tracked_apps SET status=..., latest_version=..., etc.
       │                │
       │                └─ [10] Return dict with notify flag
       │
       ├─ [11] Collect notify_list (apps where status just became "outdated" AND notify policy allows)
       │
       ├─ [12] DB read: Settings.get("digest_mode") etc. (new app context)
       │
       ├─ [13a] digest_mode == "immediate": For each app in notify_list:
       │         ├─ _render_template(tmpl, r) → message string
       │         ├─ send_telegram(token, chat_id, msg) [try/except, swallows failure]
       │         └─ _send_webhook(url, r) [try/except, swallows failure]
       │
       ├─ [13b] digest_mode != "immediate": _should_send_digest(digest) → bool
       │         ├─ If True: query all outdated apps, _build_digest(outdated, template)
       │         ├─ send_telegram(...) / _send_webhook(...)
       │         └─ Settings.set("last_digest_sent", now())
       │
       ├─ [14] Set _last_run_ok, _last_run_finished_at
       │
       └─ [15] Scan summary (if scan_summary_notify == "on"):
               ├─ Query all apps from DB
               └─ send_telegram(token, chat_id, summary_msg)
```

**Database interactions:** Steps 2, 5, 9, 12, 13b write and read `tracked_apps` and `settings` tables. Each `_check_one` call opens its own Flask app context and writes to SQLite. Up to 10 concurrent writes possible under `ThreadPoolExecutor`.

**External calls:** Steps 6 (registry APIs, timeout=12s each), 13a/b (Telegram API, timeout=10s; webhook URL, timeout=10s)

**Notification behavior:** Immediate or digest, per `digest_mode`. Scan summary always follows. Failures are caught and logged at WARNING, never surfaced to the UI.

**Failure path:** Per-app exceptions are caught in `_check_one`, setting `status = "error"` and `last_error = str(exc)`. Worker exceptions at the `ThreadPoolExecutor` level are caught, incrementing `errors` counter. `_last_run_ok = errors == 0`.

---

### Workflow 2 — On-Demand Single App Check

**Trigger source:** `POST /api/apps/<id>/check` (authenticated HTTP request)

**Execution path:**
```
HTTP request → routes/apps.py::check_one_app(app_id)
  ├─ require_auth()
  ├─ Import _check_one from scheduler
  ├─ _check_one(app_id, current_app._get_current_object())
  │   └─ [Same as steps 4–10 above, synchronous, in the request thread]
  └─ SELECT * FROM tracked_apps WHERE id=app_id → return JSON
```

**Note:** Runs synchronously in the Flask request handler thread. Blocks until the registry check completes (up to ~12s per fetcher).

---

### Workflow 3 — On-Demand Full Check

**Trigger source:** `POST /api/check` (authenticated HTTP request)

**Execution path:**
```
HTTP request → routes/apps.py::trigger_check()
  ├─ require_auth()
  ├─ Parse optional app_ids from JSON body
  ├─ threading.Thread(target=run_version_checks, args=(flask_app, app_ids), daemon=True).start()
  └─ Return {"status": "started"} immediately
```

The thread runs `run_version_checks()` asynchronously. The frontend polls `GET /api/health` every 3 seconds comparing `last_run_finished_at` to determine completion.

---

### Workflow 4 — Interval Rescheduling

**Trigger source:** `POST /api/settings` with `check_interval_hours` key

**Execution path:**
```
routes/settings.py::save_settings()
  └─ If key == "check_interval_hours":
       └─ reschedule_interval(max(1, int(value)))
            └─ _scheduler.reschedule_job("version_check", trigger="interval", hours=hours)
```

Takes effect immediately on the live scheduler without restart. DB value updated. Next restart will re-read env var.

---

## Report 5 — Application Lifecycle Map

### Phase 1: App Creation

**Manual creation (`POST /api/apps`):**
1. `routes/apps.py::add_app()` validates `image`, `name`, `version` (required strings, length-capped)
2. `TrackedApp.query.filter_by(image=image).first()` — duplicate check (unique on `image`)
3. `auto_categorize(image)` in `categories.py`:
   - Strips registry prefix and tag (`"lscr.io/linuxserver/sonarr:develop"` → `"sonarr"`)
   - First checks user-defined DB categories (by keywords)
   - Then checks `BUILTIN_KEYWORDS` dict
   - Returns category key string or `"uncategorized"`
4. `TrackedApp(image=..., name=..., version=..., category=..., status="unknown")` created and committed
5. Response `201 Created` with `to_dict()` serialization
6. Frontend appends app to `apps` state, then immediately calls `POST /api/apps/<id>/check` to resolve status

**Compose import (`POST /api/apps/import`):**
1. `_parse_compose_images(content)` — `yaml.safe_load()`, extracts service name + image from each service
2. For each image: duplicate check, `auto_categorize()`, create `TrackedApp` row
3. Returns `{added: [...], skipped: [...]}`

---

### Phase 2: Persistence

All app data lives in `tracked_apps` table. `to_dict()` serializes all fields including base64 `icon_data` (up to 512KB). `version_history` stored as JSON string (capped at 20 entries).

---

### Phase 3: Scan Execution

**Triggered by:** APScheduler interval, `POST /api/check`, `POST /api/apps/<id>/check`

1. `_check_one(app_id, flask_app)` opens a Flask app context
2. `db.session.get(TrackedApp, app_id)` — read app record
3. Record the `now_str` timestamp
4. `resolve_latest_version(entry.image, version_hint=entry.version)` — routes to appropriate registry fetcher

---

### Phase 4: Registry Lookup

Based on `resolve_latest_version()` routing (see Report 4, Workflow 1, Step 6). Each fetcher applies tag filtering logic:
- `tag_prefix`: for channel-versioned images (e.g., `nightly-0.8.9.15` → prefix `"nightly"`)
- `version_series`: for LinuxServer date-style tags (`YY.MM.DD` pattern)
- `_semver_key()`: normalizes tags to tuples for comparison
- Returns `(latest_tag_string, channel_key)` or `(None, "unknown")` on failure

---

### Phase 5: Status Calculation

```
_is_version_tag(entry.version) → True/False
  └─ False (floating, e.g. "latest", "nightly") → status = "pinned"
  └─ True (versioned) →
       └─ If no latest from registry → status = "unknown"
       └─ If _norm(version) == _norm(latest) → status = "up-to-date"
       └─ Else _smart_gte(version, latest) →
              None → status = "unknown" (incompatible formats)
              True → status = "up-to-date"
              False → status = "outdated"
  └─ On exception → status = "error", last_error = str(exc)
```

`version_history` JSON is updated if `latest != prev_latest` (prepend newest, cap at 20).

---

### Phase 6: Notification Generation

Notification fires when:
1. `r["notify"]` is True (status just became `"outdated"` AND `prev_status != "outdated"`)
2. `_should_notify(entry, bump_type)` returns True:
   - `notify_policy != "never"` AND
   - `notify_policy != "major_only"` OR bump_type == "major" AND
   - `ignored_version` does not match current `latest_version` AND
   - `snoozed_until` is not in the future

Notification content rendered by `_render_template(tmpl, r)` using `notify_template` from Settings, or default markdown template.

Delivery: `send_telegram()` and/or `_send_webhook()`, both wrapped in `try/except`.

---

### Phase 7: Display in UI

**Data flow:**
1. Frontend `loadApps()` → `GET /api/apps` → `TrackedApp.query.all()` → serialized list with `to_dict()`
2. Frontend `apps` state updated via `setApps(apps)`
3. `getSortedApps()` applies sort mode (custom order from localStorage, or a-z, or z-a)
4. `filtered` computed inline: filter by `filterCat`, `filterStatus`, `search`
5. Rendered in three view modes: grid (card), list, table
6. Status color from `STATUS_COLORS`: `up-to-date` → `#3ce08c`, `outdated` → `#e05c5c`, `error` → `#e08c3c`, `unknown` → `#a78bfa`, `pinned` → `#6b6b8a`
7. Icon resolution: `resolveIconUrl(name, customIcon, iconData)` — uploaded b64 → custom URL → ICON_MAP fuzzy match → CDN URL
8. Channel pill: `ChannelPill({ channel, url })` — routes to registry URL via `resolveChannelUrl()`

**Polling:** `setInterval(loadApps, 60000)` refreshes apps every 60 seconds. `window.addEventListener("focus", loadApps)` refreshes on tab focus.

---

## Report 6 — Authentication & Identity Flow

### Login Flow

```
Browser → POST /api/auth/login { username, password }
  ├─ @rate_limited(max_hits=10, window_seconds=60) [keyed on IP + "auth_login"]
  ├─ User.query.filter_by(username=username.strip().lower()).first()
  ├─ user.check_password(password) → bcrypt.checkpw()
  │   └─ Returns 401 if no user or password mismatch (same message both cases)
  │
  ├─ If user.totp_enabled AND user.totp_secret:
  │   ├─ _set_totp_pending(user.id):
  │   │     session["totp_pending_user_id"] = user.id
  │   │     session["totp_pending_at"] = int(time.time())
  │   └─ Return {"totp_required": True}  → frontend shows TOTP screen
  │
  └─ Else: _promote_session(user):
          session.permanent = True
          session["user_id"] = user.id
          Return {"user": user.to_dict()}
```

**Trust boundary:** Password traverses the network in plaintext (JSON body). HTTPS is optional (SECURE_COOKIES=false by default). Bcrypt comparison is the sole credential verification.

---

### Session Creation

`session` is Flask's default client-side signed cookie. Cookie is HMAC-signed with `SECRET_KEY`. `HttpOnly=True`, `SameSite=Lax`. `Secure` flag controlled by `SECURE_COOKIES` env var (default false).

`session.permanent = True` enables `PERMANENT_SESSION_LIFETIME` (12h by default). This is an absolute expiry from session creation, not an inactivity timer.

---

### Session Validation

```
Every authenticated endpoint calls:
  require_auth() → current_user()
    ├─ uid = session.get("user_id")
    ├─ If uid is None → return (None, 401 response)
    └─ db.session.get(User, uid) → User object or None
         └─ If None → return (None, 401 response)
```

No explicit session expiry check beyond Flask's `PERMANENT_SESSION_LIFETIME`. If the DB user is deleted while a session exists, subsequent requests return 401.

---

### TOTP Validation

```
Browser → POST /api/auth/totp/login { code }
  ├─ @rate_limited(max_hits=10, window_seconds=60)
  ├─ _get_totp_pending_user():
  │     uid = session["totp_pending_user_id"]
  │     pending_at = session["totp_pending_at"]
  │     If (time.time() - pending_at) > TOTP_PENDING_TTL (300s) → return None (expired)
  │     return db.session.get(User, uid)
  ├─ If no pending user → 400 "Login session expired"
  ├─ _totp_verify(user.totp_secret, code):
  │     t = int(time.time()) // 30
  │     Checks codes for t-1, t, t+1 (±30 seconds tolerance)
  │     Returns bool
  └─ On success: _promote_session(user) → session["user_id"] = user.id
```

**Storage interactions:** `totp_secret` is read from `users.totp_secret` (plaintext base32 string). The TOTP pending state (`totp_pending_user_id`, `totp_pending_at`) is stored in the session cookie.

---

### TOTP Enrollment

```
POST /api/auth/totp/setup (authenticated):
  ├─ _totp_generate_secret(): base64.b32encode(secrets.token_bytes(20))
  ├─ _totp_uri(secret, username) → otpauth:// URI including app_name from Settings
  ├─ _qr_svg(uri): try reportlab, on exception return None (graceful fallback)
  ├─ session["totp_pending_secret"] = secret  [stored in session cookie]
  └─ Return { secret, uri, svg }

POST /api/auth/totp/confirm { code } (authenticated):
  ├─ @rate_limited(max_hits=10, window_seconds=60)
  ├─ secret = session.get("totp_pending_secret")
  ├─ _totp_verify(secret, code)
  ├─ On success:
  │     plain_codes, hashed_json = _generate_backup_codes(n=8)
  │     user.totp_secret = secret    [DB write, plaintext base32]
  │     user.totp_enabled = True
  │     user.totp_backup_codes = hashed_json   [bcrypt hashes]
  │     db.session.commit()
  │     session.pop("totp_pending_secret")
  └─ Return { user, backup_codes (plaintext, shown once) }
```

**Trust boundary:** TOTP secret stored plaintext in DB. Backup codes stored as bcrypt hashes. The `otpauth://` URI (containing the secret) is returned in the HTTP response body and rendered as a QR code.

---

### Agent Provisioning Flow

```
[Step 1 - Generate token] POST /api/hosts/<id>/generate-install-token (authenticated):
  ├─ InstallToken.query.filter_by(host_id=host_id, used=False).delete()  [clean unused]
  ├─ raw_token = "install-" + secrets.token_hex(16)   [not stored]
  ├─ raw_dec_key = secrets.token_hex(16)              [not stored]
  ├─ it = InstallToken(
  │         token_hash = bcrypt.hashpw(raw_token, gensalt()),
  │         dec_key_hash = bcrypt.hashpw(raw_dec_key, gensalt()),
  │         host_id = host_id, expires_at = now+5min, used = False)
  ├─ db.session.add(it); db.session.commit()
  └─ Return { install_token, dec_key, expires_at, public_ip }
     [Plaintext values shown in wizard, never stored]

[Step 2 - Agent installer calls] POST /api/agent-provision (PUBLIC, no auth):
  ├─ Validate token format: starts with "install-", len=40
  ├─ candidates = InstallToken.query.filter_by(used=False).all()
  ├─ For each candidate:
  │     if c.is_expired(): continue
  │     if c.check_token(raw_token) AND c.check_dec_key(raw_dec_key): matched = c; break
  │   (bcrypt comparison, intentionally slow)
  ├─ matched.used = True; db.session.commit()  [prevent replay]
  ├─ issue_agent_cert(host.name, host.ip):
  │     → ca.py generates 2048-bit RSA keypair + X.509 cert signed by CA
  │     → Returns (ca_cert_pem, agent_cert_pem, agent_key_pem)
  │     [agent_key_pem never stored by Vigil]
  ├─ host.cert_fingerprint = SHA-256 fingerprint of agent_cert_pem
  │   [tls_enabled stays False until user confirms]
  ├─ blob = encrypt_cert_package(ca_pem, agent_cert_pem, agent_key_pem, raw_dec_key)
  │   → PBKDF2HMAC(SHA-256, 32 bytes, random_salt, 100000 iter) → AES-256-GCM
  │   → Format: salt(16) + nonce(12) + ciphertext + tag(16), base64-encoded
  ├─ del agent_key_pem  [explicit cleanup]
  └─ Return { encrypted_package, fingerprint }

[Step 3 - Fingerprint confirmation] POST /api/hosts/<id>/confirm-tls (authenticated):
  ├─ Compare submitted fingerprint against host.cert_fingerprint
  ├─ host.tls_enabled = True
  └─ db.session.commit()
```

**Trust boundary:** The decryption key travels from the browser to the agent installer (via the user's terminal / clipboard), never over the network to Vigil. The install token travels from the browser to the installer, which sends it to `/api/agent-provision`. The certificate package travels from Vigil to the installer, decrypted locally using the decryption key.

---

### Certificate Issuance

```
ca.py::issue_agent_cert(host_name, host_ip):
  ├─ Load CA key and cert from /data/vigil-ca.key, vigil-ca.crt
  ├─ Generate 2048-bit RSA private key (agent_key)
  ├─ Build X.509 cert:
  │     Subject CN = host_name
  │     SAN: DNS=host_name, IP=host_ip (if valid IP)
  │     Validity: 3650 days (10 years)
  │     Signed by CA key
  ├─ fingerprint = SHA-256 of agent cert
  └─ Return (ca_cert_pem, agent_cert_pem, agent_key_pem)
     [agent_key_pem is NOT stored by Vigil]
```

---

## Report 7 — Notification Flow Map

### Trigger Sources

| Event | Trigger location | Condition |
|-------|-----------------|-----------|
| Version update detected | `scheduler.py::run_version_checks()` | `status` just became `"outdated"` AND `_should_notify()` returns True |
| Digest batch | `scheduler.py::run_version_checks()` | `digest_mode != "immediate"` AND `_should_send_digest()` returns True |
| Scan complete summary | `scheduler.py::run_version_checks()` | `scan_summary_notify == "on"` |
| App updated/reverted | `routes/hosts.py::_notify_action()` | Always (on any update or revert attempt) |
| Telegram test | `routes/settings.py::test_telegram()` | User-initiated |
| Scan summary (manual) | `routes/settings.py::scan_summary()` | User-initiated, `scan_summary_notify == "on"` |

---

### Notification Generation

**Immediate mode (version update):**
```
_render_template(tmpl, r):
  ├─ tmpl = Settings.get("notify_template") or DEFAULT_NOTIFY_TEMPLATE
  ├─ CH_LABELS = {channel → display name}  [defined twice: in _render_template and in digest block]
  └─ tmpl.format(name, image, version, latest, bump_type, channel_label)
     Default: "🐳 *Update: {name}*\nCurrent: `{version}` → Latest: `{latest}`\nBump: `{bump_type}` · Source: {channel}\n`{image}`"
```

**Digest mode:**
```
_build_digest(outdated_apps, template):
  ├─ tmpl = Settings.get("digest_template") or DEFAULT_DIGEST_TEMPLATE
  ├─ list_str = "• *app_name*: `version` → `latest`\n..."
  └─ tmpl.format(count, list, names, date)
     Default: "🐿️ *Vigil — {count} update(s) available*\n\n{list}\n\n_{date}_"
```

**Action notification (`_notify_action`):**
```
lines = ["✅/↩️/❌ *app_name* {verb}"]
lines += ["{from_ver} → {to_ver}"]
lines += ["Host: {host_name}"] if host_name
lines += ["Error: {error}"] if error
msg = "\n".join(lines)
```

---

### Delivery Mechanisms

**Telegram:**
```
send_telegram(token, chat_id, text):
  requests.post(
    f"https://api.telegram.org/bot{token}/sendMessage",
    json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
    timeout=10
  )
  r.raise_for_status()
```

**Webhook:**
```
_send_webhook(url, payload):
  requests.post(url, json=payload, timeout=10)
```
(No `raise_for_status()` call — HTTP errors silently swallowed)

---

### Retry Behavior

Neither `send_telegram()` nor `_send_webhook()` implements retry logic. Each is a single HTTP request. On failure:
- `send_telegram()` raises, caught by caller `try/except`, logged at WARNING level
- `_send_webhook()` does not raise on HTTP error (no `raise_for_status()`) but raises on network error, caught similarly

---

### Failure Behavior

All notification calls in `run_version_checks()` are wrapped:
```python
try: send_telegram(token, chatid, msg)
except Exception as e: log.warning("Telegram: %s", e)

try: _send_webhook(hook, r)
except Exception as e: log.warning("Webhook: %s", e)
```

In `_notify_action()`:
```python
try:
    ... (all notification code) ...
except Exception as exc:
    log.warning("_notify_action failed: %s", exc)
```

Failed notifications are never surfaced to the user. No dead-letter queue, no alerting on notification failure.

---

### Digest Scheduling

`_should_send_digest(mode)` evaluates whether the current time (in the user's configured timezone) satisfies the digest condition:

- `"interval"`: check if `now_utc - last_digest_sent >= digest_interval_hours`
- `"daily"`: check if `now_local.hour >= th` AND `now_local.date() > last_digest_sent.local_date()`
- `"weekly"`: check if `now_local.weekday() in target_days` AND `now_local.hour >= th` AND not already sent today

`ZoneInfo(tz_name)` is used for timezone resolution, with fallback to UTC on invalid/missing timezone. Requires `tzdata` package in Docker container.

---

## Report 8 — Coupling Analysis

### Direct Couplings (explicit imports at module load time)

| Source module | Target module | Dependency type | Reason |
|---------------|--------------|-----------------|--------|
| `app.py` | `models.py` | Direct | `db.init_app(flask_app)`; `db.create_all()` |
| `app.py` | `migrations.py` | Direct | `run_migrations(db.engine)` at startup |
| `app.py` | `categories.py` | Direct | `ensure_default_categories()`, `recategorize_all()` at startup |
| `app.py` | `scheduler.py` | Direct | `start_scheduler(flask_app)` at startup |
| `app.py` | `ca.py` | Direct (in try/except) | `ensure_ca()`, `ensure_vigil_client_cert()` at startup |
| `routes/apps.py` | `models.py` | Direct | ORM model imports (`Category`, `Settings`, `TrackedApp`, `db`) |
| `routes/apps.py` | `categories.py` | Direct | `auto_categorize`, `recategorize_all` |
| `routes/apps.py` | `config.py` | Direct | `LEN`, `MAX_ICON_BYTES` |
| `routes/apps.py` | `utils.py` | Direct | `clamp`, `now_str`, `require_auth`, `require_str` |
| `routes/auth.py` | `models.py` | Direct | `Settings`, `User`, `db` |
| `routes/auth.py` | `config.py` | Direct | `LEN`, `TOTP_PENDING_TTL` |
| `routes/auth.py` | `utils.py` | Direct | `rate_limited`, `require_auth` |
| `routes/hosts.py` | `models.py` | Direct | `Host`, `TrackedApp`, `UpdateLog`, `db` |
| `routes/hosts.py` | `utils.py` | Direct | `clamp`, `now_str`, `require_auth` |
| `routes/settings.py` | `models.py` | Direct | `Settings`, `TrackedApp`, `db` |
| `routes/settings.py` | `scheduler.py` | Direct | `get_scheduler_status`, `reschedule_interval` |
| `routes/settings.py` | `config.py` | Direct | `MAX_ICON_BYTES` |
| `routes/settings.py` | `utils.py` | Direct | `clamp`, `now_str`, `require_auth` |
| `categories.py` | `models.py` | Direct | `Category`, `Settings`, `TrackedApp`, `db` |
| `utils.py` | `config.py` | Direct | `LEN`, `rate_limit` |
| `migrations.py` | `models.py` | Direct (implicit via `db.engine`) | Schema inspection |

---

### Lazy Couplings (imports inside function bodies)

| Source module | Target module | Location | Reason |
|---------------|--------------|----------|--------|
| `routes/apps.py` | `scheduler.py` | `check_one_app()`, `trigger_check()` | Lazy to avoid circular import; accesses private `_check_one` and `run_version_checks` |
| `routes/hosts.py` | `scheduler.py` | `_notify_action()` | Lazy; `send_telegram`, `_send_webhook` (accesses private `_send_webhook`) |
| `routes/hosts.py` | `ca.py` | Multiple host functions | Lazy; `ca_fingerprint`, `is_public_ip`, `issue_agent_cert`, `encrypt_cert_package`, `vigil_client_cert_paths` |
| `routes/hosts.py` | `models.py` | `_encrypt_token()`, `_decrypt_token()`, `_get_token()` | Lazy secondary imports |
| `routes/settings.py` | `scheduler.py` | `test_telegram()`, `scan_summary()` | Lazy; `send_telegram` |
| `routes/auth.py` | `utils.py` | `auth_me()` | Lazy; `current_user` |
| `scheduler.py` | `models.py` | All check functions | Lazy inside app context; `TrackedApp`, `Settings`, `db` |
| `categories.py` | `_default_logo.py` | `ensure_default_categories()` | Lazy; `DEFAULT_LOGO_B64` |

---

### Shared-State Couplings

| State | Modules sharing | Nature |
|-------|----------------|--------|
| SQLite `tracker.db` | All route modules, `scheduler.py`, `categories.py`, `migrations.py` | Shared write target; no explicit coordination between scheduler threads and Flask request handlers |
| `_last_run_at`, `_last_run_ok`, `_last_run_finished_at` | `scheduler.py` (writer), `routes/settings.py` via `get_scheduler_status()` (reader) | Module-level globals; no mutex; written by scheduler daemon thread, read by Flask request threads |
| `_rate_buckets` dict | `config.py` (owner), `utils.py::rate_limited()` (via `rate_limit()`) | Module-level mutable state; shared across all Flask request handler threads |
| Flask session cookie | `routes/auth.py` (writer), `utils.py::current_user()` (reader), all authenticated routes | Client-side state; shared via the session object in each request |
| `categoriesRef.current` | `App.jsx` (owner) — written in multiple `useCallback`s and `useEffect`s, read in `autoCategory()` | React ref shared across closures within `App()` |

---

### Coupling: `routes/apps.py` → `scheduler.py` (private symbol)

`routes/apps.py` line 439 imports `scheduler._check_one` (a module-private function by naming convention). This is the sole path for triggering a single-app check from the API layer. The `routes/apps.py` also imports `run_version_checks` which is a public function but called in a `threading.Thread`.

---

### Coupling: `routes/hosts.py` → `scheduler.py` (private symbol)

`routes/hosts.py::_notify_action()` imports `scheduler._send_webhook` as `send_webhook` (aliased away from its private name). This is the sole external caller of `_send_webhook`.

---

### Coupling: Frontend → Backend (implicit contract)

The frontend's `api()` function (`App.jsx` line 1492) sends all requests to `/api${path}` with `credentials: "include"`. The shape of every JSON response is an implicit contract between the Flask serializers (`to_dict()` methods) and the frontend's direct field access patterns. No OpenAPI or schema definition exists.

Key implicit contracts:
- `GET /api/apps` returns an array where each object has `id`, `name`, `image`, `version`, `latest_version`, `status`, `category`, `icon_data`, `detection_channel`, etc.
- `GET /api/health` returns `{ scheduler: { running, last_run_at, last_run_ok, last_run_finished_at, next_run_at } }`
- `GET /api/auth/me` returns `{ user: { id, username, must_change_pw, totp_enabled } }`

---

### Coupling: Scheduler → Flask application (via context)

`run_version_checks(flask_app)` and `_check_one(app_id, flask_app)` receive the Flask app object as a parameter. Each worker thread calls `with flask_app.app_context():` to access the database. This makes the scheduler tightly coupled to the Flask application lifecycle — it cannot run without the Flask app object.

---

## Report 9 — Frontend State Flow

### Global State Location

All application state is declared in the `export default function App()` component body (lines 1364–4515 of `App.jsx`). There is no external state management library (no Redux, Zustand, Context API for global state). State is held in 87 `useState` declarations within a single function component.

---

### State Categories and Ownership

**Authentication state** — owned by `App()`:
- `authState` — string: `"loading"` | `"login"` | `"change_pw"` | `"app"`
- `currentUser` — user object or null

**Application data state** — owned by `App()`, populated from API:
- `apps` — array of app objects (full DB serialization)
- `categories` — array of category objects
- `hosts` — array of host objects
- `categoriesRef` — `useRef([])` — always-current categories ref, bypasses stale closure issue in `autoCategory()`

**UI preference state** — owned by `App()`, some initialized from `localStorage`:
- `darkMode` — bool (persisted: `localStorage["dt-dark"]`)
- `viewMode` — `"grid"` | `"list"` | `"compact"` (persisted: `localStorage["dt-view"]`)
- `sortMode` — `"custom"` | `"az"` | `"za"` (persisted: `localStorage["dt-sort"]`)
- `cardOrder` — array of app IDs (persisted: `localStorage["dt-card-order"]`)

**Filter/search state** — owned by `App()`:
- `filterCat`, `filterStatus`, `search`

**Modal/overlay state** — owned by `App()`:
- `modal` — string identifier of which modal is open
- `activeApp`, `catPopover`, `catPopoverAnchor`, `hostModal`, `activeHost`, `logModal`, `revertModal`

**Form state** — owned by `App()`:
- `imageInput`, `parsed`, `newVersion`, `overData`, `pendingIcon`, `composeText`
- `cpForm`, `cuForm` (change password/username forms)
- `hostForm`, `quickImageVal`, `quickPathVal`

**Settings state** — owned by `App()`:
- `settings` — aggregated settings object (12+ fields)
- `appName`, `appLogo`, `appAccent` (mirrored from settings for rendering)
- `telegramSet`, `showChatId`, `tgTesting`, `tgTestMsg`

**Agent/TLS wizard state** — owned by `App()`:
- `installToken`, `decKey`, `newToken`, `tokenExpiry`, `isPublicIp`
- `hostTesting`, `hostTestMsg`, `caReady`
- `copiedCurl`, `copiedToken`, `copiedInstall`, `copiedDecKey`
- `timerTick` (1-second interval for countdown display)
- `userFingerprint`, `fpCompared`, `fpMatch`
- `hostWizardStep`

**TOTP state** — owned by `App()`:
- `totpSetup`, `backupCodes`, `regenPw`, `totpConfirmCode`, `totpDisablePw`, `totpError`, `totpLoading`

**Notification/scheduler state** — owned by `App()`:
- `schedulerStatus`, `notif`, `checkingAll`, `updatingApp`

**Dropdown/menu state** — owned by `App()`:
- `open`, `catOpen`, `bellOpen`, `menuPos`, `bellPos`

**History/log state** — owned by `App()`:
- `history`, `updateLogs`

**Local component state** — owned by sub-components defined before `App()`:
- `AccentColorPicker`: `open`, `hue`, `sat`, `val`, `hexIn`
- `LoginScreen`: `username`, `password`, `totpMode`, `backupMode`, `code`, `error`, `loading`
- `ChangePasswordScreen`: `current`, `next`, `confirm`, `error`, `loading`
- `CategoryPopover`: (props-only, no internal useState)
- `TzSelect`: `query`, `open`
- `Tooltip`: `visible`, `pos`
- `AppIcon`: `failed`, `hovered`

**Nested component state** — owned by `CardMenu` (inside `App()`):
- `open`, `catOpen` (5 hooks total — pattern that caused the production black-screen bug)

---

### API Interaction Paths

All API calls from `App()` flow through the single `api` callback:

```javascript
const api = useCallback(async (path, opts={}) => {
  const r = await fetch(`/api${path}`, {
    headers: {"Content-Type": "application/json"},
    credentials: "include",
    ...opts,
  });
  if (r.status === 401) { setAuthState("login"); throw new Error("Unauthorised"); }
  if (!r.ok) throw new Error(await r.text());
  return r.status === 204 ? null : r.json();
}, []);
```

Errors propagate as thrown exceptions; callers use `try/catch` and call `toast(e.message || "Error", "error")`.

**Bootstrap sequence** (on `authState === "app"`):
1. `api("/categories")` → `setCategories` + `categoriesRef.current`
2. `loadApps()` → `api("/apps")` → `setApps`
3. `recategorizeExisting()` → `api("/apps/recategorize", POST)`
4. `loadHealth()`, `loadSettings()`, `loadHosts()` (parallel)

---

### State Synchronization Behavior

**Polling:**
- `setInterval(loadHealth, 30000)` — every 30 seconds, updates `schedulerStatus`
- `setInterval(loadApps, 60000)` — every 60 seconds, full app list refresh
- `window.addEventListener("focus", loadApps)` — on tab focus

**Optimistic local updates:** After mutating operations (add, edit, delete, snooze, ignore, icon upload), the frontend applies a local state update via `setApps(p => p.map(...))` rather than re-fetching all apps. This creates a soft consistency model where the UI reflects the expected new state immediately.

**Polling for long operations:** `checkAll()` polls `GET /api/health` every 3 seconds after triggering `POST /api/check`, comparing `last_run_finished_at` to the trigger timestamp. Timeout after 90 seconds.

**`Step3Poll` component:** Polls `GET /api/hosts/<id>` every 2 seconds until `cert_fingerprint` is set (indicating agent has provisioned successfully). No timeout defined.

**Derived state (computed inline, not stored in useState):**
- `catMap` — `Object.fromEntries(categories.map(c => [c.key, c]))` — recomputed on each render
- `filtered` — `getSortedApps().filter(...)` — recomputed on each render
- `getSortedApps()` — function, recomputed on each call (not memoized)
- Color values — `C` object computed from `appAccent` — recomputed on each render

**`categoriesRef`:** A `useRef` mirror of `categories` state. Used inside `autoCategory()` to avoid stale closure captures. Updated synchronously alongside `setCategories()` in all load paths.

---

## Report 10 — Architecture Findings

### Single Sources of Truth

| Data element | Single source |
|--------------|--------------|
| CA private key | `/data/vigil-ca.key` (file) |
| Vigil client certificate | `/data/vigil-client.crt` (file) |
| Flask SECRET_KEY | `/data/.secret_key` (file) |
| User password hash | `users.password_hash` |
| GITHUB_TOKEN / GITLAB_TOKEN / GITEA_TOKEN | Environment variable (read-only at runtime) |
| App version history | `tracked_apps.version_history` JSON (capped 20 entries) |
| Category keywords | DB `categories.keywords` (user-editable) + `categories.py::BUILTIN_KEYWORDS` dict (hardcoded fallback) |
| `_last_run_at`, `_last_run_ok`, `_last_run_finished_at` | Module-level globals in `scheduler.py` |

---

### Multiple Sources of Truth

**1. `check_interval_hours`**

Two authoritative values exist simultaneously after any container restart following a UI change:
- `settings` table key `check_interval_hours` (UI-configured value)
- `CHECK_INTERVAL_HOURS` environment variable (startup value)

The scheduler reads from the env var at startup (`scheduler.py` line 852) and from the DB when the setting is changed via `reschedule_interval`. After a container restart, the env var wins and the DB value is never read by the scheduler.

Evidence: `scheduler.py:852`, `routes/settings.py:51–52,102`

---

**2. Agent runtime token**

The same agent token is stored in two locations:
- `hosts.token_hash` — bcrypt hash, written at host creation and regeneration
- `settings.host_{id}_token` — AES-256-GCM encrypted value, written at host creation and regeneration

Only the `settings` path is ever read for authentication. `host.check_token()` is defined but never called.

Evidence: `routes/hosts.py:271,275,356`, `models.py:163–166`

---

**3. Telegram credentials**

`TELEGRAM_TOKEN` and `TELEGRAM_CHAT_ID` are passed as environment variables to the backend container. They are never read from the environment at runtime; the scheduler always reads from `Settings.get("telegram_token")`. There is no mechanism to seed the DB from the env vars. If the DB has never been saved via the UI, the scheduler reads an empty string regardless of the env var values.

Evidence: `docker-compose.yml`, `scheduler.py:780–781`

---

**4. Frontend `categories` state and `categoriesRef`**

The frontend maintains two representations of the same category data: the `categories` state variable and `categoriesRef.current`. These are updated together in all load paths but represent the same data in two forms (reactive state vs. always-current ref).

Evidence: `App.jsx:1372`, `App.jsx:1510,1535,1594`

---

### Hidden Dependencies

**1. `routes/apps.py` accesses scheduler private function `_check_one`**

`routes/apps.py` line 439 imports `scheduler._check_one` — a function named with a leading underscore indicating it is module-private by convention. No explicit public API exists for triggering a single-app check. This creates a hidden dependency on the internal structure of `scheduler.py`.

**2. `routes/hosts.py` accesses scheduler private function `_send_webhook`**

`routes/hosts.py::_notify_action()` imports `scheduler._send_webhook` (aliased as `send_webhook`). This is the only external call site for `_send_webhook`.

**3. `scheduler.py` reads `Settings` table directly**

`scheduler.py` imports and queries `models.Settings` directly at runtime inside every check run, rather than receiving configuration through a clean interface. Changes to the Settings table by the Flask layer immediately affect the scheduler's next execution without any coordination mechanism.

**4. Frontend icon CDN is a runtime dependency not reflected anywhere in the codebase build pipeline**

`cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png` is a hardcoded constant in `App.jsx`. The frontend will silently fail to display icons if this CDN is unavailable. This dependency is not captured in `package.json`, not reflected in any lock file, and not declared in documentation.

**5. `reportlab` QR code generation has a silent fallback**

If `reportlab` fails (ImportError or any exception), `_qr_svg()` returns `None` and `auth_totp_setup()` returns `{"secret": ..., "svg": null}`. The frontend must handle `svg === null` gracefully to avoid a crash. The dependency between the backend's fallback behavior and the frontend's null handling is undocumented.

**6. `ca.py` functions are lazily imported throughout `routes/hosts.py`**

All calls to `ca.py` are lazy imports inside function bodies. If `ensure_ca()` fails at startup (caught by `try/except` in `app.py`), subsequent calls to `ca_fingerprint()`, `issue_agent_cert()`, etc., will also fail, but at request time rather than startup. The error message ("is the CA initialised?") in `agent_provision()` is the only hint.

**7. Gunicorn 1-worker constraint is tied to APScheduler**

The `entrypoint.sh` uses `--workers 1` with a comment explaining this is required to prevent the APScheduler from running in multiple processes. This is an undocumented implicit constraint: scaling workers beyond 1 would cause multiple scheduler instances to run simultaneously. No enforcement mechanism prevents a user from changing this setting in their deployment.

Evidence: `backend/entrypoint.sh:13` comment

---

### Implicit Contracts

**1. `to_dict()` shape is the API contract**

The shape of `TrackedApp.to_dict()`, `Host.to_dict()`, `Category.to_dict()`, and `User.to_dict()` defines the API contract between the backend and the frontend. No schema validation, no OpenAPI spec, no versioning. Any change to these methods immediately affects the frontend without any warning.

**2. `session["user_id"]` key name is shared across modules**

`routes/auth.py` writes `session["user_id"]`. `utils.py::current_user()` reads `session.get("user_id")`. The string literal `"user_id"` is the implicit contract. No constant is defined for this key.

**3. `Settings.get()` key names are implicit contracts across all modules**

All modules that read settings use string literals like `"telegram_token"`, `"telegram_chat_id"`, `"digest_mode"`, etc. These are not defined as constants anywhere. A typo in any reader or writer produces a silent `None` return from `Settings.get()` with a fallback default.

**4. `_last_run_finished_at` global is the polling contract with the frontend**

The frontend's `checkAll()` function polls `GET /api/health` and checks `h.scheduler?.last_run_finished_at`. The behavior of this field (set at the end of `run_version_checks()`) is an implicit contract: if the field is never set (e.g., the run crashes before reaching line 821), the frontend will poll until the 90-second timeout.

**5. `"vigil-" + secrets.token_hex(32)` token format is validated in `agent_provision()`**

`agent_provision()` validates: `raw_token.startswith("install-") or len(raw_token) != 40`. This format expectation (`"install-" + secrets.token_hex(16)` = 8 + 32 = 40 characters) is implicit — the format is defined in `generate_install_token()` and validated in `agent_provision()` but not in a shared constant or schema.

**6. Agent HTTP API endpoints `/read`, `/write`, `/revert` must match backend expectations**

`routes/hosts.py::_agent_request()` calls `POST /read`, `POST /write`, `POST /revert` on the agent. `vigil-agent.py::AgentHandler.do_POST()` handles these paths. The match is entirely by convention — string literals in both files. No versioning, no discovery mechanism.

---

### Architectural Inconsistencies

**1. `auto_update` field is modeled, stored, exposed in UI, but never read by the scheduler**

`TrackedApp.auto_update` stores `"off"` | `"ask"` | `"auto"` | `"silent"`. The frontend renders a dropdown for this field. `scheduler.py` never reads it. No automated update behavior is triggered regardless of this setting's value.

Evidence: `models.py:108`, `scheduler.py` — zero references to `auto_update`

**2. `host.token_hash` is written but `host.check_token()` is never called**

The `hosts` table stores a bcrypt hash of each agent token as `token_hash`. The model defines `check_token()` to verify it. Neither `check_token()` nor `token_hash` is read for authentication — the actual authentication uses the encrypted value in the `settings` table. The bcrypt field is a vestigial remnant of a prior design.

Evidence: `models.py:163–166`, `routes/hosts.py` — no call to `host.check_token()`

**3. `_check_token()` in `routes/hosts.py` is defined but never called**

```python
def _check_token(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False
```

This function is defined at module level but has no call sites within `routes/hosts.py` or anywhere else.

**4. `CH_LABELS` is defined in two places in `scheduler.py`**

`CH_LABELS` mapping channel keys to display names is defined identically inside `_render_template()` (around line 34) and again inline inside the notification dispatch block of `run_version_checks()` (around line 785). A change to one copy does not affect the other.

Evidence: `scheduler.py:34–36`, `scheduler.py:785–787`

**5. `update_log.triggered_by` column supports `"user"`, `"schedule"`, `"telegram"` but only `"user"` is ever written**

The schema comment on `triggered_by` shows three intended values. All calls to `_log_update()` pass either `data.get("triggered_by", "user")` (defaulting to `"user"`) or the literal `"user"`. No code path writes `"schedule"` or `"telegram"`.

Evidence: `models.py:237`, `routes/hosts.py::_log_update()` callers

**6. `package.json` version is `"2.2.0"` while the application is at v2.3**

`frontend/package.json` declares `"version": "2.2.0"`. The current release is v2.3. This version is not displayed anywhere in the UI and is not used in any API response, but creates an inconsistency between repository metadata and the actual deployed version.

Evidence: `frontend/package.json:4`

**7. `GITEA_TOKEN` is used by the scheduler but absent from `.env.example`**

`scheduler.py` reads `os.getenv("GITEA_TOKEN", "")` for authenticating Gitea/Forgejo/Codeberg API requests. This variable does not appear in the documented environment variable list (`.env.example`). Users relying on Gitea-hosted images will silently receive unauthenticated rate-limited responses.

Evidence: `scheduler.py:354`, `.env.example` (absent)

**8. `SESSION_LIFETIME_HOURS` is documented as "idle timeout" but is an absolute expiry**

The `.env.example` comment describes `SESSION_LIFETIME_HOURS` as "idle session timeout in hours." Flask's `PERMANENT_SESSION_LIFETIME` is an absolute expiry from the session creation time — it does not reset on activity. An active user session created at T+0 expires at T+12h regardless of continued use.

Evidence: `app.py:60–61`, Flask documentation on `PERMANENT_SESSION_LIFETIME`

**9. `scan_summary_notify` functionality is implemented twice**

The scan summary logic exists in both `scheduler.py::run_version_checks()` (lines 823–843) and `routes/settings.py::scan_summary()`. Both read from `Settings.get("scan_summary_notify")` and send the same style of Telegram message. The `scan_summary()` route is documented as "called by scheduler after a full check run" but the scheduler never calls this route — it executes the scan summary logic inline.

Evidence: `scheduler.py:823–843`, `routes/settings.py:136–165`
