# Vigil — Dead Code & Redundancy Analysis
**Version:** v2.3
**Step:** 4 of the Architecture Stabilization Program
**Scope:** Analysis only. No code was modified.

---

## Report 1 — Unused Imports

### Backend

No **definitely unused** Python imports were found in source files. All imports in `app.py`, `routes/`, `scheduler.py`, `ca.py`, `utils.py`, `models.py`, and `categories.py` are referenced within their respective modules.

**Finding — `flask-session` package (in `requirements.txt`)**

This is a package-level dead dependency rather than a source-level unused import. Zero occurrences of `flask_session`, `FlaskSession`, or `from flask_session` appear in any `.py` file. The package is installed into the Docker image and never imported.

- **File:** `requirements.txt`
- **Import:** `flask-session==0.8.0`
- **Evidence:** `grep -rn "flask_session"` returns zero results across all `.py` files
- **Classification: Definitely Unused**

### Frontend (`App.jsx`)

All named imports are used:

- `useState` (110 occurrences), `useEffect` (18), `useCallback` (11), `useRef` (23), `useMemo` (1 — via `React.useMemo` at line 174) — all used
- `createPortal` from `react-dom` — used at lines 146, 2354, 2392

**No definitely unused imports found in App.jsx.** `useMemo` is used exactly once via the `React.useMemo` form rather than the destructured form — stylistic inconsistency, not dead code.

---

## Report 2 — Unused Functions

### `utils.py` — Public Functions With No External Callers

All five of the following are exported (no underscore prefix) but are never imported or called by any other module.

---

#### `norm(s)` — `utils.py:91`

- **Purpose:** Lowercase, strip leading `v`, collapse whitespace from a version string
- **Call sites:** Only called internally by `sort_key()` and `derive_status()` within `utils.py`; zero imports from other modules
- **Evidence:** `grep -rn "from utils import.*norm\|utils\.norm\b"` → zero results outside `utils.py`
- **Classification: Definitely Dead**

---

#### `sort_key(s)` — `utils.py:98`

- **Purpose:** Parse a version string into a sortable tuple
- **Call sites:** Only called internally by `derive_status()` within `utils.py`; zero external callers
- **Evidence:** `grep -rn "sort_key"` outside `utils.py` → zero results
- **Classification: Definitely Dead**

---

#### `derive_status(version, latest)` — `utils.py:111`

- **Purpose:** Return `unknown` / `up-to-date` / `outdated` from two version strings
- **Call sites:** Zero. A richer local version `_derive_status` exists in `routes/apps.py` and is used there.
- **Evidence:** `grep -rn "derive_status"` outside `utils.py` → zero results
- **Classification: Definitely Dead**

---

#### `parse_image_name(image)` — `utils.py:120`

- **Purpose:** Extract bare name from a Docker image string
- **Call sites:** Zero. A local `_parse_image_name` with additional logic exists in `routes/apps.py` and is used there.
- **Evidence:** `grep -rn "parse_image_name"` → defined in `utils.py` and `apps.py`; `apps.py` uses only its own private version
- **Classification: Definitely Dead**

---

#### `parse_compose_images(content)` — `utils.py:127`

- **Purpose:** Extract image strings from a docker-compose YAML
- **Call sites:** Zero. A local `_parse_compose_images` with additional fields exists in `routes/apps.py` and is used there.
- **Evidence:** `grep -rn "parse_compose_images"` → defined in both files; `apps.py` calls only its own private version
- **Classification: Definitely Dead**

---

### `models.py` — Methods With No Production Call Sites

#### `Host.check_token(token)` — `models.py:166`

- **Purpose:** bcrypt-verify a token against `host.token_hash`
- **Call sites:** Zero production calls. `InstallToken.check_token()` IS called (line 696 in `hosts.py`) but `Host.check_token()` is never called anywhere.
- **Evidence:** `grep -rn "\.check_token"` → only `InstallToken.check_token` appears; `Host.check_token` has no call sites
- **Note:** The actual agent authentication path uses `_get_token()` (AES-256-GCM decryption from Settings table), not bcrypt verification against `Host.token_hash`.
- **Classification: Definitely Dead**

---

### `ca.py` — Backend Function That Belongs to Agent Side

#### `decrypt_cert_package(blob, dec_key_raw)` — `ca.py:291`

- **Purpose:** Decrypt a certificate package created by `encrypt_cert_package`
- **Call sites:** Referenced in a docstring comment at `hosts.py:672` but never called as a function anywhere in the backend
- **Evidence:** `grep -rn "decrypt_cert_package"` → only definition in `ca.py` and one comment reference in `hosts.py`
- **Note:** The actual decryption runs on the agent side, implemented as inline Python in `agent/install.sh`. The backend never needs to decrypt — it only encrypts.
- **Classification: Definitely Dead**

---

### `routes/hosts.py` — Internal Function Never Called

#### `_check_token(plain, hashed)` — `hosts.py:50`

- **Purpose:** Wraps `bcrypt.checkpw` for token comparison
- **Call sites:** Zero. Defined but never invoked anywhere.
- **Evidence:** `grep -n "_check_token" hosts.py` → definition only; zero call sites
- **Note:** The function `Host.check_token()` in `models.py` performs the same operation and is also never called. Both are vestigial from a pre-AES token design.
- **Classification: Definitely Dead**

---

### `routes/settings.py` — Endpoint Never Invoked

#### `scan_summary()` — `settings.py:141` (`POST /api/scan-summary`)

- **Purpose:** Send a Telegram scan-summary message on demand
- **Call sites:** Not called by the scheduler. Not called by the frontend. Not called by any other backend code.
- **Evidence:**
  - `grep -rn "scan.summary\|scan_summary"` in frontend → zero `POST` calls
  - `scheduler.py:826-842` implements identical logic inline within `run_version_checks()` and never calls this endpoint
- **Note:** The scheduler's inline implementation and this endpoint produce functionally equivalent messages, but with different timestamp formats.
- **Classification: Likely Dead** (route exists but is never invoked by any caller)

---

## Report 3 — Unused Models & Fields

### `TrackedApp` Model

---

#### `auto_update` — `tracked_apps.auto_update`

- **Written:** Yes — via `PATCH /api/apps/<id>` at `apps.py:288`; frontend sends `auto_update: overData.auto_update`
- **Read:** The field is included in `to_dict()` and returned to the frontend. However, the **scheduler never reads it**.
- **Evidence:** `grep -n "auto_update" scheduler.py` → zero results. The scheduler has no code path that reads `entry.auto_update` or triggers automated updates based on its value.
- **Frontend:** Shows a 4-option dropdown (off/ask/auto/silent). The `ask` and `off` options are checked client-side in `triggerUpdate()` at line 1958 before a manual update is allowed. The `auto` and `silent` options have no effect on any code path.
- **Classification: Written, Never Executed by scheduler (auto/silent modes are dead). ask/off are client-side enforced only.**

---

#### `container_id` — `tracked_apps.container_id`

- **Written:** Yes — via PATCH endpoint
- **Read:** Yes — returned in `to_dict()`; displayed in UI
- **Active:** Yes
- **Note:** Column comment `# e.g. "LXC 101" or "VM 105"` documents that this stores a human-readable infrastructure label, not a Docker container ID. The name is misleading (RISK-14).

---

### `Host` Model

---

#### `token_hash` — `hosts.token_hash`

- **Written:** Yes — `create_host()` line 275 and `regenerate_token()` line 356 both write a bcrypt hash here
- **Read:** The bcrypt hash is **never read in any authentication code path**
- **Evidence:**
  - `Host.check_token()` (the only method that reads `token_hash`) has zero call sites in production code
  - Actual agent authentication uses `_get_token(host_id)` which reads from the `Settings` table (AES-256-GCM encrypted), not from `host.token_hash`
- **Classification: Written but never read (vestigial)**

---

### `UpdateLog` Model

---

#### `triggered_by` values `"schedule"` and `"telegram"`

- **Written:** The field is always written as `"user"` (default) or the value from the request body `data.get("triggered_by", "user")`. The request body value is only ever sent as `"user"` from the frontend.
- **Schema declaration:** Model comment declares `# user/schedule/telegram` as valid values
- **Evidence:** `grep -n "triggered_by" scheduler.py` → zero results. The scheduler never calls `_log_update`. `grep -n "_log_update" hosts.py` → all four call sites pass `triggered_by` as `"user"` or the request-body default of `"user"`.
- **Classification: Two of three declared values (`"schedule"`, `"telegram"`) are never written**

---

### Settings KV Store — Active Fields

The following Settings keys are confirmed active (written and read): `telegram_token`, `telegram_chat_id`, `webhook_url`, `digest_mode`, `digest_time`, `digest_day`, `digest_interval_hours`, `digest_template`, `digest_timezone`, `check_interval_hours`, `custom_css`, `app_name`, `app_logo`, `app_accent`, `notify_template`, `scan_summary_notify`, `last_digest_sent`, `host_{id}_token`.

No unused Settings keys were found.

---

## Report 4 — Duplicate Logic Inventory

### DUP-01 — Version normalization (`norm` / strip-leading-v)

Three separate implementations of the same core operation:

| Location | Name | Logic | Active? |
|----------|------|-------|---------|
| `utils.py:91` | `norm(s)` | Lowercase + strip `v` + collapse whitespace | **No** (zero callers) |
| `routes/apps.py:88` | `_norm(s)` | Strip `v` only — `(s or "").lstrip("v")` | Yes (used in `_derive_status`) |
| `scheduler.py:648` | lambda `_norm` | Strip `v` only, `None`-safe — `s.lstrip("v") if s else s` | Yes (active version check path) |

**Authoritative path:** `scheduler.py` lambda is used in all production version comparisons. `apps._norm` is used only for the local status recalculation on manual version edit. `utils.norm` has no callers.

**Behavioral difference:** `utils.norm` additionally lowercases and collapses whitespace — more thorough but unused.

---

### DUP-02 — Version tuple parsing (`sort_key`)

Three implementations of progressively increasing sophistication:

| Location | Name | Logic |
|----------|------|-------|
| `utils.py:98` | `sort_key(s)` | `re.split(r"[.\-_]", norm(s))` → tries `int()`, falls back to string | **Zero callers** |
| `routes/apps.py:92` | `_sort_key(s)` | `(_norm(s) or "0").replace("-", ".").split(".")` → only integers, returns `(0,)` on failure | Active in `_derive_status` |
| `scheduler.py:82` | `_semver_key(tag)` | Handles channel prefixes (`nightly-0.8.9.15`), floating suffixes (`13.0-latest`), channel-build codes (`pr-5229`) | **Authoritative** |

**Authoritative path:** `scheduler._semver_key` is the production comparison engine.

---

### DUP-03 — Status string derivation (`derive_status`)

| Location | Name | Returns | Active? |
|----------|------|---------|---------|
| `utils.py:111` | `derive_status` | `unknown` / `up-to-date` / `outdated` | **No** (zero callers) |
| `routes/apps.py:96` | `_derive_status` | Adds `pinned` for floating tags; uses `_sort_key` for numeric comparison | Yes (PATCH /api/apps) |

**Behavioral difference:** `apps._derive_status` handles the `pinned` case and uses numeric comparison for `up-to-date` determination. `utils.derive_status` only does string equality.

---

### DUP-04 — Image name parsing (`parse_image_name`)

| Location | Name | Logic | Active? |
|----------|------|-------|---------|
| `utils.py:120` | `parse_image_name` | Last path segment, strip tag | **No** (zero callers) |
| `routes/apps.py:52` | `_parse_image_name` | Same, plus: if leaf is in `_GENERIC_NAMES`, uses parent segment | Yes |

**Behavioral difference:** `apps._parse_image_name` has the generic-name fallback that `utils.parse_image_name` lacks.

---

### DUP-05 — Compose file parsing (`parse_compose_images`)

| Location | Name | Returns | Active? |
|----------|------|---------|---------|
| `utils.py:127` | `parse_compose_images` | `[{"name": svc_name, "image": image}]` — does not split tag from image | **No** (zero callers) |
| `routes/apps.py:64` | `_parse_compose_images` | `[{"image": repo, "version": tag, "name": ...}]` — splits `image:tag` into separate fields | Yes |

**Behavioral difference:** `apps._parse_compose_images` splits the tag component and calls `_parse_image_name` for name derivation.

---

### DUP-06 — `CH_LABELS` defined twice in `scheduler.py`

| Location | Context |
|----------|---------|
| `scheduler.py:35` | Inside `_render_template()` — used when rendering custom notification templates |
| `scheduler.py:785` | Inside `run_version_checks()` — used for inline immediate notification message construction |

Both are identical dicts mapping channel keys to display strings. The second is a necessary copy because `_render_template` is a separate function with its own scope. Both **must be updated together** whenever a new channel is added — this is documented as a critical gotcha in `SESSION_MEMORY.md`.

**Evidence:** `grep -n "CH_LABELS" scheduler.py` → lines 35 and 785

---

### DUP-07 — Scan summary notification logic

| Location | Trigger | Implementation |
|----------|---------|---------------|
| `scheduler.py:826-842` (inline in `run_version_checks`) | After every scheduled version check when `scan_summary_notify == "on"` | Active |
| `routes/settings.py:141` (`POST /api/scan-summary`) | Never called | Dead endpoint |

Both produce identical Telegram messages. The timestamp format differs slightly: scheduler uses `datetime.now(...).strftime('%Y-%m-%d %H:%M UTC')`, while the endpoint uses `now_str()[:10]` (date only).

---

## Report 5 — Duplicate Configuration Paths

### CONFIG-01 — `CHECK_INTERVAL_HOURS`

**Sources:**

1. **Environment variable** `CHECK_INTERVAL_HOURS` — read by `scheduler.py:851` in `start_scheduler()` on every container start
2. **DB key** `check_interval_hours` in `Settings` table — written by `POST /api/settings` when user changes the interval in the UI; read by `GET /api/settings` for display; triggers `reschedule_interval()` which updates the live scheduler

**Actual behavior:**
- On startup: scheduler uses the env var value. The DB value is ignored.
- At runtime: when user changes the interval via UI, `reschedule_interval()` updates the live scheduler in-memory. The env var is not updated.
- On next restart: the env var value is used again. Any UI change is silently discarded.

**Result:** The two sources diverge permanently after the first UI modification. The DB value becomes the runtime truth; the env var becomes stale documentation.

---

### CONFIG-02 — `TELEGRAM_TOKEN` / `TELEGRAM_CHAT_ID`

**Sources:**

1. **Environment variables** in `docker-compose.yml` — present in deployment config, documented in `.env.example`
2. **DB keys** `telegram_token`, `telegram_chat_id` in `Settings` table — read by scheduler at `scheduler.py:780-781` via `Settings.get()`

**Actual behavior:**
- The scheduler exclusively reads from the DB. The env vars have no effect on runtime behavior.
- There is no startup code that syncs env var values into the DB.
- After the user sets credentials via the UI and they are stored in the DB, the env vars become stale.

**Note:** It is unclear whether the env vars were ever synced to the DB on initial setup. If the DB is empty on first start, the scheduler reads empty strings and no notifications fire until the user configures them via the UI.

---

### CONFIG-03 — Agent Token (dual representation)

**Sources:**

1. **`Host.token_hash`** — bcrypt hash of the agent token, written on `create_host()` and `regenerate_token()`
2. **`Settings` key `host_{id}_token`** — AES-256-GCM encrypted agent token, written by `_store_token()`

**Actual behavior:**
- `_get_token()` reads from `Settings` (AES path) — this is the only path used for authentication
- `Host.check_token()` reads from `host.token_hash` (bcrypt path) — this method is never called

**Result:** Two representations of the same secret exist. Only the AES representation is used. The bcrypt representation is written on every token creation/regeneration but never verified.

---

## Report 6 — UI Contract Analysis

### Fully Implemented Features

| Feature | Notes |
|---------|-------|
| Manual update trigger | `POST /api/apps/<id>/update` → agent `/write` → restart |
| Revert to backup | `POST /api/apps/<id>/revert/<log_id>` → agent `/revert` |
| Update history log | `GET /api/apps/<id>/logs`, `DELETE /api/apps/<id>/logs` |
| Notification policy (never/always/major_only) | `_should_notify()` enforces in scheduler |
| Version snooze | `snoozed_until` checked in `_should_notify()` |
| Version ignore | `ignored_version` checked in `_should_notify()` and digest |
| Digest notifications (daily/weekly/interval) | `_should_send_digest()` + `_build_digest()` |
| Scan summary notification | Scheduler inline; toggle stored in `scan_summary_notify` |
| TOTP 2FA | Full login flow with ±1 window, backup codes |
| Agent TLS provisioning wizard | 4-step: installer, install token, dec key, agent token |
| Fingerprint verification UI | `confirm-tls` endpoint; fingerprint stored on host |
| Category management | CRUD + auto-categorize on keyword change |
| Custom icon upload | `POST /api/apps/<id>/icon`; base64 stored |
| Icon CDN search | jsDelivr manifest fetched at runtime |
| Custom CSS | `settings.custom_css` applied in frontend |
| Compose import | `_parse_compose_images` → bulk add |
| Export/import (JSON) | `GET /api/apps/export`; JSON roundtrip |

---

### Partially Implemented Features

#### `auto_update` field — `off` / `ask` / `auto` / `silent`

| Mode | UI | Stored | Scheduler |
|------|-----|--------|----------|
| `off` | ✅ Dropdown option | ✅ | ❌ Client-side only: frontend blocks manual update button |
| `ask` | ✅ | ✅ | ❌ Client-side only: frontend shows `window.confirm()` before update |
| `auto` | ✅ | ✅ | ❌ **Scheduler never reads `auto_update`** — no automatic triggering |
| `silent` | ✅ | ✅ | ❌ Same — no automatic triggering, no silent notification suppression |

**Classification: UI-Only** for `auto` and `silent` modes. `off` and `ask` are frontend-enforced only (no server-side gate).

#### `UpdateLog.triggered_by` — `"user"` / `"schedule"` / `"telegram"`

- `"user"` — always written, always displayed
- `"schedule"` — schema declares it, never written; would require scheduler to call `_log_update`
- `"telegram"` — schema declares it, never written; would require Telegram command integration

**Classification: Partial Feature** — the schema anticipates scheduler and Telegram-triggered update logging, but neither code path exists.

---

### UI-Only Features (No Backend Execution)

| Feature | Evidence |
|---------|----------|
| `auto_update: "auto"` and `"silent"` modes | Stored in DB, never acted upon by scheduler |

---

### Backend-Only Gaps (Implemented but not surfaced)

| Feature | Evidence |
|---------|----------|
| Certificate revocation | No CRL, no OCSP, no cert expiry mechanism; not surfaced in UI |
| `GITEA_TOKEN` env var | Read at `scheduler.py:354` but absent from `.env.example` |

---

## Report 7 — Legacy Artifact Inventory

### LEGACY-01 — `plain:` token prefix (pre-AES compatibility)

- **File:** `routes/hosts.py:69-87` (`_encrypt_token`, `_decrypt_token`)
- **Description:** When the `cryptography` package is unavailable, tokens are stored with a `plain:` prefix. On decryption, `plain:` tokens are returned as-is. This path was added when AES encryption was introduced to handle cases where the library wasn't installed.
- **Evidence:** `if stored.startswith("plain:"):` in `_decrypt_token`; warning log `"cryptography package not installed — agent token stored in plaintext"` in `_encrypt_token`

---

### LEGACY-02 — Bare-string token (pre-prefix era)

- **File:** `routes/hosts.py:93-95` (`_decrypt_token`)
- **Description:** A third fallback for tokens stored before any prefix convention (`enc1:` or `plain:`): `if not stored.startswith("enc1:"): return stored`. This handles the oldest install format.
- **Evidence:** Comment `# Legacy: stored before encryption was added — treat as plaintext`

Three generations of token formats are handled in sequence: bare string → `plain:` prefix → `enc1:` prefix.

---

### LEGACY-03 — SHA-256 backup code hashes

- **File:** `routes/auth.py:131-136` (`_verify_backup_code`)
- **Description:** Backup codes were originally hashed with SHA-256. After migration to bcrypt, the legacy path was retained to allow existing users to consume their pre-migration codes without requiring regeneration.
- **Evidence:** Comment `# legacy SHA-256 hash — support existing installs`; conditional `if h.startswith("$2b$") or h.startswith("$2a$"):` branches on hash format

---

### LEGACY-04 — Historical migration functions (v1–v11)

- **File:** `migrations.py:36-235`
- **Description:** All 18 migration functions are idempotent (each checks column/table existence before acting). For installs already at schema v18, migrations 1-11 execute as no-ops. The functions are not dead code but their bodies are never-executing branches on mature installations.
- **Note:** `migration_6` implements `auto_categorize` logic inline using raw SQL rather than calling `categories.auto_categorize()` — an intentional pattern to avoid SQLAlchemy model dependencies during migration.

---

### LEGACY-05 — Divergent category seeding lists

Three separate category definitions exist:

| Location | Entries | Used for |
|----------|---------|---------|
| `migrations.py:DEFAULT_CATEGORIES` | 15 categories with keyword strings | `migration_5` (initial DB seeding), `migration_12` (keyword refresh) |
| `categories.py:_DEFAULT_CATEGORIES` | 7 categories (original set) | `ensure_default_categories()` at startup |
| `categories.py:BUILTIN_KEYWORDS` | 15+ categories | Runtime `auto_categorize()` matching |

New installs receive 15 categories from the migration runner. The startup `ensure_default_categories()` only seeds 7 — it fills gaps but the 15-category set is already present from `migration_12` on any install that has run migrations. The 7-entry list in `categories.py` is a legacy artifact of the original design predating the category expansion.

---

### LEGACY-06 — `host.token_hash` bcrypt field

- **File:** `models.py:154`, `routes/hosts.py:271, 356`
- **Description:** When AES-256-GCM token storage was introduced, the bcrypt hash in `Host.token_hash` was kept as a parallel write. The field and its verification method (`Host.check_token`) represent the previous authentication design that was superseded but not fully removed.
- **Evidence:** `Host.check_token()` defined at `models.py:166`, never called

---

## Report 8 — Authoritative Path Analysis

### App Version Checking

| Operation | Authoritative Implementation | Alternative |
|-----------|------------------------------|-------------|
| Scheduled full check | `scheduler.run_version_checks(flask_app, app_ids=None)` | — |
| Single-app check | `scheduler._check_one(app_id, flask_app)` | — |
| Manual trigger (all apps) | `POST /api/check` → spawns `run_version_checks` in daemon thread | — |
| Manual trigger (one app) | `POST /api/apps/<id>/check` → calls `_check_one` directly in request thread | — |
| Registry routing | `scheduler.resolve_latest_version(image, version_hint)` | — |
| Docker Hub fetch | `scheduler.fetch_dockerhub_latest()` | — |
| GitHub fetch | `scheduler.fetch_github_latest_smart()` → may fall back to `fetch_github_latest()` | `fetch_github_latest()` is a fallback |
| LinuxServer (lscr.io) | Routes through `fetch_dockerhub_latest()`, returns `"lscr"` channel key | — |
| Status determination | Inline in `scheduler._check_one()` using `_smart_gte()` | `apps._derive_status()` — used only for manual version field edit |
| Version comparison | `scheduler._smart_gte()` + `_semver_key()` | `apps._sort_key()` — local, simpler, different edge-case handling |

---

### Notification Generation

| Path | Trigger | Implementation | Active? |
|------|---------|---------------|---------|
| Immediate per-app notification | After `run_version_checks` when `digest == "immediate"` and app becomes outdated | Inline `scheduler.py:788-800`; uses `_render_template` if custom template configured | **Yes** |
| Digest notification | After `run_version_checks` when digest mode is daily/weekly/interval | `_should_send_digest()` + `_build_digest()` at `scheduler.py:808-825` | **Yes** |
| Scan summary | After every `run_version_checks` when `scan_summary_notify == "on"` | Inline `scheduler.py:826-842` | **Yes** |
| Scan summary (endpoint) | `POST /api/scan-summary` | `routes/settings.scan_summary()` — identical logic, never called | **Dead** |
| Update/revert action | After `trigger_update()` or `revert_update()` completes | `routes/hosts._notify_action()` | **Yes** |
| Telegram test | `POST /api/settings/test-telegram` | `routes/settings.test_telegram()` | **Yes** |
| Webhook delivery | All above paths | `scheduler._send_webhook(url, payload)` | **Yes** |

---

### Authentication

| Path | Mechanism | Active? |
|------|----------|---------|
| Web session login | Cookie → `session["user_id"]` → `utils.current_user()` → `require_auth()` | **Yes** |
| TOTP second factor | `session["totp_pending_user_id"]` → `_totp_verify()` → `_promote_session()` | **Yes** |
| Agent token verification | `X-Vigil-Token` header → `Settings.get(f"host_{id}_token")` → `_decrypt_token()` → string comparison | **Yes** |
| Agent token bcrypt check | `Host.check_token()` using `host.token_hash` | **Dead** — method defined, never called |
| Install token verification | `InstallToken.check_token()` using `install_tokens.token_hash` | **Yes** — used in `agent_provision()` |

---

### Version Status Calculation

| Path | Used when |
|------|-----------|
| `scheduler._check_one()` — inline logic with `_smart_gte()` | All scheduled and manually-triggered version checks. Determines final `status` field stored in DB. **Authoritative.** |
| `routes/apps._derive_status()` | Only when user manually edits the `version` field of an app via `PATCH /api/apps/<id>`. Recalculates status locally. Does not run registry checks. |

---

### Category Assignment

| Path | Used when |
|------|-----------|
| `categories.auto_categorize(image)` | App creation (`add_app`), compose import, `POST /api/apps/recategorize` |
| `categories.recategorize_all()` | On app startup via `app.py`; when a category's keywords are edited via `PATCH /api/categories/<id>` |
| `migrations.migration_6` inline SQL | One-time during initial schema migration — historical |

---

### Scheduler Execution

| Job | Registration | Persistence | First run |
|-----|-------------|-------------|-----------|
| `run_version_checks` | `_scheduler.add_job(...)` in `start_scheduler()` | `MemoryJobStore` — lost on restart | `next_run_time=datetime.now()` — fires immediately |

There is only one registered scheduled job. Rescheduling is done via `reschedule_interval()` which calls `_scheduler.reschedule_job()` on the live scheduler without restarting it.

---

## Report 9 — Complexity Hotspots

### File Size and Responsibility Count

| File | Lines | Distinct Responsibilities | Risk Level |
|------|-------|--------------------------|------------|
| `frontend/src/App.jsx` | **4,515** | All frontend views, state (87 useState), CSS (411 inline styles), API client, component definitions, icon search, update wizard | **Critical** |
| `backend/scheduler.py` | **877** | Version fetching (5 registries), tag filtering, version comparison, status determination, history management, notification rendering, Telegram delivery, webhook delivery, digest scheduling, scan summary, job management | **High** |
| `backend/routes/hosts.py` | **760** | Host CRUD, token generation, AES key derivation, mTLS context, agent HTTP communication, compose patching, update execution, revert execution, update log CRUD, notification dispatch, TLS provisioning (install tokens + cert issuance + fingerprint verification) | **High** |
| `backend/migrations.py` | ~390 | 18 forward migrations + helpers + category keyword data | Medium |
| `backend/ca.py` | ~340 | CA key generation, CA cert creation, client cert creation, agent cert signing, fingerprinting, AES-256-GCM package encryption, PBKDF2 key derivation, public IP detection | Medium |
| `backend/routes/apps.py` | ~330 | Category CRUD, App CRUD, compose import/export, icon upload, snooze, ignore, version check trigger | Medium |
| `backend/routes/auth.py` | ~290 | Login, TOTP setup/confirm/disable/regenerate, backup codes, session management, QR code generation | Medium |
| `backend/categories.py` | ~175 | Keyword map data, DB seeding, recategorization | Low |

---

### Hook Density in `App.jsx`

| Hook type | Total in file | In `App()` component |
|-----------|--------------|---------------------|
| `useState` | 110 | **87** |
| `useRef` | 23 | 14 |
| `useEffect` | 18 | 12 |
| `useCallback` | 11 | 9 |
| `useMemo` | 1 | 0 |
| **Total** | **163** | **122** |

87 independent state variables in a single React function component is an extreme concentration. React recommends extracting state into custom hooks or sub-components when a component manages more than a handful of state variables.

---

### Inline Style Count (`App.jsx`)

- **411 occurrences** of `style={{...}}` inline style objects
- No CSS-in-JS library, no CSS modules, no Tailwind
- One 450-line CSS template string injected as a `<style>` element — covers global classes
- Component-level variants use inline styles with no reuse mechanism

---

### Scheduler Responsibility Breakdown

`scheduler.py` contains: 5 registry-specific fetch functions, 4 helper parsing functions, 1 router function (`resolve_latest_version`), 2 notification delivery functions (`send_telegram`, `_send_webhook`), 1 notification decision function (`_should_notify`), 1 digest evaluation function (`_should_send_digest`), 1 digest builder (`_build_digest`), 1 per-app worker (`_check_one`), 1 main job function (`run_version_checks`), 3 scheduler management functions. Ten distinct concern areas in one file.

---

## Report 10 — Cleanup Candidate Register

| ID | Category | File / Location | Evidence | Confidence |
|----|----------|----------------|----------|------------|
| CC-01 | Dead Code | `utils.py:91` `norm()` | Exported function, zero external callers | **High** |
| CC-02 | Dead Code | `utils.py:98` `sort_key()` | Exported function, zero external callers | **High** |
| CC-03 | Dead Code | `utils.py:111` `derive_status()` | Exported function, zero external callers | **High** |
| CC-04 | Dead Code | `utils.py:120` `parse_image_name()` | Exported function, zero external callers | **High** |
| CC-05 | Dead Code | `utils.py:127` `parse_compose_images()` | Exported function, zero external callers | **High** |
| CC-06 | Dead Code | `models.py:166` `Host.check_token()` | Method defined, zero call sites; superseded by AES path | **High** |
| CC-07 | Dead Code | `routes/hosts.py:50` `_check_token()` | Function defined, zero call sites | **High** |
| CC-08 | Dead Code | `ca.py:291` `decrypt_cert_package()` | Backend function that implements agent-side logic; backend never calls it | **High** |
| CC-09 | Dead Code | `routes/settings.py:141` `scan_summary()` / `POST /api/scan-summary` | Route defined, never called by scheduler or frontend | **High** |
| CC-10 | Dead Code | `requirements.txt` `flask-session==0.8.0` | Package installed, never imported in any `.py` file | **High** |
| CC-11 | Partial Feature | `TrackedApp.auto_update` `"auto"` and `"silent"` modes | Stored in DB, displayed in UI, never read by scheduler | **High** |
| CC-12 | Partial Feature | `UpdateLog.triggered_by` `"schedule"` and `"telegram"` | Schema declares them, never written at runtime | **High** |
| CC-13 | Partial Feature | `auto_update` `"off"` and `"ask"` enforcement | Client-side only — no server-side gate on `trigger_update` endpoint | **High** |
| CC-14 | Duplicate Logic | `utils.norm` / `apps._norm` / `scheduler._norm` lambda | Three implementations of strip-leading-v with diverging semantics | **High** |
| CC-15 | Duplicate Logic | `utils.sort_key` / `apps._sort_key` / `scheduler._semver_key` | Three version tuple parsers of increasing sophistication | **High** |
| CC-16 | Duplicate Logic | `utils.derive_status` / `apps._derive_status` | Two status calculators; apps version adds `pinned` and numeric comparison | **High** |
| CC-17 | Duplicate Logic | `utils.parse_image_name` / `apps._parse_image_name` | Two image name parsers; apps version adds generic name fallback | **High** |
| CC-18 | Duplicate Logic | `utils.parse_compose_images` / `apps._parse_compose_images` | Two compose parsers; apps version splits image:tag | **High** |
| CC-19 | Duplicate Logic | `CH_LABELS` at `scheduler.py:35` and `scheduler.py:785` | Identical dict defined twice in the same file; must be updated in sync | **High** |
| CC-20 | Duplicate Logic | Scan summary: inline in `run_version_checks` + `POST /api/scan-summary` endpoint | Same notification message produced by two separate implementations | **High** |
| CC-21 | Redundant Configuration | `Host.token_hash` column | Written on create/regenerate; the only read path (`Host.check_token`) is never called | **High** |
| CC-22 | Redundant Configuration | `CHECK_INTERVAL_HOURS` dual-source (env var + DB) | Diverge silently after first UI change; env var wins on restart | **High** |
| CC-23 | Redundant Configuration | `TELEGRAM_TOKEN` / `TELEGRAM_CHAT_ID` env vars in `docker-compose.yml` | Scheduler reads from DB only; env vars have no runtime effect | **High** |
| CC-24 | Legacy Artifact | `routes/hosts.py:69-87` `plain:` token prefix | Pre-AES backward compatibility shim | **Medium** |
| CC-25 | Legacy Artifact | `routes/hosts.py:93-95` bare-string token fallback | Pre-`plain:` prefix era compatibility | **Medium** |
| CC-26 | Legacy Artifact | `routes/auth.py:131-136` SHA-256 backup code path | Pre-bcrypt backward compatibility for existing installs | **Medium** |
| CC-27 | Legacy Artifact | `categories.py:_DEFAULT_CATEGORIES` (7 entries) vs `migrations.py:DEFAULT_CATEGORIES` (15 entries) | Three divergent category lists; startup seeder seeds fewer categories than migration runner | **Medium** |
| CC-28 | Legacy Artifact | `models.py:154` `Host.token_hash` column | Written by both `create_host` and `regenerate_token`; bcrypt hash of superseded auth design | **Medium** |
| CC-29 | Complexity Hotspot | `frontend/src/App.jsx` (4,515 lines, 87 useState) | Entire frontend in one file; all views, state, CSS, components co-located | **High** |
| CC-30 | Complexity Hotspot | `backend/scheduler.py` (877 lines, 10 responsibilities) | Registry fetching, comparison, notification, scheduling all in one module | **Medium** |
| CC-31 | Complexity Hotspot | `backend/routes/hosts.py` (760 lines, 11 responsibilities) | Host CRUD + agent comms + TLS provisioning + update execution + notifications in one module | **Medium** |
