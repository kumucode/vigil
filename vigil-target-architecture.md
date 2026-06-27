# Vigil — Target Architecture Design
**Version:** v2.3 baseline → target  
**Step:** 5 of the Architecture Stabilization Program  
**Scope:** Design only. No code was modified.

---

## Report 1 — Architectural Principles

These principles are derived from the findings of Steps 1–4 and are specifically calibrated to Vigil's context: a single-maintainer, self-hosted, open-source homelab tool used by technically capable but time-limited individuals.

---

### P1 — Single Source of Truth per Setting

**Statement:** Every configuration value, every piece of application state, and every shared constant must have exactly one authoritative location. Multiple representations of the same value are prohibited unless one is explicitly and visibly derived from the other.

**Why this matters for Vigil:** Steps 3 and 4 identified three dual-source configurations (`check_interval_hours`, Telegram credentials, agent token) where two representations diverge silently at runtime. The most damaging case is `check_interval_hours`: a user configures 2h in the UI, restarts the container for an unrelated reason, and suddenly checks happen every 6h with no indication of why. A self-hosted user in this situation has no path to diagnosis. The principle eliminates this class of bug entirely.

**Scope:** Scheduler settings, notification credentials, session key name strings, Settings KV key name strings, agent token representations, category seeding lists.

---

### P2 — Explicit Module Ownership

**Statement:** Every function, data structure, and route belongs to exactly one module. That module is the only entity that may write to its owned data. Reads from owned data may cross module boundaries via defined interfaces.

**Why this matters for Vigil:** The current codebase has `routes/apps.py` importing the private function `scheduler._check_one`; `routes/hosts.py` importing `scheduler._send_webhook`; `scheduler.py` importing `models.Settings` directly at runtime. These hidden dependencies make modules impossible to understand in isolation. The principle does not prohibit imports — it prohibits ownership ambiguity.

**Concrete boundary:** `scheduler.py` owns version check state. `routes/hosts.py` owns host state and update execution. `routes/apps.py` owns app CRUD and may trigger a check by calling a defined public interface on the scheduler, not a private function.

---

### P3 — Separation of Concerns at Module Granularity

**Statement:** A module handles one primary concern. A file exceeding 400 lines is a signal that it may be handling more than one concern and should be reviewed for splitting. This is not a hard limit — `migrations.py` at 390 lines handles 18 migrations appropriately as a single concern.

**Why this matters for Vigil:** `scheduler.py` (877 lines, 10 concerns), `routes/hosts.py` (760 lines, 11 concerns), and `App.jsx` (4,515 lines, all concerns) are documented complexity hotspots. The black-screen bug — a hooks ordering violation caused by the difficulty of reasoning about a 4,515-line component — is a direct consequence of this principle being violated. Each concern added to a large module increases the cognitive load of modifying any part of it.

**Application:** This principle drives Reports 2 and 3, which define the target module structure.

---

### P4 — No Dead Code in Production

**Statement:** Code that is never executed, never called, and serves no documented purpose must not exist in the main branch. Legacy compatibility paths must be documented and time-bounded.

**Why this matters for Vigil:** Step 4 identified 10 dead functions, 3 dead field values, and 1 dead package. Dead code is not neutral — it imposes a maintenance burden (it must be read and understood), creates false impressions (a reader assumes `Host.check_token()` is called somewhere and spends time looking), and adds attack surface (`flask-session` installed but never imported). The principle is especially important for an open-source project where new contributors read every line.

**Application:** This is the primary driver for Report 8 (Legacy Compatibility Strategy).

---

### P5 — Duplication Is a Defect

**Statement:** When the same logic exists in two places, one copy will drift out of sync with the other. Shared logic belongs in a single location with a single name.

**Why this matters for Vigil:** Step 4 identified 7 duplicate logic groups: five utility functions duplicated between `utils.py` and `apps.py`, two identical `CH_LABELS` dicts in `scheduler.py`, and two implementations of scan summary notification. The `utils.py` copies are dead because `apps.py` uses its own private copies. This creates a scenario where `utils.norm` receives a bugfix that `apps._norm` never gets, producing subtly different behavior. The correct fix is one canonical implementation, not two.

---

### P6 — Backward Compatibility is Explicit and Time-Bounded

**Statement:** Legacy compatibility paths must be explicitly documented: what they are compatible with, why they exist, and when they may be removed. Undocumented legacy paths must be treated as bugs.

**Why this matters for Vigil:** The current codebase has three token format generations (`enc1:`, `plain:`, bare string) with no documentation of which version introduced each, what conditions trigger the fallback, or when older formats may be removed. Users upgrading from very old installs may silently hit the `plain:` path without knowing they are in a degraded state.

**Application:** Each legacy artifact from Step 4 Report 7 is classified in Report 8 below.

---

### P7 — Complexity is Paid at the Point of Introduction

**Statement:** When adding a feature, the author is responsible for placing it in the correct module and not inflating the complexity of existing modules. A new feature that logically belongs in a new file must be placed in a new file, not appended to an existing one.

**Why this matters for Vigil:** `App.jsx` reached 4,515 lines because every feature addition appended to an existing file rather than creating a new component or hook. `routes/hosts.py` handles 11 concerns because agent provisioning, update execution, and host CRUD were all added to the same file. The principle does not require a complex pre-planned architecture — it requires that each addition be placed appropriately at the time it is written.

---

### P8 — The Scheduler is a Passive Consumer of Configuration

**Statement:** The scheduler must not be the authoritative writer for any user-facing configuration. It reads configuration from the database; it does not define it.

**Why this matters for Vigil:** Currently, `start_scheduler()` reads `CHECK_INTERVAL_HOURS` from the environment and defines the initial state of the check interval outside of the database. This creates the drift scenario. The target is: the database is always authoritative, startup reads from the database (with env vars as a one-time seed on first run), and the scheduler is never in a diverged state after a restart.

---

## Report 2 — Target Backend Architecture

### Module Map

The target backend is organized into nine modules, each with a single primary concern.

```
backend/
├── app.py                 # Application factory only — wiring, no logic
├── config.py              # Constants, LEN caps, rate limiter (unchanged)
├── models.py              # ORM models only (unchanged)
├── migrations.py          # Schema migrations (unchanged)
│
├── auth.py                # Authentication logic (extracted from routes/auth.py)
├── ca.py                  # Private CA and mTLS (unchanged)
├── categories.py          # Category seeding and auto-categorize (unchanged)
│
├── services/
│   ├── __init__.py
│   ├── version_checker.py # Registry fetching, version comparison, status
│   ├── notifications.py   # Telegram, webhook, digest, scan summary
│   └── update_executor.py # Compose read/patch/write via agent
│
├── scheduler.py           # APScheduler lifecycle + job orchestration only
│
└── routes/
    ├── __init__.py
    ├── auth.py            # Auth HTTP routes (thin, delegates to auth.py service)
    ├── apps.py            # App CRUD routes
    ├── hosts.py           # Host CRUD + provisioning routes
    └── settings.py        # Settings routes (thin)
```

---

### Module Responsibilities

#### `app.py` — Application Factory
**Owns:** Flask application creation, blueprint registration, startup sequencing.  
**Does not own:** Any business logic. All startup side effects (CA init, scheduler start, DB seeding) are delegated to their owning modules.  
**Change from current:** Unchanged in structure; logic within it remains thin. No changes needed beyond what other refactors produce.

---

#### `config.py` — Constants and Rate Limiter
**Owns:** `LEN`, `MAX_ICON_BYTES`, `TOTP_PENDING_TTL`, `rate_limit()`, and all application-level string constants (session key names, Settings KV key names, agent token prefixes).  
**Change from current:** Add named constants for all string literals that are currently repeated across modules:
- `SESSION_KEY_USER_ID = "user_id"` (currently a string literal in `auth.py` and `utils.py`)
- `SETTINGS_TELEGRAM_TOKEN = "telegram_token"` (used in 3+ files)
- `TOKEN_PREFIX_ENC = "enc1:"` (used in `hosts.py`)
- `TOKEN_PREFIX_PLAIN = "plain:"` (used in `hosts.py`)
- `CHANNEL_DOCKERHUB = "dockerhub"` etc. (currently two separate `CH_LABELS` dicts in `scheduler.py`)

This makes typos compile-time detectable and eliminates the duplicate `CH_LABELS` problem.

---

#### `models.py` — ORM Models
**Owns:** All SQLAlchemy model classes, the `db` instance, and `to_dict()` serialization.  
**Change from current:** Remove `Host.check_token()` (dead, per CC-06). Remove `Host.token_hash` column eventually (see Report 8). No other changes to model structure.

---

#### `services/version_checker.py` — Registry and Version Logic
**Owns:** All registry fetching functions, version comparison logic, `_is_version_tag()`, `_smart_gte()`, `_semver_key()`, `resolve_latest_version()`, `_check_one()`.  
**Extracted from:** `scheduler.py` (current lines ~1-530, the lower half of the file).  
**Public interface:**
- `resolve_latest_version(image, version_hint) → (version, channel)`
- `check_one(app_id, flask_app) → dict` (renamed from `_check_one` — now public)
- `_SKIP_TAGS` constant (shared across version checking logic)

**Rationale:** The registry fetchers are independent of the scheduler. They can be called from routes (`POST /api/apps/<id>/check`) without going through APScheduler. Making this a separate module allows routes to call `version_checker.check_one()` directly via a clean public interface, eliminating the `apps.py` import of `scheduler._check_one`.

---

#### `services/notifications.py` — Notification Delivery
**Owns:** `send_telegram()`, `_send_webhook()`, `_render_template()`, `_should_notify()`, `_should_send_digest()`, `_build_digest()`, `scan_summary_notify()`, `CH_LABELS` constant (defined once here).  
**Extracted from:** `scheduler.py` (current lines ~500-620) and `routes/settings.py` (dead `scan_summary()` route — merged into this module as the canonical implementation).  
**Public interface:**
- `send_telegram(token, chat_id, text)`
- `send_webhook(url, payload)`
- `notify_update(app_name, action, from_ver, to_ver, status, host_name, error)` (renamed from `_notify_action`)
- `should_notify(entry, bump_type) → bool`
- `dispatch_notifications(notify_list, settings_dict)` — handles immediate vs. digest
- `maybe_send_digest(settings_dict, flask_app)` — handles digest scheduling check
- `send_scan_summary(flask_app)` — single canonical scan summary implementation
- `CH_LABELS` dict constant

**Rationale:** Notification logic is currently split across `scheduler.py` (the delivery functions) and `routes/hosts.py` (the `_notify_action` call after updates). Moving it to a single module allows `routes/hosts.py` to call `notifications.notify_update()` without importing from `scheduler`, and eliminates the dead `scan_summary()` route in settings.

---

#### `services/update_executor.py` — Agent Update Operations
**Owns:** Compose file read/patch/write via agent, revert via agent, `_agent_request()`, `_agent_health()`, `_agent_url()`, `_tls_context()`.  
**Extracted from:** `routes/hosts.py` (current lines ~190-460).  
**Public interface:**
- `execute_update(entry, host, token, triggered_by) → dict`
- `execute_revert(entry, host, token, log_entry) → dict`
- `test_agent_connection(host, token) → dict`

**Rationale:** Agent communication is currently embedded in `routes/hosts.py` alongside CRUD and provisioning. Extracting it makes `routes/hosts.py` a clean HTTP layer and makes the update logic independently testable. It also gives `update_executor` clean access to `notifications.notify_update()` without the circular dependency that would result from `routes/hosts.py` importing from `scheduler.py`.

---

#### `scheduler.py` — Job Orchestration Only
**Owns:** APScheduler lifecycle (`start_scheduler`, `get_scheduler_status`, `reschedule_interval`), job function `run_version_checks()`, module-level status globals (`_last_run_at`, `_last_run_ok`, `_last_run_finished_at`).  
**Does NOT own:** Registry fetching (→ `version_checker`), notification delivery (→ `notifications`), scan summary (→ `notifications`).  
**Target size:** ~100 lines. The job function `run_version_checks()` becomes an orchestrator: load IDs, call `version_checker.check_one()` for each, collect results, call `notifications.dispatch_notifications()`, call `notifications.send_scan_summary()`.

---

#### `routes/apps.py` — App and Category HTTP Routes
**Change from current:**
- Remove private utility functions `_norm`, `_sort_key`, `_derive_status`, `_parse_image_name`, `_parse_compose_images` — replace with canonical implementations from a shared `utils.py` (see below).
- Replace `from scheduler import _check_one` with `from services.version_checker import check_one`.
- No structural changes to routes themselves.

---

#### `routes/hosts.py` — Host and Provisioning HTTP Routes
**Change from current:**
- Move agent communication functions to `services/update_executor.py`.
- Move `_notify_action()` to `services/notifications.py`.
- Remove `_check_token()` (dead code, CC-07).
- Route handlers become thin: validate input → call service → return response.
- **Target size:** ~350 lines (down from 760).

---

#### `utils.py` — Canonical Shared Utilities
**Change from current:** Remove dead functions `norm`, `sort_key`, `derive_status`, `parse_image_name`, `parse_compose_images` OR — preferably — replace the private duplicates in `apps.py` with imports from `utils.py` and keep `utils.py` as the authoritative location.

**Decision:** Keep `utils.py` as the canonical location for shared utilities. The `apps.py` private duplicates are removed; `apps.py` imports from `utils.py`. The `scheduler.py` inline lambda `_norm` is replaced with an import from `utils`.

**Canonical implementations to keep:**
- `norm(s)` — the most thorough version (lowercase + strip v + collapse whitespace)
- `parse_image_name(image)` — with the generic name fallback from `apps._parse_image_name`
- `parse_compose_images(content)` — with the tag-splitting behavior from `apps._parse_compose_images`
- `derive_status(version, latest)` — with the `pinned` detection from `apps._derive_status`
- `sort_key(s)` — keep for simple cases; `version_checker._semver_key` remains the authoritative complex parser

---

### Ownership Boundaries Summary

| Module | Owns | Reads from | Writes to |
|--------|------|-----------|----------|
| `version_checker` | Registry logic, version comparison | `models.TrackedApp` (read), external APIs | `models.TrackedApp` (via `check_one`) |
| `notifications` | All notification delivery | `models.Settings`, `models.TrackedApp` | `models.Settings` (`last_digest_sent`) |
| `update_executor` | Agent communication, compose patching | `models.Host`, `models.TrackedApp`, `models.UpdateLog` | `models.TrackedApp`, `models.UpdateLog`, `models.Host` |
| `scheduler` | Job lifecycle, orchestration | — | Status globals |
| `routes/hosts` | Host CRUD, provisioning HTTP | `models.Host`, `models.InstallToken` | `models.Host`, `models.InstallToken`, `models.Settings` (token) |
| `routes/apps` | App CRUD HTTP | `models.TrackedApp`, `models.Category` | `models.TrackedApp`, `models.Category` |
| `routes/settings` | Settings HTTP | `models.Settings` | `models.Settings` |
| `routes/auth` | Auth HTTP | `models.User` | `models.User` |
| `ca` | TLS certificates | Filesystem | Filesystem |

---

## Report 3 — Target Frontend Architecture

### Core Problem Statement

The entire frontend is one 4,515-line file with 87 state variables and 12 effects in a single component. The black-screen bug (a hooks ordering violation) resulted directly from this structure. The target architecture splits this into a conventional React project structure without introducing new dependencies.

**Constraint:** Zero new dependencies. The target uses only React 18 built-ins: `useState`, `useEffect`, `useCallback`, `useRef`, `useMemo`, `createContext`, `useContext`, `createPortal`. No Redux, no Zustand, no React Router.

---

### Target Structure

```
frontend/src/
├── main.jsx                  # Root mount (unchanged)
├── api.js                    # All fetch calls — one canonical location
├── constants.js              # CHANNEL_META, SKIP_TAGS, DEFAULT_LOGO, CSS_TEMPLATE
│
├── App.jsx                   # Root component: auth gate + layout shell only (~100 lines)
│
├── context/
│   ├── AuthContext.jsx        # currentUser, authState, login, logout
│   └── AppDataContext.jsx     # apps, categories, hosts, settings — shared server state
│
├── hooks/
│   ├── useApi.js              # Authenticated fetch wrapper
│   ├── useSettings.js         # Settings load/save
│   ├── useScheduler.js        # Scheduler status polling
│   └── useToast.js            # Toast notification state
│
├── pages/
│   ├── LoginPage.jsx          # Login + TOTP flow
│   ├── DashboardPage.jsx      # App grid/list/table view
│   ├── SettingsPage.jsx       # Settings panel
│   └── HistoryPage.jsx        # Update log modal/panel
│
├── components/
│   ├── layout/
│   │   ├── Topbar.jsx
│   │   └── Sidebar.jsx        # (if ever added)
│   ├── apps/
│   │   ├── AppCard.jsx        # Grid card
│   │   ├── AppRow.jsx         # List/table row
│   │   ├── AppEditModal.jsx   # Edit overlay (overData state lives here)
│   │   ├── AppIconPicker.jsx  # Icon search panel
│   │   └── VersionHistory.jsx # History display
│   ├── hosts/
│   │   ├── HostCard.jsx
│   │   └── ProvisionWizard.jsx # 4-step TLS wizard
│   ├── notifications/
│   │   ├── NotifBell.jsx
│   │   └── NotifDropdown.jsx
│   ├── settings/
│   │   ├── TelegramSettings.jsx
│   │   ├── DigestSettings.jsx
│   │   └── AppearanceSettings.jsx
│   └── shared/
│       ├── Modal.jsx          # Generic portal-based modal
│       ├── Toast.jsx          # Toast display
│       ├── ChannelPill.jsx    # Registry channel badge
│       ├── AppIcon.jsx        # App icon with CDN fallback
│       ├── Tooltip.jsx
│       ├── TzSelect.jsx
│       └── AccentColorPicker.jsx
│
└── utils/
    ├── version.js             # resolveChannelUrl, parseImageName
    ├── color.js               # hsvToRgb, rgbToHsv, hexToRgb, rgbToHex
    └── image.js               # parseImage, stripBlackBackground
```

---

### Responsibility Map

#### `api.js` — Canonical API Client
All `fetch` calls live here. The `useApi` hook in the current `App.jsx` is extracted to `hooks/useApi.js`. Every API function is named and exported:
```
fetchApps(), fetchCategories(), fetchHosts(), fetchSettings(),
patchApp(id, data), deleteApp(id), checkApp(id), triggerUpdate(id),
createHost(data), deleteHost(id), generateInstallToken(hostId), ...
```
**Why:** Currently API calls are inline `fetch` strings scattered across 10+ `const` functions inside `App()`. A typo in an endpoint string silently fails. Named functions in a single file are testable and discoverable.

---

#### `context/AuthContext.jsx` — Authentication State
Owns: `authState` (`"loading"` | `"logged-in"` | `"logged-out"`), `currentUser`, `login()`, `logout()`, `totp_required` flow.  
Currently: 4 state variables in `App()` + the entire login/TOTP flow JSX.  
**Why:** Auth state is needed by `App.jsx` (to decide which page to render) and by every route that displays the username or must-change-pw banner. Context eliminates prop drilling.

---

#### `context/AppDataContext.jsx` — Shared Server State
Owns: `apps`, `categories`, `hosts` arrays plus their setters. Exposes `refreshApps()`, `refreshHosts()` for components that need to trigger re-fetches.  
Currently: 3 state variables in `App()` that are passed as props to every component.  
**Why:** These three arrays are the core data model of the application and are read by every major component. Context eliminates the prop-drilling that currently threads them through 3+ component layers.

---

#### `pages/DashboardPage.jsx` — Main Dashboard
Owns: `viewMode`, `sortMode`, `filterCat`, `filterStatus`, `search`, `cardOrder` — all view-preference state. Renders `AppCard` or `AppRow` components based on view mode.  
Currently: 12+ state variables in `App()` for view management.  
**Why:** View preferences are purely local UI state that no other page needs. Isolating them in `DashboardPage` means the 87-useState App() component sheds ~15 state variables.

---

#### `components/apps/AppEditModal.jsx` — Edit Overlay
Owns: All `overData` state (15 fields), save handler, validation.  
Currently: `overData` state is in `App()` but the modal is rendered as inline JSX within `App()`'s return.  
**Why:** `overData` has 15 fields representing exactly one operation (editing one app). Moving it to its own component gives those 15 fields a home that is scoped to when they are actually used, and eliminates the 87→72 reduction in `App()` state variables.

---

#### `components/hosts/ProvisionWizard.jsx` — TLS Provisioning Wizard
Owns: All 10+ wizard-state variables (`installToken`, `decKey`, `newToken`, `tokenExpiry`, `isPublicIp`, `copiedInstall`, etc.), the 4-step UI, and fingerprint display.  
Currently: 10+ state variables in `App()` for a feature that is only active when the wizard is open.  
**Why:** The wizard is a self-contained multi-step flow. Its state is meaningless outside of the wizard being open.

---

#### `CardMenu` — Extracted from `App()`
**Problem identified in Steps 2–4:** `CardMenu` is currently a component with 5 hooks (`useState`, `useRef`) defined *inside* `App()`. This violates React's rules because a component defined inside another component's render body is recreated on every render, resetting its hooks.  
**Target:** `CardMenu` is extracted to `components/apps/CardMenu.jsx` as a proper top-level component. It receives the `app`, callback functions, and accent color as props.

---

#### State That Stays in `App.jsx`
After extraction, `App.jsx` retains only:
- Auth gate (reads from `AuthContext`)
- Layout shell (topbar + main content area)
- Global `modal` state — which overlay is currently open (`"edit"` | `"history"` | `"hosts"` | `"settings"` | `null`)
- `activeApp` — which app the current overlay is for
- `toast` state (or delegated to `ToastContext`)
- `schedulerStatus` (from `useScheduler` hook)

Target `App.jsx` size: ~150 lines, ~8 state variables.

---

### Hook Inventory

| Hook | Owns |
|------|------|
| `useApi` | Authenticated fetch wrapper, session expiry detection |
| `useSettings` | `settings` state, `saveSettings()`, logo/accent/name |
| `useScheduler` | `schedulerStatus` polling every 5s during active check |
| `useToast` | `toast` message state, `showToast()` |

---

## Report 4 — Configuration Architecture

### Design Principle

**One source of truth per setting. Environment variables seed the database on first run. After that, the database is always authoritative.**

This resolves the three drift scenarios identified in Steps 3 and 4.

---

### Configuration Categories and Sources of Truth

#### Scheduler Settings

| Setting | Target Source of Truth | First-Run Seeding |
|---------|----------------------|-------------------|
| `check_interval_hours` | **Database** (`settings` table) | Seeded from `CHECK_INTERVAL_HOURS` env var if DB key is absent |
| Scheduler next run | In-memory (APScheduler state) | Always `datetime.now()` on startup |

**Target behavior:**
- On `start_scheduler()`: read `Settings.get("check_interval_hours", os.getenv("CHECK_INTERVAL_HOURS", "6"))`. If the DB key is absent, read from env and write it to the DB. After first run, the env var is never read again.
- The `CHECK_INTERVAL_HOURS` env var is a one-time seed, not a persistent override.
- `reschedule_interval()` writes to DB and updates the live scheduler in one atomic operation.
- On restart: the scheduler reads from DB. The value is always current.
- **Result:** No drift possible. DB is always authoritative.

---

#### Notification Credentials (Telegram, Webhook)

| Setting | Target Source of Truth | First-Run Seeding |
|---------|----------------------|-------------------|
| `telegram_token` | **Database** (`settings` table) | Seeded from `TELEGRAM_TOKEN` env var if DB key is absent or empty |
| `telegram_chat_id` | **Database** (`settings` table) | Seeded from `TELEGRAM_CHAT_ID` env var if DB key is absent or empty |
| `webhook_url` | **Database** only | Not seeded from env |
| `GITHUB_TOKEN` | **Environment variable** | N/A — not a user-managed setting, not stored in DB |
| `GITLAB_TOKEN` | **Environment variable** | N/A — same |
| `GITEA_TOKEN` | **Environment variable** | N/A — same |

**Rationale for split:** Registry tokens (`GITHUB_TOKEN`, `GITLAB_TOKEN`, `GITEA_TOKEN`) are deployment credentials managed by the host operator. They belong in environment variables and are not user-configurable via the UI. Telegram/webhook credentials are user-configurable via the UI and belong in the database.

**First-run seeding mechanism:** On startup, `app.py` checks whether `telegram_token` and `telegram_chat_id` exist in the database. If absent or empty string, it reads from env and seeds the DB. Subsequent restarts find the DB key already populated and skip the seed. The env vars in `docker-compose.yml` remain as a convenience for initial setup.

---

#### Security Settings

| Setting | Source of Truth | Behavior |
|---------|----------------|---------|
| `SECURE_COOKIES` | Environment variable | Read at startup, written to Flask config. No DB equivalent. |
| `SESSION_LIFETIME_HOURS` | Environment variable | Read at startup, written to Flask config. No DB equivalent. |
| `ALLOWED_ORIGIN` | Environment variable | Read at startup, written to CORS config. No DB equivalent. |
| `SECRET_KEY` | `/data/.secret_key` file | Generated once, persisted to file. Never changes after first run. |

**Rationale:** Security settings are deployment-level configuration that a self-hosted operator manages. They are not user-configurable via the UI. Environment variables are the correct mechanism. No DB involvement.

**Documentation fix:** The `.env.example` comment for `SESSION_LIFETIME_HOURS` must be corrected to say "absolute session lifetime (not idle timeout)". This is a documentation fix, not a code change.

---

#### Host-level Settings (Agent Tokens)

| Data | Target Source of Truth | Notes |
|------|----------------------|-------|
| Agent runtime token | **Database** (`settings.host_{id}_token`, AES-256-GCM encrypted) | Only representation. `Host.token_hash` removed. |
| Agent cert fingerprint | **Database** (`hosts.cert_fingerprint`) | Written by provisioning, read by fingerprint UI |
| TLS enabled flag | **Database** (`hosts.tls_enabled`) | Written by `confirm-tls` endpoint |

**Resolves:** The dual-representation of agent tokens (CC-21, RISK-11). After removing `Host.token_hash`, there is exactly one place an agent token exists.

---

#### Application Appearance Settings

| Setting | Source of Truth | Notes |
|---------|----------------|-------|
| `app_name`, `app_logo`, `app_accent`, `custom_css` | **Database** only | No env var equivalents. User-managed via UI. |

---

### Configuration Drift Prevention

The three drift scenarios from Step 4 are resolved:

| Drift Scenario | Current behavior | Target behavior |
|---------------|-----------------|-----------------|
| `check_interval_hours` | Env var wins on restart, DB change lost | DB is authoritative; env var seeds once |
| Telegram credentials | Scheduler reads DB only; env var has no effect | Env var seeds DB on first run; DB is authoritative |
| Agent token dual representation | Two representations diverge | Single representation in DB |

---

## Report 5 — Scheduler Architecture

### Current Problems

1. `scheduler.py` is 877 lines handling 10 concerns.
2. The job function `run_version_checks()` directly contains registry fetching, version comparison, status calculation, notification dispatch, and scan summary — all in one function.
3. Routes import private scheduler functions (`_check_one`, `_send_webhook`).
4. `start_scheduler()` reads from env var instead of DB, creating drift.

---

### Target Scheduler Boundaries

#### What the Scheduler Owns

The scheduler owns only:
1. APScheduler lifecycle: `start_scheduler()`, `get_scheduler_status()`, `reschedule_interval()`
2. The job function `run_version_checks()` as a thin orchestrator
3. Module-level status globals: `_last_run_at`, `_last_run_ok`, `_last_run_finished_at`

#### What the Scheduler Delegates

| Responsibility | Target owner |
|--------------|-------------|
| Registry fetching | `services/version_checker.py` |
| Version comparison and status | `services/version_checker.py` |
| Individual app check | `services/version_checker.check_one()` |
| Notification decision | `services/notifications.should_notify()` |
| Notification dispatch (immediate) | `services/notifications.dispatch_notifications()` |
| Digest sending | `services/notifications.maybe_send_digest()` |
| Scan summary | `services/notifications.send_scan_summary()` |

#### Target `run_version_checks()` Flow

```python
def run_version_checks(flask_app, app_ids=None):
    global _last_run_at, _last_run_ok, _last_run_finished_at
    _last_run_at = now()

    with flask_app.app_context():
        all_ids = app_ids or [a.id for a in TrackedApp.query.all()]

    if not all_ids:
        _last_run_ok = True
        _last_run_finished_at = now()
        return

    errors, notify_list = 0, []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(version_checker.check_one, aid, flask_app): aid
                   for aid in all_ids}
        for future in as_completed(futures):
            result = future.result()
            if result and not result["ok"]:
                errors += 1
            elif result and result.get("notify"):
                notify_list.append(result)

    with flask_app.app_context():
        notifications.dispatch_notifications(notify_list, flask_app)
        notifications.maybe_send_digest(flask_app)
        notifications.send_scan_summary(flask_app)

    _last_run_ok = errors == 0
    _last_run_finished_at = now()
```

**Target size:** ~80 lines.

---

#### `start_scheduler()` Change

```python
def start_scheduler(flask_app):
    global _scheduler
    # Read from DB (authoritative), with env var as fallback for first run
    with flask_app.app_context():
        hours = int(Settings.get("check_interval_hours") or
                    os.getenv("CHECK_INTERVAL_HOURS", "6"))
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(run_version_checks, args=[flask_app],
                       trigger="interval", hours=hours,
                       id="version_check", replace_existing=True)
    _scheduler.start()
```

**Note:** This does NOT require a config-seeding call at startup for `check_interval_hours` if the DB already has a value. The seeding of env-var values into the DB (for telegram, check interval) is handled by a separate `_seed_config_from_env(flask_app)` call in `app.py` that runs before the scheduler starts.

---

#### Responsibilities that Stay Together

Version fetching and version comparison must remain together in `version_checker.py`. They are tightly coupled: the fetcher returns raw tags, and the comparison logic (`_semver_key`, `_smart_gte`, `_is_version_tag`) immediately processes them. Separating these would require passing complex intermediate state between modules.

#### Responsibilities that Should Separate

Notification delivery must separate from version checking. Currently, `run_version_checks()` both checks versions and sends notifications. If notification delivery fails (Telegram API down), it should not affect version check completion or status. The separation makes each independently testable.

---

## Report 6 — Notification Architecture

### Current Problems

1. Notification logic spans `scheduler.py` and `routes/hosts.py`.
2. `CH_LABELS` is defined twice.
3. Scan summary is implemented twice (scheduler inline + dead endpoint).
4. The dead `POST /api/scan-summary` endpoint exists but is never called.
5. `_send_webhook` is a private scheduler function called from a route.

---

### Target Notification Model

#### Single Module: `services/notifications.py`

All notification delivery lives in one module. No notification logic in `routes/`.

---

#### Notification Types and Owners

| Type | Trigger | Target owner | Current owner |
|------|---------|-------------|--------------|
| Per-app update available (immediate) | App becomes `outdated`, `notify` flag set | `notifications.dispatch_notifications()` | Inline in `run_version_checks()` |
| Digest | Scheduled digest time reached | `notifications.maybe_send_digest()` | Inline in `run_version_checks()` |
| Scan summary | End of every check run | `notifications.send_scan_summary()` | Inline in `run_version_checks()` (canonical) + dead `POST /api/scan-summary` (removed) |
| Update/revert action | After agent update or revert completes | `notifications.notify_update()` | `routes/hosts._notify_action()` |
| Test notification | User presses "Test" in settings | `notifications.send_telegram()` directly | `routes/settings.test_telegram()` (unchanged, calls send_telegram) |

---

#### `CH_LABELS` — Single Definition

```python
# services/notifications.py
CH_LABELS = {
    "dockerhub": "Docker Hub",
    "github":    "GitHub Releases",
    "gitlab":    "GitLab",
    "gitea":     "Gitea/Forgejo",
    "quay":      "Quay.io",
    "lscr":      "LinuxServer (lscr.io)",
    "unknown":   "Registry",
}
```

This is the single definition. All template rendering and inline message construction import from here. The duplicate in `scheduler.py` (CC-19) is removed.

---

#### Extension Points for Future Channels

Adding a new notification channel (e.g., ntfy, Pushover, Matrix) requires:
1. Add a `send_{channel}()` function to `notifications.py`
2. Add the channel's settings keys to `settings_route.py`
3. Update `dispatch_notifications()` to check for the new channel's credentials
4. No changes to `scheduler.py`, `routes/`, or any other module

This is the correct extension point because notification logic is isolated.

---

#### Removing the Dead Endpoint

`POST /api/scan-summary` in `routes/settings.py` is removed. The scan summary notification is sent exclusively by `notifications.send_scan_summary()` which is called by the scheduler. There is no need for an HTTP endpoint to trigger it because the frontend has no UI to call it.

---

## Report 7 — Data Ownership Architecture

### Ownership Model

Each data entity has exactly one authoritative writer. All other modules are readers.

---

#### `TrackedApp` — Authoritative Writers and Readers

| Field group | Authoritative writer | Readers |
|------------|---------------------|---------|
| `image`, `name`, `version`, `category`, `notes`, etc. — user-set fields | `routes/apps.py` | Frontend via `GET /api/apps` |
| `latest_version`, `status`, `last_checked_at`, `last_successful_check`, `detection_channel`, `last_error`, `version_history` — check-result fields | `services/version_checker.py` | Frontend (display), `services/notifications.py` (notify decision) |
| `version` after update | `services/update_executor.py` (updates it after successful compose rewrite) | Frontend |
| `host_id`, `install_path`, `service_name`, `auto_update` | `routes/apps.py` | `services/update_executor.py` (reads for update) |

**Resolution of ambiguity:** The `version` field is written by two current modules — `routes/apps.py` (user-edited version) and `routes/hosts.py` (after update execution). In the target, the update executor's version write moves to `services/update_executor.py`, making the distinction explicit: `apps.py` writes `version` in response to user edits; `update_executor` writes `version` after a successful automated update.

---

#### `Host` — Authoritative Writers and Readers

| Field group | Authoritative writer | Readers |
|------------|---------------------|---------|
| `name`, `ip`, `port`, `allowed_base` | `routes/hosts.py` | Frontend |
| `tls_enabled`, `cert_fingerprint` | `routes/hosts.py` (provisioning flow) | `services/update_executor.py` (to build TLS context) |
| `last_seen`, `status` | `services/update_executor.py` (after agent contact) | Frontend |
| `token_hash` | **Removed in target** | — |

---

#### `Settings` — Authoritative Writers and Readers

| Key group | Authoritative writer | Readers |
|-----------|---------------------|---------|
| All user-configurable settings | `routes/settings.py` | `scheduler.py`, `services/notifications.py`, `services/version_checker.py` |
| `host_{id}_token` | `routes/hosts.py` (token store/delete) | `services/update_executor.py` (token retrieval) |
| `last_digest_sent` | `services/notifications.py` | `services/notifications.py` |
| `check_interval_hours` | `routes/settings.py` (UI save) and `app.py` (first-run seed) | `scheduler.py` (on startup) |

---

#### `UpdateLog` — Authoritative Writers and Readers

| Writer | Reader |
|--------|--------|
| `services/update_executor.py` exclusively | `routes/hosts.py` (exposes `GET /api/apps/<id>/logs`) |

**Current ambiguity resolved:** `_log_update()` is currently in `routes/hosts.py` but called from within update execution logic. In the target, `update_executor.py` owns `_log_update()` because it owns the update execution that produces the log entries.

---

#### `User` — Authoritative Writer and Readers

| Writer | Reader |
|--------|--------|
| `routes/auth.py` exclusively | `utils.current_user()`, any route that calls `require_auth()` |

---

#### `InstallToken` — Authoritative Writer and Readers

| Writer | Reader |
|--------|--------|
| `routes/hosts.py` (generate, expire unused) | `routes/hosts.py` (agent_provision endpoint) |

No change from current ownership.

---

#### Certificates — Authoritative Writers and Readers

| Data | Owner | Location |
|------|-------|---------|
| CA private key | `ca.py` exclusively | `/data/vigil-ca.key` |
| Vigil client cert/key | `ca.py` exclusively | `/data/vigil-client.crt`, `/data/vigil-client.key` |
| Agent cert (ephemeral) | `ca.py` issues, never stored | Encrypted package only |
| Agent cert fingerprint | `ca.py` computes, `routes/hosts.py` stores | `hosts.cert_fingerprint` |

---

#### Frontend State Ownership (Summary)

| State | Owner | Type |
|-------|-------|------|
| `currentUser`, `authState` | `AuthContext` | Global context |
| `apps`, `categories`, `hosts` | `AppDataContext` | Global context |
| `settings` | `useSettings` hook | Per-component (SettingsPage) |
| `schedulerStatus` | `useScheduler` hook | App.jsx |
| `modal`, `activeApp` | `App.jsx` | Layout-level |
| `viewMode`, `sortMode`, `filterCat`, `search` | `DashboardPage` | Page-level |
| `overData` (15 edit fields) | `AppEditModal` | Component-level |
| Wizard state (10 fields) | `ProvisionWizard` | Component-level |
| Toast | `useToast` hook or `App.jsx` | Global |

---

## Report 8 — Legacy Compatibility Strategy

### Legacy Artifacts from Step 4 Report 7

---

#### CC-22 — `plain:` token prefix (pre-AES compatibility)

**Artifact:** `if stored.startswith("plain:"): return stored[6:]` in `_decrypt_token`  
**Decision: Retain with documentation**  
**Rationale:** This is a valid backward-compatibility path for installations that were created before AES encryption was added. Removing it would silently break any install that has a `plain:` token in the database. The correct approach is to document the migration path: on next `regenerate-token` operation, the token is rewritten as `enc1:`. No forced migration needed. Add a log warning when a `plain:` token is encountered so users know they have a token that needs regeneration.

---

#### CC-23 — Bare-string token (pre-`plain:` prefix era)

**Artifact:** `if not stored.startswith("enc1:"): return stored` in `_decrypt_token`  
**Decision: Retain with documentation**  
**Rationale:** Same logic as CC-22. This covers even older installs. The path is harmless and the warning log is sufficient. If `enc1:` and `plain:` formats are never produced by new code, the bare-string path will naturally become unreachable as tokens are regenerated.

---

#### CC-24 — SHA-256 backup code hashes

**Artifact:** `else: matched = (_hashlib.sha256(...) == h)` in `_verify_backup_code`  
**Decision: Retain with documentation**  
**Rationale:** Backup codes are one-time-use. An existing installation may have backup codes stored as SHA-256. Removing this path would invalidate those codes, locking users out if they need recovery. The path is exercised only when a code matches the legacy format — it is not on the hot path. Retain indefinitely; it costs essentially nothing.

---

#### CC-25 — `categories.py:_DEFAULT_CATEGORIES` (7-entry vs. 15-entry divergence)

**Artifact:** `_DEFAULT_CATEGORIES` in `categories.py` seeds only 7 categories; `migrations.py:DEFAULT_CATEGORIES` seeds 15.  
**Decision: Deprecate and consolidate**  
**Rationale:** New installs on v18+ receive all 15 categories from the migration runner. The 7-entry `_DEFAULT_CATEGORIES` in `ensure_default_categories()` is a legacy of the original design. The target is to replace both with a single authoritative list. However, this touches both `categories.py` and `migrations.py` — it is a refactor task, not an emergency. Classify as a planned cleanup in the next implementation phase.  
**Target state:** `categories.py:_DEFAULT_CATEGORIES` is replaced with an import from `migrations.DEFAULT_CATEGORIES` or a shared constants file. Both use the same 15-entry list.

---

#### CC-28 — `Host.token_hash` column

**Artifact:** `host.token_hash` column (bcrypt hash written but never read in auth)  
**Decision: Deprecate (schema migration required)**  
**Rationale:** The column is dead. The AES-encrypted token in `settings` is the authoritative representation. However, removing a database column requires a migration and must not break existing installs. The plan:
1. Stop writing `token_hash` in new code (in this stabilization phase)
2. Add a migration (v19) that drops the column when appropriate

The column is made nullable as a first step (migration v19) — no data is deleted yet — then dropped in a future migration (v20) after confirming no path reads it.

---

#### Summary Table

| ID | Artifact | Decision | Rationale |
|----|---------|---------|-----------|
| CC-22 | `plain:` token prefix | **Retain** | Valid backward compat; add log warning |
| CC-23 | Bare-string token | **Retain** | Valid backward compat; add log warning |
| CC-24 | SHA-256 backup codes | **Retain indefinitely** | One-time-use; harmless; users may need it |
| CC-25 | 7-entry `_DEFAULT_CATEGORIES` | **Deprecate** → consolidate to 15-entry | Planned cleanup |
| CC-28 | `Host.token_hash` | **Deprecate** → migration v19/v20 | Dead field; remove via schema migration |

---

## Report 9 — Refactor Domains

### Domain 1 — Dead Code Removal

**Scope:** Remove confirmed dead code with no behavior change.  
**Items:** CC-01 through CC-10 (dead functions, dead package, dead route).  
**Dependencies:** None. These changes are pure removals.  
**Estimated risk:** **Low.** Removing dead code cannot break working functionality by definition. The only risk is an incorrect classification in Step 4. Each item should be verified with a final grep before removal.

**Specific changes:**
- Remove `utils.norm`, `utils.sort_key`, `utils.derive_status`, `utils.parse_image_name`, `utils.parse_compose_images`
- Remove `Host.check_token()` method from `models.py`
- Remove `_check_token()` function from `routes/hosts.py`
- Remove `decrypt_cert_package()` from `ca.py`
- Remove `scan_summary()` route and `POST /api/scan-summary` from `routes/settings.py`
- Remove `flask-session` from `requirements.txt`

---

### Domain 2 — Utility Consolidation

**Scope:** Eliminate duplicated utility functions; establish `utils.py` as canonical.  
**Items:** CC-12 through CC-18 (duplicate norm, sort_key, derive_status, parse_image_name, parse_compose_images, CH_LABELS, scan_summary).  
**Dependencies:** Domain 1 must complete first (so dead `utils.py` functions are removed before canonical versions are established).  
**Estimated risk:** **Low.** The canonical implementations are behaviorally richer than the private copies. The only risk is a behavioral divergence in edge cases (e.g., `utils.norm` lowercases; `apps._norm` does not). Each canonical function must be verified to handle all cases that the private copies handled.

**Specific changes:**
- Update `utils.py` functions to combine behaviors of both versions
- Remove private `_norm`, `_sort_key`, `_derive_status`, `_parse_image_name`, `_parse_compose_images` from `routes/apps.py`; import from `utils.py` instead
- Replace inline `_norm` lambda in `scheduler.py` with import from `utils`
- Extract `CH_LABELS` to `config.py` or `services/notifications.py`; remove the second definition

---

### Domain 3 — Configuration Deduplication

**Scope:** Establish single sources of truth for `check_interval_hours` and Telegram credentials.  
**Items:** CC-20 through CC-23 (dual-source configs, agent token dual representation).  
**Dependencies:** Domain 1 (for clean codebase baseline).  
**Estimated risk:** **Medium.** Changes to configuration behavior can affect users who rely on env-var overrides on restart. The seeding mechanism must be implemented carefully: the first-run detection (is the DB key absent?) must be correct to avoid overwriting user-configured values.

**Specific changes:**
- Add `_seed_config_from_env(flask_app)` to `app.py` startup
- Change `start_scheduler()` to read from DB instead of env var
- Stop writing `Host.token_hash` in `create_host()` and `regenerate_token()`
- Add migration v19 making `Host.token_hash` nullable

---

### Domain 4 — Scheduler Decomposition

**Scope:** Extract `services/version_checker.py` and `services/notifications.py` from `scheduler.py`.  
**Dependencies:** Domains 1 and 2 must complete first (clean utility layer).  
**Estimated risk:** **Medium.** This is a structural change with many moving parts. The logic itself does not change — only its location. The main risk is breaking the import chain or accidentally changing the execution order. Test coverage (even manual) of the notification path after this change is important.

**Specific changes:**
- Create `services/version_checker.py` with all registry fetchers and `check_one()`
- Create `services/notifications.py` with all notification functions
- Update `scheduler.py` to import from services and reduce to ~80 lines
- Update `routes/apps.py` to import `version_checker.check_one` instead of `scheduler._check_one`
- Update `routes/hosts.py` to import `notifications.notify_update` instead of `scheduler._send_webhook`

---

### Domain 5 — Backend Route Thinning

**Scope:** Extract `services/update_executor.py` from `routes/hosts.py`.  
**Dependencies:** Domain 4 (notifications service must exist for update_executor to call it).  
**Estimated risk:** **Medium.** `routes/hosts.py` is the most complex file in the codebase (760 lines, 11 concerns). The extraction must preserve the behavior of the update/revert flow exactly, including error handling, backup path recording, and host status updates.

**Specific changes:**
- Create `services/update_executor.py`
- Move `_agent_request`, `_agent_health`, `_agent_url`, `_tls_context`, `trigger_update`, `revert_update` logic into it
- Move `_log_update` into `update_executor.py` (it owns the log writes)
- `routes/hosts.py` route handlers call `update_executor.execute_update()` and `update_executor.execute_revert()`

---

### Domain 6 — Frontend Decomposition

**Scope:** Split `App.jsx` into pages, components, hooks, and context.  
**Dependencies:** None (frontend is independent of backend changes).  
**Estimated risk:** **High.** This is the largest single change in the stabilization program. 4,515 lines of interleaved state, JSX, and callbacks must be reorganized without changing visible behavior. The hooks ordering problem that caused the black-screen bug means extreme care is needed when moving components that contain hooks. A component-by-component extraction strategy (smallest and most isolated components first) minimizes risk.

**Extraction order (lowest to highest risk):**
1. Pure utility functions to `utils/` (no React, no state)
2. `constants.js` (CHANNEL_META, DEFAULT_LOGO, CSS_TEMPLATE)
3. Leaf components with no hooks: `Tooltip`, `ChannelPill`, `AppIcon`, `Toast`
4. `CardMenu` (has hooks — must become top-level component, not nested)
5. `useToast`, `useScheduler`, `useApi` hooks
6. `AuthContext` (well-isolated, small surface)
7. `AppEditModal` (owns `overData` state)
8. `ProvisionWizard` (owns wizard state)
9. `AppDataContext` (shared data layer)
10. `DashboardPage`, `SettingsPage`, `HistoryPage`
11. `App.jsx` final reduction

---

### Domain 7 — Documentation and Minor Fixes

**Scope:** Documentation fixes and small standalone corrections.  
**Dependencies:** None (can be done in any order).  
**Estimated risk:** **Negligible.**

**Specific changes:**
- Add `GITEA_TOKEN` to `.env.example`
- Fix `SESSION_LIFETIME_HOURS` comment to say "absolute session lifetime"
- Bump `package.json` version to `2.3.0`
- Add `config.py` string constants for session key names and Settings key names
- Add `bookstack` to only one category (remove duplicate keyword)

---

## Report 10 — Target Architecture Blueprint

### High-Level Structure

```
┌─────────────────────────────────────────────────────────┐
│                        nginx                            │
│            Reverse proxy + security headers             │
└──────────────────┬──────────────────┬───────────────────┘
                   │                  │
        ┌──────────▼──────┐  ┌────────▼─────────────────┐
        │    frontend     │  │       backend             │
        │   nginx + SPA   │  │  gunicorn (1w, 4t, 300s)  │
        │                 │  │                           │
        │ App.jsx         │  │ ┌─────────────────────┐   │
        │ pages/          │  │ │    Flask API         │   │
        │ components/     │  │ │    routes/           │   │
        │ context/        │  │ │    auth  apps        │   │
        │ hooks/          │  │ │    hosts settings    │   │
        │ api.js          │  │ └──────────┬──────────┘   │
        │ constants.js    │  │            │               │
        └─────────────────┘  │ ┌──────────▼──────────┐   │
                             │ │    services/         │   │
                             │ │ version_checker      │   │
                             │ │ notifications        │   │
                             │ │ update_executor      │   │
                             │ └──────────┬──────────┘   │
                             │            │               │
                             │ ┌──────────▼──────────┐   │
                             │ │    scheduler.py      │   │
                             │ │ (orchestrator only)  │   │
                             │ └──────────┬──────────┘   │
                             │            │               │
                             │ ┌──────────▼──────────┐   │
                             │ │    SQLite DB         │   │
                             │ │   /data/tracker.db   │   │
                             │ └─────────────────────┘   │
                             └──────────────────────────┘
```

---

### Backend Module Ownership

```
app.py              → wiring only
config.py           → constants (LEN, string constants, CH_LABELS)
models.py           → ORM models
migrations.py       → schema versioning
utils.py            → canonical shared utilities
auth.py             → (if extracted) TOTP logic, backup codes
ca.py               → TLS certificates
categories.py       → auto-categorization

services/
  version_checker.py  → registry fetching, version comparison
  notifications.py    → Telegram, webhook, digest, scan summary
  update_executor.py  → agent communication, compose patching

scheduler.py        → APScheduler lifecycle + job orchestration

routes/
  auth.py           → auth HTTP endpoints
  apps.py           → app+category HTTP endpoints
  hosts.py          → host+provisioning HTTP endpoints
  settings.py       → settings HTTP endpoints + file serving
```

---

### Dependency Direction

Dependencies flow in one direction only:

```
routes/*
    ↓
services/*
    ↓
models.py + ca.py + utils.py + config.py
    ↓
SQLite
```

```
scheduler.py
    ↓
services/*
    ↓
models.py + config.py
```

**Prohibited dependencies:**
- `routes/*` must not import from `scheduler.py` directly (use `services/*`)
- `services/*` must not import from `routes/*`
- `scheduler.py` must not import from `routes/*`
- `models.py` must not import from any application module

---

### Source of Truth Summary

| Data | Source of Truth | Location |
|------|----------------|---------|
| Check interval | Database | `settings.check_interval_hours` |
| Telegram credentials | Database | `settings.telegram_token`, `settings.telegram_chat_id` |
| Registry tokens | Environment | `GITHUB_TOKEN`, `GITLAB_TOKEN`, `GITEA_TOKEN` |
| Agent runtime token | Database (AES) | `settings.host_{id}_token` |
| CA key | Filesystem | `/data/vigil-ca.key` |
| Flask secret key | Filesystem | `/data/.secret_key` |
| Session user key name | `config.SESSION_KEY_USER_ID` | Constant |
| Settings KV key names | `config.SETTINGS_*` | Constants |
| Channel labels | `config.CH_LABELS` | Single definition |

---

### Ownership Model (One-Page View)

| Entity | Authoritative Writer | Readers |
|--------|---------------------|---------|
| `TrackedApp` user fields | `routes/apps.py` | Frontend |
| `TrackedApp` check fields | `services/version_checker` | Frontend, notifications |
| `TrackedApp` version after update | `services/update_executor` | Frontend |
| `Host` CRUD fields | `routes/hosts.py` | Frontend, update_executor |
| `Host` last_seen, status | `services/update_executor` | Frontend |
| `Host` tls, fingerprint | `routes/hosts.py` provisioning | update_executor |
| `Settings` (user-configurable) | `routes/settings.py` | scheduler, notifications, version_checker |
| `Settings` (host tokens) | `routes/hosts.py` | update_executor |
| `Settings` (last_digest_sent) | `services/notifications` | notifications |
| `UpdateLog` | `services/update_executor` | `routes/hosts.py` (read only) |
| `User` | `routes/auth.py` | `utils.current_user()` |
| `InstallToken` | `routes/hosts.py` | `routes/hosts.py` (agent_provision) |
| Certificates (filesystem) | `ca.py` | `routes/hosts.py` (tls_context) |

---

### Module Boundaries (File Size Targets)

| Module | Current lines | Target lines | Change |
|--------|--------------|-------------|--------|
| `scheduler.py` | 877 | ~80 | Decomposed into services |
| `routes/hosts.py` | 760 | ~350 | update_executor extracted |
| `routes/apps.py` | 463 | ~380 | Private utils removed |
| `services/version_checker.py` | (new) | ~380 | From scheduler.py |
| `services/notifications.py` | (new) | ~200 | From scheduler.py + hosts.py |
| `services/update_executor.py` | (new) | ~230 | From hosts.py |
| `utils.py` | 143 | ~140 | Dead functions removed, canonical versions retained |
| `frontend/src/App.jsx` | 4,515 | ~150 | Decomposed into pages/components/hooks |
| `frontend/src/pages/` (4 files) | (new) | ~1,200 total | From App.jsx |
| `frontend/src/components/` (~15 files) | (new) | ~2,400 total | From App.jsx |
| `frontend/src/context/` (2 files) | (new) | ~200 total | From App.jsx |
| `frontend/src/hooks/` (4 files) | (new) | ~200 total | From App.jsx |

---

### Implementation Sequencing (Step 6 Input)

Domains are sequenced by dependency and risk:

| Phase | Domain | Risk |
|-------|--------|------|
| 1 | Domain 7: Documentation fixes | Negligible |
| 2 | Domain 1: Dead code removal | Low |
| 3 | Domain 2: Utility consolidation | Low |
| 4 | Domain 3: Configuration deduplication | Medium |
| 5 | Domain 4: Scheduler decomposition | Medium |
| 6 | Domain 5: Backend route thinning | Medium |
| 7 | Domain 6: Frontend decomposition | High |

Phases 1–3 can be done in a single session. Phases 4–6 are a second session. Phase 7 (frontend) is a standalone multi-session effort because of its size and risk.
