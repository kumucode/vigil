# Vigil — Architectural Inventory
**Version:** v2.3  
**Date:** 2026-04-18  
**Codebase size:** ~9,900 lines across 19 source files

---

## Report 1 — Repository Structure

### Directory Tree

```
vigil/
├── .env.example                # Environment variable documentation and defaults
├── .gitignore
├── CHANGELOG.md                # Version history
├── README.md
├── SECURITY.md                 # Security model documentation
├── docker-compose.yml          # Production deployment manifest
├── install.sh                  # Root-level installer (Vigil itself, not agent)
│
├── agent/                      # Remote agent — runs on managed hosts
│   ├── vigil-agent.py          # Standalone Python HTTP server (394 lines)
│   ├── install.sh              # Agent installation script (732 lines)
│   └── uninstall.sh            # Agent removal script (93 lines)
│
├── backend/                    # Flask API + scheduler
│   ├── Dockerfile              # Python 3.12-slim, project-root build context
│   ├── entrypoint.sh           # chown /data, gosu drop-to-appuser, gunicorn start
│   ├── requirements.txt        # 13 pinned Python dependencies
│   ├── app.py                  # Application factory (114 lines)
│   ├── ca.py                   # Private CA and mutual TLS cert management (328 lines)
│   ├── categories.py           # Default category seeding and auto-categorization (140 lines)
│   ├── config.py               # Constants, LEN caps, in-process rate limiter (53 lines)
│   ├── migrations.py           # 18 sequential SQLite migrations (392 lines)
│   ├── models.py               # SQLAlchemy ORM models (273 lines)
│   ├── scheduler.py            # Version-check logic and notification dispatch (877 lines)
│   ├── utils.py                # Shared helpers: auth, validation, normalization (143 lines)
│   ├── _default_logo.py        # Hardcoded base64 default logo (2 lines)
│   └── routes/
│       ├── __init__.py         # Empty — marks package
│       ├── apps.py             # App CRUD, category CRUD, import/export (463 lines)
│       ├── auth.py             # Login, TOTP, backup codes (389 lines)
│       ├── hosts.py            # Host CRUD, agent comms, TLS provisioning (769 lines)
│       └── settings.py         # Settings KV, Telegram test, agent file serving (220 lines)
│
├── frontend/                   # React SPA
│   ├── Dockerfile              # Node build → nginx:alpine serve
│   ├── index.html              # Entry point
│   ├── nginx-spa.conf          # nginx config inside frontend container (SPA fallback)
│   ├── package.json            # 4 dependencies total (React + Vite)
│   ├── vite.config.js          # Vite config with dev proxy
│   └── src/
│       ├── main.jsx            # React root mount (9 lines)
│       └── App.jsx             # Entire frontend — single file (4,515 lines)
│
├── nginx/
│   └── default.conf            # Reverse proxy config with per-route timeouts
│
└── docs/
    └── screenshots/            # 6 UI screenshots (PNG) — documentation only
```

### Purpose Summary

| Area | Purpose |
|------|---------|
| `backend/` | All server-side logic: API, auth, scheduling, notifications, agent communication |
| `backend/routes/` | Flask blueprints split by domain (auth / apps / hosts / settings) |
| `agent/` | Lightweight standalone Python agent served on remote hosts; no shared code with backend |
| `frontend/src/App.jsx` | Entire UI — all views, state, CSS-in-JS, and components in one file |
| `nginx/` | Production reverse proxy; critical for timeouts and routing |
| `docs/` | Static documentation assets only |

### Areas Appearing Unused

- `install.sh` at project root — installs Vigil itself via Docker; referenced in README but not in any other code path. Distinct from `agent/install.sh`.
- `frontend/nginx-spa.conf` — nginx config inside the frontend container for SPA fallback routing. Correct and necessary but not obviously connected to `nginx/default.conf`.
- `docs/screenshots/` — static images; no code references them.

### Areas Appearing Duplicated

- **Utility functions in `apps.py` vs `utils.py`**: Five functions are defined privately in `apps.py` (`_parse_image_name`, `_parse_compose_images`, `_norm`, `_sort_key`, `_derive_status`) with identical counterparts in `utils.py` (`parse_image_name`, `parse_compose_images`, `norm`, `sort_key`, `derive_status`). The `apps.py` versions are private (underscore-prefixed) and do not import from `utils.py`.
- **`CH_LABELS` dict in `scheduler.py`**: Defined twice — once inside `_render_template()` (line 35) and once inside the digest block of `run_version_checks()` (line 785). Both are identical.
- **TOTP implementation**: Implemented from scratch in `auth.py` using stdlib (`hmac`, `struct`, `base64`) rather than using a TOTP library. Not a duplication issue but a maintenance concern.

---

## Report 2 — Module Inventory

### `app.py` — Application Factory
**Responsibility:** Creates the Flask app, configures database, CORS, sessions, initialises the CA, starts the scheduler, and registers blueprints.  
**Public interface:** `create_app() → Flask`; module-level `app` object consumed by gunicorn.  
**Internal deps:** `migrations`, `models`, `categories`, `scheduler`, `ca`, all route blueprints.  
**External deps:** `flask`, `flask_cors`.  
**Notes:** `SECRET_KEY` is generated once and persisted to `/data/.secret_key`. Loss of this file invalidates all encrypted agent tokens. `ALLOWED_ORIGIN=*` by default.

---

### `ca.py` — Private CA and Mutual TLS
**Responsibility:** Generates and manages Vigil's Private CA; issues per-agent certificates; encrypts/decrypts certificate packages; detects public IPs.  
**Public interfaces:**
- `ensure_ca()` — generate CA on first start
- `ensure_vigil_client_cert()` — generate Vigil's own client cert
- `issue_agent_cert(host_name, host_ip) → (ca_pem, agent_cert_pem, agent_key_pem)`
- `encrypt_cert_package(ca_pem, agent_cert, agent_key, dec_key) → base64_blob`
- `decrypt_cert_package(blob, dec_key) → dict`
- `ca_fingerprint() → str`
- `vigil_client_cert_paths() → (cert_path, key_path)`
- `is_public_ip(ip) → bool`

**Internal deps:** None.  
**External deps:** `cryptography`.  
**Notes:** CA key is 4096-bit RSA; agent and client certs are 2048-bit RSA. Lifetime is hardcoded at 3650 days (10 years). Private key stored at `/data/vigil-ca.key` with mode 600. No certificate revocation or renewal mechanism exists.

---

### `models.py` — Database Models
**Responsibility:** Defines all SQLAlchemy ORM models and the `db` SQLAlchemy instance.  
**Public interfaces:** `db`, `User`, `Category`, `TrackedApp`, `Host`, `InstallToken`, `UpdateLog`, `Settings`, `SchemaVersion`.  
**Internal deps:** None.  
**External deps:** `flask_sqlalchemy`.  
**Notes:** `bcrypt` is imported lazily inside methods. Some timestamp fields use `String(40)` with ISO strings; `created_at` on `User` and `Host` uses `db.Column(db.DateTime)`. Inconsistent timestamp storage (see Report 4).

---

### `migrations.py` — Schema Migrations
**Responsibility:** Sequential SQLite ALTER TABLE migrations with idempotency checks. Tracks version in `schema_version` table.  
**Public interfaces:** `run_migrations(engine)`.  
**Internal deps:** `models`.  
**External deps:** `sqlalchemy`.  
**Notes:** 18 migrations. Each migration checks column/table existence before altering, making re-runs safe. No rollback mechanism. `LATEST_VERSION = max(MIGRATIONS.keys())` is computed dynamically.

---

### `categories.py` — Category Management
**Responsibility:** Seeds default categories on first run; performs auto-categorization of tracked apps based on keyword matching; manages the default logo.  
**Public interfaces:** `ensure_default_categories()`, `recategorize_all()`.  
**Internal deps:** `models`, `_default_logo`.  
**External deps:** `PIL` (Pillow) for logo background removal.  
**Notes:** `_BUILTIN_KEYWORDS` is a dict of category key → keyword list. Auto-categorization strips the image to its leaf name (e.g. `linuxserver/bookstack` → `bookstack`). `bookstack` appears in both `productivity` and `storage` keyword lists — whichever is matched first wins.

---

### `config.py` — Constants and Rate Limiter
**Responsibility:** Defines input length caps (`LEN` dict), application constants, and an in-process rate limiter.  
**Public interfaces:** `LEN`, `MAX_ICON_BYTES`, `TOTP_PENDING_TTL`, `rate_limit(key, max_hits, window_seconds) → bool`.  
**Internal deps:** None.  
**External deps:** None (stdlib only).  
**Notes:** Rate limiter is per-process, in-memory. Counters reset on container restart. Not suitable for multi-replica deployments (not currently a concern for single-instance homelab use).

---

### `utils.py` — Shared Helpers
**Responsibility:** Auth helpers (`require_auth`, `current_user`), rate-limit decorator, input validation (`clamp`, `require_str`), string normalization, version comparison utilities, compose YAML parsing.  
**Public interfaces:** All functions are module-level and used by route modules.  
**Internal deps:** `config`, `models`.  
**External deps:** `flask`, `pyyaml` (lazy in `parse_compose_images`).  
**Notes:** Contains five functions (`parse_image_name`, `parse_compose_images`, `norm`, `sort_key`, `derive_status`) that are duplicated with private variants in `apps.py`.

---

### `routes/auth.py` — Authentication
**Responsibility:** Session-based login flow, TOTP setup/verification, backup code generation/verification, password and username management.  
**Public interfaces:** 11 endpoints (see Report 3).  
**Internal deps:** `config`, `models`, `utils`.  
**External deps:** `flask`, `bcrypt`, `reportlab` (QR SVG generation).  
**Notes:** TOTP is implemented from scratch using stdlib — no external TOTP library. Backup codes use bcrypt (cost 10) with a legacy SHA-256 fallback path for older installs. TOTP pending state is stored in the Flask session with a 5-minute TTL.

---

### `routes/apps.py` — Application Management
**Responsibility:** CRUD for tracked apps and categories; compose file import; data export; version check trigger; snooze/ignore/history.  
**Public interfaces:** 18+ endpoints (see Report 3).  
**Internal deps:** `models`, `utils`, `categories`, `scheduler`.  
**External deps:** `flask`, `pyyaml` (lazy).  
**Notes:** Contains private duplicate utility functions (see Report 1). `_parse_compose_images` reads YAML but catches `Exception` broadly. URL validation rejects non-http(s) schemes.

---

### `routes/hosts.py` — Host and Agent Management
**Responsibility:** Host CRUD; encrypted token storage/retrieval; mutual TLS context building; agent communication (`/read`, `/write`, `/revert`); TLS provisioning (install token generation, certificate delivery, fingerprint confirmation); update logging.  
**Public interfaces:** 17+ endpoints (see Report 3).  
**Internal deps:** `models`, `ca`, `utils`.  
**External deps:** `flask`, `bcrypt`, `cryptography`, `urllib` (stdlib), `ssl` (stdlib).  
**Notes:** Agent tokens are AES-256-GCM encrypted at rest, key derived from `SECRET_KEY` via SHA-256. Legacy `plain:` prefix supported for tokens stored before encryption was added. `AGENT_TIMEOUT_READ = 30s`, `AGENT_TIMEOUT_WRITE = 180s`. `auto_update` field exists on `TrackedApp` but the scheduler does **not** act on it — scheduled auto-updates are unimplemented.

---

### `routes/settings.py` — Settings and File Serving
**Responsibility:** Read/write application settings (KV store); Telegram test; scan summary; serving agent scripts (`install.sh`, `uninstall.sh`, `vigil-agent.py`).  
**Public interfaces:** 7 endpoints + 3 file-serving routes.  
**Internal deps:** `models`, `scheduler`.  
**External deps:** `flask`.  
**Notes:** Settings are a flat KV table (`settings`). All values are strings. Telegram token and chat ID are stored in the database — they are also readable from environment variables during scheduler startup. Dual source creates a potential inconsistency (env var takes precedence in scheduler but DB value is shown in UI).

---

### `scheduler.py` — Version Checking and Notifications
**Responsibility:** Registry polling for latest versions across 6 registries; version comparison; notification dispatch (Telegram + webhook); digest scheduling; APScheduler lifecycle.  
**Public interfaces:** `start_scheduler(flask_app)`, `run_version_checks(flask_app, app_ids=None)`, `resolve_latest_version(image, version_hint)`, `send_telegram(token, chat_id, text)`, `get_scheduler_status()`, `reschedule_interval(hours)`.  
**Internal deps:** `models`, `config`, `utils` (indirectly via Settings).  
**External deps:** `apscheduler`, `requests`, `flask`.  
**Notes:** Largest single file (877 lines). `CH_LABELS` dict is defined twice. Registry token env vars (`GITHUB_TOKEN`, `GITLAB_TOKEN`, `GITEA_TOKEN`) are read at call time (`os.getenv`) rather than at startup — changes require no restart but are not surfaced in the UI. `GITEA_TOKEN` is not exposed in `.env.example`. `auto_update` logic is not triggered here.

---

### `vigil-agent.py` — Remote Agent
**Responsibility:** Standalone single-file Python HTTP(S) server running on managed hosts. Exposes `/health`, `/read`, `/write`, `/revert` endpoints. Validates tokens, enforces path scoping, manages backups, triggers `docker compose up`.  
**Public interfaces:** HTTP endpoints; no Python imports from the main codebase.  
**Internal deps:** None (completely standalone).  
**External deps:** `pyyaml` (installed by `install.sh`), `cryptography` (installed by `install.sh`), stdlib (`http.server`, `ssl`, `subprocess`, `pathlib`).  
**Notes:** TLS is enabled when cert files exist at `/etc/vigil-agent/`. Falls back to plain HTTP with a log warning. Token is stored in `/etc/vigil-agent/config.yml` (YAML, mode 600). `_safe_path()` uses `Path.resolve().relative_to(ALLOWED_BASE)` — correct path traversal prevention. Agent backup dir (`.vigil-backups`) requires `vigil-agent` ownership — installer pre-creates it but new app directories need manual `vigil-setup`.

---

### `frontend/src/App.jsx` — Frontend SPA
**Responsibility:** Entire frontend — all UI views, all state management, all CSS, all components. Single 4,515-line file.  
**Public interfaces:** React default export `App`. Two top-level helper components: `Step2Body`, `Step3Poll`.  
**Internal deps:** None — all in one file.  
**External deps:** `react` 18.3.1, `react-dom` 18.3.1.  
**Notes:** 163 `useState`/`useEffect`/`useCallback`/`useRef` calls. All CSS is embedded as a template literal injected via `<style>`. Icons fetched from two external CDNs (`cdn.jsdelivr.net/gh/walkxcode/dashboard-icons`, `cdn.jsdelivr.net/gh/selfhst/icons`). `localStorage` used for view mode and sort preferences. `package.json` still lists version `2.2.0` (not updated to 2.3).

---

## Report 3 — API Surface

### Authentication (`routes/auth.py`)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/auth/login` | None | Rate-limited 10/60s. Returns `totp_required: true` if TOTP is on |
| `POST` | `/api/auth/totp/login` | Pending session | Rate-limited 10/60s. Validates 6-digit TOTP code |
| `POST` | `/api/auth/totp/backup` | Pending session | Rate-limited 10/60s. One-time backup code login |
| `POST` | `/api/auth/logout` | None required | Clears session |
| `GET`  | `/api/auth/me` | Session | Returns current user dict |
| `POST` | `/api/auth/change-password` | Session | Rate-limited 10/60s |
| `POST` | `/api/auth/change-username` | Session | Rate-limited 10/60s |
| `POST` | `/api/auth/totp/setup` | Session | Generates secret + QR SVG; stored in session until confirmed |
| `POST` | `/api/auth/totp/confirm` | Session | Rate-limited 10/60s. Confirms code, enables TOTP, returns backup codes |
| `DELETE`| `/api/auth/totp` | Session | Rate-limited 5/60s. Requires password |
| `POST` | `/api/auth/totp/regenerate` | Session | Rate-limited 5/60s. Requires password |

---

### Applications (`routes/apps.py`)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET`  | `/api/categories` | None | Public — used pre-login for branding bootstrap |
| `POST` | `/api/categories` | Session | Create category |
| `PATCH`| `/api/categories/<id>` | Session | Update category |
| `DELETE`| `/api/categories/<id>` | Session | Delete; re-assigns apps to uncategorized |
| `GET`  | `/api/apps` | Session | Returns all apps as JSON array |
| `POST` | `/api/apps` | Session | Create app; auto-categorizes if category not locked |
| `POST` | `/api/apps/import` | Session | Parse compose YAML; returns discovered images |
| `GET`  | `/api/apps/export` | Session | Returns JSON export of all apps |
| `POST` | `/api/apps/recategorize` | Session | Re-runs auto-categorization on all apps |
| `PATCH`| `/api/apps/<id>` | Session | Update app fields |
| `DELETE`| `/api/apps/<id>` | Session | Delete app |
| `POST` | `/api/apps/<id>/icon` | Session | Upload custom icon (max 512 KB, base64 stored) |
| `POST` | `/api/apps/<id>/snooze` | Session | Snooze notifications until ISO timestamp |
| `DELETE`| `/api/apps/<id>/snooze` | Session | Clear snooze |
| `POST` | `/api/apps/<id>/ignore` | Session | Ignore specific version |
| `GET`  | `/api/apps/<id>/history` | Session | Version history (JSON array in DB field) |
| `POST` | `/api/apps/<id>/check` | Session | Trigger single-app version check |
| `POST` | `/api/check` | Session | Trigger full version check for all apps |

---

### Hosts and Agent Communication (`routes/hosts.py`)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET`  | `/api/hosts` | Session | List all hosts; app_count populated via subquery |
| `POST` | `/api/hosts` | Session | Create host; token generated, bcrypt-hashed, AES-encrypted |
| `PATCH`| `/api/hosts/<id>` | Session | Update host metadata |
| `DELETE`| `/api/hosts/<id>` | Session | Delete host; cascades to install_tokens; SET NULL on apps |
| `POST` | `/api/hosts/<id>/test` | Session | Health check agent; updates host status |
| `POST` | `/api/hosts/<id>/regenerate-token` | Session | Regenerate agent token |
| `POST` | `/api/apps/<id>/update` | Session | Read compose → patch version → write → docker compose up. nginx timeout 300s |
| `GET`  | `/api/apps/<id>/logs` | Session | Update log entries for this app |
| `POST` | `/api/apps/<id>/revert/<log_id>` | Session | Revert to backup compose file. nginx timeout 300s |
| `DELETE`| `/api/apps/<id>/logs` | Session | Clear update log for app |
| `GET`  | `/api/hosts/ca-fingerprint` | Session | Returns CA cert fingerprint |
| `POST` | `/api/hosts/<id>/generate-install-token` | Session | Generates install token + dec_key pair (bcrypt-hashed, 5-min TTL) |
| `POST` | `/api/agent-provision` | **None** | Public. Validates install token + dec_key; issues agent cert; returns encrypted package |
| `POST` | `/api/hosts/<id>/confirm-tls` | Session | Sets `tls_enabled=True` after fingerprint verified |

---

### Settings and File Serving (`routes/settings.py`)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET`  | `/api/health` | None | Returns `{"status":"ok"}` — used by Docker healthcheck |
| `GET`  | `/api/settings` | Session | Returns all KV settings |
| `POST` | `/api/settings` | Session | Bulk-save settings dict |
| `POST` | `/api/settings/test-telegram` | Session | Sends test message |
| `POST` | `/api/scan-summary` | Session | Sends scan summary if configured |
| `GET`  | `/agent/install.sh` | None | Serves `install.sh` from `/app/agent/` |
| `GET`  | `/agent/vigil-agent.py` | None | Serves `vigil-agent.py` from `/app/agent/` |
| `GET`  | `/agent/uninstall.sh` | None | Serves `uninstall.sh` from `/app/agent/` |

---

### Agent Endpoints (`vigil-agent.py`)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET`  | `/health` | Token header | Returns status, version, TLS state, allowed_base |
| `POST` | `/read` | Token header | Reads compose file from `path` param |
| `POST` | `/write` | Token header | Backs up, writes compose file, runs docker compose up |
| `POST` | `/revert` | Token header | Restores from a named backup path |

---

## Report 4 — Database Inventory

### Tables

#### `schema_version`
Tracks current migration level.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | Integer | PK |
| `version` | Integer | NOT NULL, default 0 |

**Usage:** Read/written only by `migrations.py`. Single row.

---

#### `users`
Single admin account.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | Integer | PK | |
| `username` | String(80) | NOT NULL, UNIQUE | Lowercased |
| `password_hash` | String(200) | NOT NULL | bcrypt, cost ~12 |
| `must_change_pw` | Boolean | NOT NULL, default True | |
| `created_at` | DateTime | nullable | |
| `totp_secret` | String(64) | nullable | base32; NULL = TOTP not configured |
| `totp_enabled` | Boolean | NOT NULL, default False | |
| `totp_backup_codes` | Text | nullable | JSON array of bcrypt hashes |

**Relationships:** None.  
**Notes:** Designed for single-user only. No multi-user support.

---

#### `categories`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | Integer | PK | |
| `key` | String(50) | NOT NULL, UNIQUE | Slug; used as FK in apps |
| `label` | String(80) | NOT NULL | Display name |
| `color` | String(20) | NOT NULL, default `#6b6b8a` | Hex |
| `keywords` | Text | NOT NULL, default `""` | Comma-separated |
| `is_default` | Boolean | NOT NULL, default False | Seeded defaults flag |
| `sort_order` | Integer | NOT NULL, default 100 | |

**Relationships:** `tracked_apps.category` references `categories.key` as a string (no FK constraint).  
**Notes:** The relationship to apps is a string match, not a foreign key. Deleting a category sets orphaned apps to `"uncategorized"` via application logic, not database cascade.

---

#### `tracked_apps`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | Integer | PK | |
| `image` | String(300) | NOT NULL, UNIQUE | Full image reference |
| `name` | String(100) | NOT NULL | Display name |
| `version` | String(100) | NOT NULL, default `"latest"` | Currently running tag |
| `latest_version` | String(100) | nullable | Last known registry version |
| `category` | String(50) | NOT NULL, default `"uncategorized"` | String, no FK |
| `category_locked` | Boolean | NOT NULL, default False | Prevents auto-recategorize |
| `custom_icon` | String(500) | nullable | URL |
| `icon_data` | Text | nullable | base64 data-URI (can be large) |
| `detection_channel` | String(30) | nullable | `dockerhub`/`github`/etc. |
| `version_source_url` | String(500) | nullable | URL to registry page |
| `status` | String(20) | NOT NULL, default `"unknown"` | |
| `last_error` | Text | nullable | |
| `last_checked_at` | String(40) | nullable | ISO timestamp string |
| `last_successful_check` | String(40) | nullable | ISO timestamp string |
| `created_at` | DateTime | nullable | |
| `notify_policy` | String(20) | NOT NULL, default `"always"` | `always`/`major`/`minor`/`patch`/`off` |
| `ignored_version` | String(100) | nullable | |
| `snoozed_until` | String(40) | nullable | ISO timestamp string |
| `version_history` | Text | nullable, default `"[]"` | JSON array, max 20 entries |
| `notes` | Text | nullable | |
| `install_path` | String(500) | nullable | Path on remote host |
| `container_id` | String(100) | nullable | Free-text label (not a Docker container ID) |
| `app_url` | String(500) | nullable | Link to running app |
| `host_id` | Integer | FK → `hosts.id` ON DELETE SET NULL | nullable |
| `service_name` | String(100) | nullable | Service name in compose file |
| `auto_update` | String(20) | NOT NULL, default `"off"` | `off`/`ask`/`auto`/`silent` |

**Relationships:** `host_id` → `hosts.id` (SET NULL on delete).  
**Potential unused fields:**
- `container_id` — stored as free text; not used in any agent operation. Appears to be an informational label only.
- `auto_update` — field exists and is stored, but the scheduler never reads it to trigger automatic updates. The feature is defined in the data model but not implemented in the execution path.
- `version_source_url` — populated by registry fetchers but only used to construct the channel pill URL in the UI.

---

#### `hosts`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | Integer | PK | |
| `name` | String(100) | NOT NULL | |
| `ip` | String(100) | NOT NULL | No format validation at model level |
| `port` | Integer | NOT NULL, default 7777 | |
| `token_hash` | String(200) | NOT NULL | bcrypt hash |
| `allowed_base` | String(500) | NOT NULL, default `"/home"` | |
| `last_seen` | String(40) | nullable | ISO timestamp |
| `status` | String(20) | NOT NULL, default `"unknown"` | |
| `created_at` | DateTime | nullable | |
| `cert_fingerprint` | String(200) | nullable | SHA-256 of agent cert (v2.3) |
| `tls_enabled` | Boolean | NOT NULL, default False | (v2.3) |

**Relationships:** One-to-many with `tracked_apps` (SET NULL), one-to-many with `install_tokens` (CASCADE delete).

---

#### `install_tokens`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | Integer | PK | |
| `token_hash` | String(200) | NOT NULL | bcrypt hash |
| `dec_key_hash` | String(200) | NOT NULL | bcrypt hash |
| `host_id` | Integer | FK → `hosts.id` ON DELETE CASCADE | NOT NULL |
| `created_at` | String(30) | NOT NULL | ISO timestamp |
| `expires_at` | String(30) | NOT NULL | ISO timestamp |
| `used` | Boolean | NOT NULL, default False | |

**Notes:** Short-lived records. Consumed tokens are marked `used=True` but never deleted. Over time, `install_tokens` will accumulate expired/used rows with no cleanup mechanism.

---

#### `update_log`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | Integer | PK | |
| `app_id` | Integer | FK → `tracked_apps.id` ON DELETE CASCADE | NOT NULL |
| `timestamp` | String(40) | NOT NULL | ISO string |
| `action` | String(20) | NOT NULL, default `"update"` | `update`/`revert` |
| `from_version` | String(100) | nullable | |
| `to_version` | String(100) | nullable | |
| `status` | String(20) | NOT NULL, default `"success"` | `success`/`failed`/`reverted` |
| `backup_path` | String(500) | nullable | Absolute path on agent host |
| `triggered_by` | String(50) | NOT NULL, default `"user"` | `user`/`schedule`/`telegram` |
| `error_message` | Text | nullable | |

**Notes:** `triggered_by = "schedule"` and `"telegram"` exist as defined values but are never written — only `"user"` appears in practice since auto-updates are not yet implemented.

---

#### `settings`

| Column | Type | Constraints |
|--------|------|-------------|
| `key` | String(100) | PK |
| `value` | Text | nullable |

**Known keys at runtime:**

| Key | Default | Notes |
|-----|---------|-------|
| `telegram_token` | `""` | Also readable from env |
| `telegram_chat_id` | `""` | Also readable from env |
| `webhook_url` | `""` | |
| `digest_mode` | `"immediate"` | |
| `digest_time` | `"09:00"` | |
| `digest_day` | `""` | |
| `digest_interval_hours` | `"6"` | |
| `digest_template` | `""` | |
| `digest_timezone` | `"UTC"` | |
| `check_interval_hours` | env `CHECK_INTERVAL_HOURS` | Also env at startup |
| `custom_css` | `""` | |
| `app_name` | `"Vigil"` | |
| `app_logo` | base64 default PNG | Large value |
| `app_accent` | `"#A0A0B8"` | |
| `notify_template` | `""` | |
| `scan_summary_notify` | `"off"` | |
| `last_digest_sent` | `""` | Written by scheduler |

**Notes:** `app_logo` stores a base64-encoded PNG. This is the single largest value in the database and is returned on every `/api/settings` GET call.

---

### Indexes

No explicit indexes are defined beyond primary keys and the `UNIQUE` constraint on `users.username`, `categories.key`, and `tracked_apps.image`. There are no explicit indexes on `tracked_apps.host_id`, `tracked_apps.status`, or `update_log.app_id` (though the FK will create an implicit index in some SQLite versions).

---

### Relationships Summary

```
users          — standalone (no FK relationships)
categories     — string-matched from tracked_apps.category (no FK)
tracked_apps   → hosts.id (SET NULL)
               ← update_log.app_id (CASCADE)
hosts          ← tracked_apps.host_id (SET NULL)
               ← install_tokens.host_id (CASCADE)
install_tokens → hosts.id (CASCADE)
update_log     → tracked_apps.id (CASCADE)
settings       — standalone KV
schema_version — standalone
```

---

## Report 5 — Scheduler Inventory

### Job: `run_version_checks`

**Registration:** `_scheduler.add_job(run_version_checks, args=[flask_app], trigger="interval", hours=hours, id="version_check")`  
**Trigger:** Interval-based; default 6 hours (`CHECK_INTERVAL_HOURS` env var).  
**Live reschedule:** `reschedule_interval(hours)` callable from settings save.  
**First run:** Immediately on add (`next_run_time=datetime.now()`).  
**Persistence:** In-memory only (`MemoryJobStore`). No persistence across restarts — job re-registers on startup.

**Execution flow:**
1. Load all `TrackedApp` records
2. For each app, call `_check_one(app_id, flask_app)` inside an app context
3. `_check_one` calls `resolve_latest_version(image, version_hint)`
4. `resolve_latest_version` dispatches to the appropriate registry fetcher
5. Status computed by `_is_version_tag()` + `_smart_gte()`
6. `_should_notify()` decides whether to send notification
7. Notification sent via Telegram and/or webhook
8. Digest mode checked via `_should_send_digest()`
9. Scan summary sent if configured

**Failure handling:**
- Per-app exceptions caught; `entry.status = "error"` and `entry.last_error` set
- DB committed per-app
- One app failure does not stop other apps from being checked
- No global retry mechanism — next run is the retry

**Registry fetchers:**

| Fetcher | Registries | Rate limiting |
|---------|-----------|---------------|
| `fetch_dockerhub_latest` | Docker Hub, lscr.io (via Docker Hub API) | None (anonymous) |
| `fetch_github_latest_smart` | GitHub Releases + Tags | Uses `GITHUB_TOKEN` if set |
| `fetch_gitlab_latest` | GitLab.com + self-hosted | Uses `GITLAB_TOKEN` if set |
| `fetch_gitea_latest` | Gitea, Forgejo, Codeberg | Uses `GITEA_TOKEN` if set |
| `fetch_quay_latest` | Quay.io | No auth supported |

**Notification dispatch:**
- `send_telegram(token, chat_id, text)` — HTTP POST to Telegram Bot API via `requests`
- `_send_webhook(url, payload)` — HTTP POST with JSON payload via `requests`
- Digest: accumulates notifications, sends batch at configured time
- Digest modes: `immediate`, `daily`, `weekly`, `interval`

**Scheduler backend:** `APScheduler 3.10.4` with `BackgroundScheduler` and default `MemoryJobStore`.  
**Worker threads:** 1 (`max_workers=1`) — prevents concurrent runs of the same job.  
**Gunicorn workers:** 1 (`--workers 1 --threads 4`) — required because APScheduler runs in-process.

---

## Report 6 — Configuration Inventory

### Environment Variables

| Variable | Default | Read in | Security sensitivity |
|----------|---------|---------|---------------------|
| `PORT` | `3000` | `docker-compose.yml` | Low |
| `DATA_DIR` | `/data` | `app.py`, `ca.py` | Medium — contains DB, CA key, secret key |
| `SECURE_COOKIES` | `false` | `app.py` | High — must be `true` behind TLS proxy |
| `SESSION_LIFETIME_HOURS` | `12` | `app.py` | Medium |
| `ALLOWED_ORIGIN` | `*` | `app.py` | Medium — wildcard CORS by default |
| `CHECK_INTERVAL_HOURS` | `6` | `scheduler.py`, `settings.py` | Low |
| `TELEGRAM_TOKEN` | `""` | `docker-compose.yml` → `scheduler.py` | High — bot token |
| `TELEGRAM_CHAT_ID` | `""` | `docker-compose.yml` → `scheduler.py` | Medium |
| `GITHUB_TOKEN` | `""` | `scheduler.py` | Medium — PAT |
| `GITLAB_TOKEN` | `""` | `scheduler.py` | Medium — PAT |
| `GITEA_TOKEN` | `""` | `scheduler.py` | Medium — PAT |

**Notes:**
- `GITEA_TOKEN` is not documented in `.env.example`.
- `TELEGRAM_TOKEN` and `TELEGRAM_CHAT_ID` are passed to the container via env but also stored in the `settings` table. The scheduler reads from `Settings.get()` (DB), not env at check time. The env vars are only injected at container start and stored in the DB during first-use. This creates a dual-source concern.
- `CHECK_INTERVAL_HOURS` is read from env at scheduler start AND from Settings KV at runtime reschedule. They can diverge.

### Runtime Settings (Database)

Documented in Report 4 (`settings` table). 18 known keys.

### Secret Handling

| Secret | Storage | Notes |
|--------|---------|-------|
| `SECRET_KEY` | `/data/.secret_key` file (binary, 32 bytes) | Generated once; loss invalidates all encrypted agent tokens |
| Agent tokens | `settings` table, AES-256-GCM encrypted | Key derived from `SECRET_KEY` via SHA-256 |
| User password | `users` table, bcrypt | |
| TOTP secret | `users.totp_secret`, plaintext in DB | Not encrypted at rest |
| Backup codes | `users.totp_backup_codes`, JSON bcrypt hashes | |
| Telegram token | `settings` table, plaintext | |
| CA private key | `/data/vigil-ca.key`, PEM, mode 600 | 4096-bit RSA |
| Vigil client cert key | `/data/vigil-client.key`, PEM, mode 600 | 2048-bit RSA |
| Install token | `install_tokens.token_hash`, bcrypt | Never stored plaintext |
| Decryption key | `install_tokens.dec_key_hash`, bcrypt | Never stored or transmitted |

### Ambiguous Settings

- `check_interval_hours` exists both as env var (`CHECK_INTERVAL_HOURS`) and as a DB settings key. They can have different values after a UI change.
- `ALLOWED_ORIGIN=*` default allows any origin to make credentialed API requests. Appropriate for LAN but risky if exposed publicly.

---

## Report 7 — Dependency Inventory

### Backend (`requirements.txt`)

| Package | Version | Purpose | Files using it | Required? |
|---------|---------|---------|----------------|-----------|
| `flask` | 3.1.0 | Web framework | `app.py`, all routes | ✅ |
| `flask-sqlalchemy` | 3.1.1 | ORM | `models.py`, all routes | ✅ |
| `flask-cors` | 4.0.1 | CORS headers | `app.py` | ✅ |
| `apscheduler` | 3.10.4 | Background job scheduler | `scheduler.py` | ✅ |
| `requests` | 2.32.3 | HTTP client for registry APIs and Telegram | `scheduler.py` | ✅ |
| `gunicorn` | 22.0.0 | WSGI production server | `entrypoint.sh` | ✅ |
| `greenlet` | 3.1.1 | Coroutine support (SQLAlchemy dependency) | Indirect | ⚠️ Indirect — may not need explicit pin |
| `pyyaml` | 6.0.2 | YAML parsing for compose files | `utils.py`, `routes/apps.py`, agent | ✅ |
| `bcrypt` | 4.2.1 | Password and token hashing | `models.py`, `routes/auth.py`, `routes/hosts.py` | ✅ |
| `flask-session` | 0.8.0 | Server-side session storage | **Not imported anywhere** | ❌ Unused |
| `reportlab` | 4.2.5 | QR code SVG generation for TOTP setup | `routes/auth.py` | ⚠️ Heavy (2MB+) for single use |
| `tzdata` | 2024.2 | Timezone data for digest scheduling | `scheduler.py` (via `zoneinfo`) | ✅ |
| `cryptography` | 44.0.2 | AES-256-GCM token encryption, TLS cert generation | `routes/hosts.py`, `ca.py` | ✅ |

**Flags:**
- `flask-session==0.8.0` — **not imported anywhere** in the codebase. Flask's built-in cookie-based sessions are used instead. This is an unused dependency adding ~100KB and a potential attack surface.
- `greenlet==3.1.1` — explicit pin may be unnecessary; it is a transitive dependency of SQLAlchemy. Worth verifying whether explicit pinning is needed.
- `reportlab==4.2.5` — a large general-purpose PDF/graphics library used only for TOTP QR code SVG generation. The QR generation could be replaced with a lightweight pure-Python library (`qrcode` ~50KB vs `reportlab` ~2MB+).

### Frontend (`package.json`)

| Package | Version | Purpose | Required? |
|---------|---------|---------|-----------|
| `react` | 18.3.1 | UI framework | ✅ |
| `react-dom` | 18.3.1 | DOM renderer | ✅ |
| `@vitejs/plugin-react` | 4.3.1 | Vite React plugin | ✅ (dev) |
| `vite` | 5.4.1 | Build tool | ✅ (dev) |

**Notes:** Minimal dependency footprint. No component libraries, no state management libraries, no CSS frameworks. All CSS is hand-written and injected as a template literal. `package.json` version field is `2.2.0` — not updated to reflect v2.3.

### Agent (`install.sh` installs)

| Package | Installed via | Purpose | Required? |
|---------|--------------|---------|-----------|
| `pyyaml` | `pip install` | YAML validation before writes | ✅ |
| `cryptography` | `pip install` | AES-256-GCM cert package decryption | ✅ |

---

## Report 8 — Initial Findings

### Architectural Strengths

1. **Clear separation of concerns at route level.** Four blueprints (`auth`, `apps`, `hosts`, `settings`) have well-defined responsibilities with minimal cross-blueprint calls.

2. **Comprehensive mutual TLS implementation.** The CA model, certificate provisioning flow, fingerprint verification, and encrypted delivery chain are correctly designed. Both sides of the mTLS handshake are implemented.

3. **Defensive migration system.** All 18 migrations check column/table existence before altering, making the migration system safe to re-run. `LATEST_VERSION = max(MIGRATIONS.keys())` prevents ordering errors.

4. **Security-conscious defaults.** bcrypt for passwords (cost 12), HMAC-safe token comparison, AES-256-GCM for token storage at rest, rate limiting on all auth endpoints, input length caps on all fields, YAML-only compose writes.

5. **Zero frontend dependencies.** The entire UI runs on React + Vite with no component libraries, no CSS frameworks, and no state management libraries. Build output is a single JS file (~470KB gzipped).

6. **Single gunicorn worker.** The single-worker + in-process APScheduler pattern avoids the scheduler duplication problem that affects multi-worker deployments. This is an intentional and correct trade-off for a single-instance app.

7. **Agent path traversal prevention.** `_safe_path()` uses `Path.resolve().relative_to(ALLOWED_BASE)` — correctly prevents directory traversal attacks.

---

### Architectural Weaknesses

1. **`App.jsx` is a 4,515-line monolith.** The entire frontend — all views, all state (163 hooks), all CSS (~400 class definitions), all utility functions — lives in a single file. This creates navigation difficulty, increases the risk of React hooks ordering violations (one of which caused the recent black-screen bug), makes testing impossible, and makes incremental builds slower.

2. **Duplicate utility functions.** Five functions in `apps.py` duplicate counterparts in `utils.py`. The private copies in `apps.py` do not benefit from changes made to `utils.py`, and vice versa.

3. **`auto_update` field is unimplemented.** The `auto_update` column (`off`/`ask`/`auto`/`silent`) exists on `TrackedApp` and is surfaced in the UI, but the scheduler never reads it to trigger automated updates. Users setting `auto` may expect behavior that does not occur.

4. **`install_tokens` table grows unbounded.** Used and expired tokens are marked `used=True` but never deleted. The table will accumulate indefinitely.

5. **`flask-session` is installed but unused.** Flask's built-in cookie-based sessions are used throughout. `flask-session` is listed in `requirements.txt` but never imported.

6. **`CH_LABELS` dict is defined twice in `scheduler.py`.** Lines 35 and 785 contain identical definitions. A change to one must be replicated to the other.

7. **Dual configuration sources.** `telegram_token`, `telegram_chat_id`, and `check_interval_hours` exist both as environment variables and as database settings keys. They can diverge silently after a UI change.

8. **TOTP secret stored in plaintext.** `users.totp_secret` is stored unencrypted in the database. If the database is extracted, TOTP secrets are directly exposed. Agent tokens receive AES encryption; TOTP secrets do not.

9. **`bookstack` keyword appears in two categories.** `bookstack` is listed in both `productivity` and `storage` keyword lists in `categories.py`. Whichever category is matched first wins; the behavior is not deterministic across installs if category iteration order changes.

10. **`ALLOWED_ORIGIN=*` by default.** CORS is set to `*` out of the box. Combined with `SESSION_COOKIE_SAMESITE=Lax` and cookie-based auth, this is a CSRF risk if Vigil is exposed publicly without changing `ALLOWED_ORIGIN`.

11. **`reportlab` is a disproportionately heavy dependency** for its single use case (TOTP QR SVG generation). It adds ~2MB to the image for a feature used once during setup.

---

### Areas of Technical Debt

1. **Inconsistent timestamp storage.** Some fields use `db.Column(db.DateTime)` (Python datetime objects), others use `db.Column(db.String(40))` with ISO strings. Examples: `users.created_at` and `host.created_at` are DateTime; `tracked_apps.last_checked_at`, `install_tokens.expires_at`, and `update_log.timestamp` are String. This makes date comparison and sorting inconsistent.

2. **`update_log.triggered_by` has dead values.** The values `"schedule"` and `"telegram"` are defined in the schema docstring but never written in any code path. Only `"user"` appears at runtime.

3. **`container_id` field semantic mismatch.** The field is named `container_id` but its comment says "e.g. LXC 101 or VM 105" — it is a human-readable infrastructure label, not a Docker container ID. The name is misleading.

4. **`package.json` version out of sync.** Frontend `package.json` declares version `2.2.0` while the codebase is at v2.3.

5. **`GITEA_TOKEN` undocumented.** The `GITEA_TOKEN` environment variable is read in `scheduler.py` but is not present in `.env.example`.

6. **No cleanup of expired `install_tokens`.** Expired and used tokens accumulate with no pruning. A background cleanup job or a TTL-based deletion on provision would address this.

7. **Agent `vigil-setup` helper recreated each install.** The `vigil-setup` script is embedded as a heredoc in `install.sh`. If the script logic changes, previously installed agents require a reinstall to get the updated helper.

---

### Areas Needing Deeper Investigation

1. **`auto_update` implementation path.** The column, UI controls, and value validation exist. The scheduler has no code to act on it. Whether this is intentional deferral or an incomplete feature needs clarification before any future work touches the agent communication layer.

2. **Telegram token dual-source behavior.** When `TELEGRAM_TOKEN` is set as an env var but the user changes it in the UI (which writes to the DB), which value is used? The scheduler reads from `Settings.get("telegram_token")` — the DB value — but the env var is only used during initial container setup. The exact persistence chain needs verification.

3. **Agent connection reliability under load.** The single gunicorn worker means all agent write operations (potentially 180-second blocking calls) block all other API requests. The impact on responsiveness during an update operation has not been characterized.

4. **`icon_data` field size in production.** `icon_data` stores base64-encoded images directly in the `tracked_apps` table. In an install with many apps using custom icons, this could grow significantly. No size limit is enforced at the model level (only at the upload endpoint, 512KB). The impact of large `icon_data` values on `GET /api/apps` response size and DB performance has not been characterized.

5. **`version_history` JSON storage.** Version history is stored as a JSON string in `tracked_apps.version_history`. With potentially many apps and frequent checks, the serialization/deserialization overhead and the lack of queryability (no SQL WHERE on JSON content) may become relevant.

6. **Certificate revocation.** There is no mechanism to revoke a compromised agent certificate. Once issued, a cert is valid for 10 years. If an agent host is compromised or decommissioned, the only mitigation is to delete the host from Vigil (which removes the token but not the cert) and re-issue. The implications of this for the security model are not fully documented.
