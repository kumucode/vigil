# Vigil — Session Memory & Continuity File
> Last updated: June 2026 session  
> **Start every new session by reading this file first.**

---

## What is Vigil?

Vigil is a self-hosted Docker image version tracker. It monitors a list of Docker container images (e.g. `jellyfin/jellyfin:latest`, `lscr.io/linuxserver/sonarr`) and tells the user when a newer version is available upstream. Think of it as a homelab update dashboard.

**Key capabilities:**
- Tracks images from Docker Hub, GitHub Releases, GitLab, Gitea/Forgejo, Quay.io, and LinuxServer.io (lscr.io)
- Detects version bump type: major / minor / patch / unknown
- Sends Telegram and webhook notifications when updates are detected
- Supports remote agents (vigil-agent.py) deployed on other LXC/VM hosts, communicating over mutual TLS
- Full web UI (React SPA) with grid/list/table views, categories, custom icons, import/export

**Deployment:** Self-hosted via Docker Compose. Not a public SaaS — for personal homelab use.

---

## Current State: v2.3

### Deployed on:
- **Vigil host:** LXC 101, IP `192.168.1.10:3000` (Proxmox homelab)
- **Agents on:** Navidrome host LXC, BookStack host LXC (separate containers)

### Working directory (always restore first):
```
/home/claude/docker-tracker/
```

### Output zip (latest built):
```
/mnt/user-data/outputs/vigil-v2.3.zip
```

### Deploy commands:
```bash
# Full rebuild (use for ANY backend or frontend change)
docker compose down && docker compose build --no-cache && docker compose up -d

# Backend only
docker compose build --no-cache backend && docker compose up -d

# Frontend only
docker compose build --no-cache frontend && docker compose up -d

# ⚠️ NEVER use: docker compose down -v  (destroys DB volume tracker-data)
```

### Deploy method (homelab):
1. Download zip from outputs
2. `rsync` to LXC 101
3. `unzip -o vigil-v2.3.zip -d /opt/vigil/`
4. `cd /opt/vigil && docker compose build --no-cache && docker compose up -d`

---

## File Structure

```
vigil/
├── backend/
│   ├── app.py               # Flask app factory, session config, CORS
│   ├── ca.py                # Private CA: key gen, cert signing, mTLS, AES-256-GCM pkg
│   ├── config.py            # MAX_ICON_BYTES, LEN limits
│   ├── utils.py             # require_auth(), now_str(), clamp(), parse_compose_images()
│   ├── categories.py        # Default categories seeding, _auto_categorize()
│   ├── _default_logo.py     # DEFAULT_LOGO_B64 (base64 PNG)
│   ├── models.py            # SQLAlchemy models (User, TrackedApp, Host, etc.)
│   ├── migrations.py        # DB migrations v1–v18, LATEST_VERSION = 18
│   ├── scheduler.py         # APScheduler, version fetchers, notifications
│   ├── entrypoint.sh        # gosu appuser gunicorn --workers 1 --threads 4 --timeout 300
│   ├── Dockerfile           # FROM python:3.12-slim, copies agent/ scripts
│   └── routes/
│       ├── auth.py          # Login, TOTP, backup codes, change-password
│       ├── apps.py          # CRUD for tracked apps, compose import/export
│       ├── hosts.py         # Agent hosts, mTLS provisioning, install tokens
│       └── settings.py      # App settings, logo, custom CSS, export/import
├── frontend/
│   ├── src/App.jsx          # 4,515-line single-file React SPA
│   └── package.json         # version: "2.2.0" (needs bump to 2.3)
├── agent/
│   ├── vigil-agent.py       # Standalone Python agent (HTTP + mTLS)
│   ├── install.sh           # Agent installer (run on remote host)
│   └── uninstall.sh
├── nginx/
│   └── default.conf         # Reverse proxy; long timeouts for /update + /revert
├── docker-compose.yml
├── install.sh               # First-time Vigil installer
├── .env.example
└── SESSION_MEMORY.md        # ← This file
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18.3.1 + Vite 5.4.1 (single-file SPA, no router) |
| Backend | Flask 3.1.0 + Flask-SQLAlchemy 3.1.1 |
| Database | SQLite (via SQLAlchemy), 18 migrations |
| Scheduler | APScheduler 3.10.4 (BackgroundScheduler, daemon=True) |
| HTTP client | requests 2.32.3 |
| Crypto | cryptography 44.0.2 (AES-256-GCM, RSA, x509) |
| Passwords | bcrypt 4.2.1 |
| YAML | pyyaml 6.0.2 |
| TOTP QR | reportlab 4.2.5 (try/except fallback if missing) |
| Timezones | tzdata 2024.2 |
| Production server | gunicorn 22.0.0 (1 worker, 4 threads, 300s timeout) |
| Proxy | nginx:1.27-alpine |

---

## Database Schema (18 migrations, LATEST_VERSION = 18)

### Tables
| Table | Purpose | Growth risk |
|-------|---------|------------|
| `schema_version` | Single row, tracks migration level | None |
| `users` | Single admin user (no multi-user) | None |
| `categories` | 7 defaults + user-defined | Low |
| `tracked_apps` | Core: one row per image | `icon_data` col can be 512KB/row |
| `hosts` | Remote agent hosts | Low |
| `install_tokens` | Single-use, 5-min TTL tokens | **Used tokens never deleted — grows** |
| `update_log` | Per-app update history | No auto-retention, manual clear only |
| `settings` | Key-value store (app config, tokens) | `app_logo` can be large |

### Key model fields of note
- `tracked_apps.icon_data`: base64 PNG up to 512KB
- `tracked_apps.version_history`: JSON array, capped at 20 by `MAX_HISTORY`
- `tracked_apps.auto_update`: field exists in DB and UI but **scheduler never reads it** (unimplemented feature)
- `users.totp_secret`: stored **plaintext** (not encrypted, unlike agent tokens)
- `settings.host_{id}_token`: AES-256-GCM encrypted agent token
- `hosts.token_hash`: bcrypt hash written but `check_token()` **never called** (vestigial)

---

## Feature Inventory

### Authentication
- Username/password with bcrypt
- TOTP 2FA (custom RFC 6238 implementation using stdlib only)
- 8 backup codes (bcrypt-hashed)
- Session cookie (Flask built-in cookie sessions, NOT flask-session which is installed but unused)
- Rate limiting on auth endpoints (`@rate_limited(max_hits=10, window_seconds=60)`)

### Version Checking
- Scheduler: `BackgroundScheduler`, interval from `CHECK_INTERVAL_HOURS` env var (default 6h)
- Per-app concurrent checks: `ThreadPoolExecutor(max_workers=10)`
- Status values: `up-to-date` (green), `outdated` (red), `error` (orange), `unknown` (purple), `pinned` (grey)
- Version bump detection: major / minor / patch / unknown
- `_is_version_tag()` and `_smart_gte()` for version comparison logic
  - Handles `nightly-X.Y.Z` style channel-prefixed tags → treated as versions
  - `1.2-nightly`, `1.2-stable` → treated as pinned (floating suffix)
  - `nightly` bare → pinned

### Registry Channels
| Key | Display | Label | Notes |
|-----|---------|-------|-------|
| `dockerhub` | Docker Hub 🐋 | `CH_LABELS["dockerhub"]` | |
| `github` | GitHub Releases 🐙 | | |
| `gitlab` | GitLab 🦊 | | |
| `gitea` | Gitea/Forgejo 🍵 | | `GITEA_TOKEN` env var (undocumented in .env.example) |
| `quay` | Quay.io 🔵 | | |
| `lscr` | LinuxServer 🐧 | `CH_LABELS["lscr"]` — must exist in **BOTH** `CH_LABELS` locations in scheduler.py | Routes through `fetch_dockerhub_latest` but returns `"lscr"` key |
| `unknown` | Unknown ❓ | | |

> ⚠️ **Critical gotcha:** `CH_LABELS` is defined **twice** in `scheduler.py` — both inside `_render_template()` AND in the digest block. Both must be updated together when adding a channel.

### Notifications
- Telegram bot (`TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`)
- Webhook (POST JSON)
- Per-app toggle for notification on major/minor/patch bumps
- Configurable notification template
- Digest mode (scheduled summary)

### Remote Agents (v2.3 — mTLS)
- Private CA auto-generated on first Vigil start (`vigil-ca.key`, `vigil-ca.crt` in `/data`)
- Per-agent certificates signed by CA
- Certificate packages encrypted AES-256-GCM + PBKDF2
- Install tokens: single-use, 5-minute expiry, bcrypt-hashed
- **Decryption key never travels over network** — user types it locally
- 4-step wizard: (1) Run installer, (2) Install token, (3) Decryption key, (4) Agent token
- Fingerprint verification UI with per-segment red/green highlighting
- DB migration v18: `cert_fingerprint`, `tls_enabled` on hosts; `install_tokens` table

### UI / UX
- Single-page React app (no router, all state in one `App()` function)
- 3 view modes: grid (cards), list, compact table
- Custom CSS injection
- Accent color HSV picker
- App/host logo upload (PNG with black background stripping)
- Import/export (JSON)
- Category management (7 defaults: media/networking/monitoring/storage/security/database/devops)
- Icon search via jsDelivr CDN (walkxcode/dashboard-icons + selfh.st/icons)
- Copy-to-clipboard for version strings (with HTTP fallback)
- "Latest" field clickable in all 3 views

---

## Critical Gotchas (Never Re-introduce)

1. **`CH_LABELS` exists in TWO places in `scheduler.py`** — lines ~35 AND ~785 (digest block). Both must be updated together when adding/changing channel labels.

2. **`DEFAULT_LOGO` in `App.jsx`** applies to new installs only. Existing installs load `app_logo` from the DB `Settings` table. Both must be updated.

3. **`_auto_categorize()` strips to bare leaf name** — multi-segment paths like `linuxserver/bookstack` resolve to just `bookstack`. Keywords in `_BUILTIN_KEYWORDS` must match the leaf name.

4. **Working directory is lost between sessions** — Always restore from the output zip at session start:
   ```bash
   ls /home/claude/docker-tracker/ 2>/dev/null || echo "NEED TO RESTORE"
   # If missing, extract from /mnt/user-data/outputs/vigil-v2.3.zip
   ```

5. **React hooks must all be before any conditional returns** in `App()`. The black-screen bug was caused by an early `return` placed before all hook declarations. Adding ANY conditional logic before hooks causes React Error #310.

6. **`CardMenu` is nested inside `App()` with its own hooks** — must not be moved inside a conditional block.

7. **NEVER use `docker compose down -v`** — destroys `tracker-data` volume (the SQLite database).

8. **`package.json` version is still `"2.2.0"`** — needs to be bumped to `"2.3.0"`.

9. **`_tls_context()` now raises instead of returning None** — no silent HTTP fallback for mTLS agents.

10. **Agent timeout split:** `AGENT_TIMEOUT_READ = 30s`, `AGENT_TIMEOUT_WRITE = 180s`. `docker compose up -d` after an image update can take 30–120s.

---

## Architecture Stabilization Program

This is an ongoing multi-session project. The goal is to systematically assess and improve Vigil's codebase.

### Program Status

| Step | Status | Output Document |
|------|--------|----------------|
| Step 1 — Discovery & Inventory | ✅ Complete | `vigil-architecture-inventory.md` |
| Step 2 — Dependency & Risk Audit | ✅ Complete | `vigil-dependency-risk-audit.md` |
| Step 3 — Architecture Mapping | ✅ Complete | `vigil-architecture-mapping.md` |
| Step 4a — Dead Code & Redundancy Analysis | ✅ Complete | `vigil-dead-code-analysis.md` |
| Step 5 — Target Architecture Design | ✅ Complete | `vigil-target-architecture.md` |
| Step 6 — Refactor Execution Plan | ✅ Complete | `vigil-refactor-execution-plan.md` |
| Step 7 — Architecture Stabilization Review | ✅ Complete | `vigil-stabilization-review.md` |
| Step 8 — Implementation (P1–P6 complete) | ✅ In progress | see below |

### Implementation Status (Phases Executed)

| Phase | Name | Status | Key changes |
|-------|------|--------|-------------|
| P1 | Documentation & Minor Fixes | ✅ Complete | .env.example, package.json 2.3.0, bookstack keyword, config.py constants |
| P2 | Dead Code Removal | ✅ Complete | 6 dead fns, flask-session, scan-summary route removed |
| P3 | Utility Consolidation | ✅ Complete | CH_LABELS→config, SKIP_TAGS→config (24-entry), apps._derive_status updated |
| P4 | Configuration Deduplication | ✅ Complete | _seed_config_from_env(), scheduler reads DB, migration v19, token_hash writes stopped |
| P5 | Scheduler Decomposition | ✅ Complete | services/notifications.py, services/version_checker.py; scheduler.py 877→143L; _FLOAT_WORDS bug fixed |
| P6 | Backend Route Thinning | ✅ Complete | services/agent_client.py, services/update_executor.py; hosts.py 726→479L |
| P7 | Frontend Decomposition | ⬜ Pending | App.jsx 4515L → pages/components/hooks/context |

**Versioning:** Phases P1–P4 → v2.4 | Phases P5–P6 → v2.5 | Phase P7 → v2.6

**Critical bug fixed in P5:** _FLOAT_WORDS was a local var inside _semver_key, referenced by _smart_gte — caused NameError (silent worker error) on every outdated-app comparison. Fixed by promoting to module level in version_checker.py.


### Reports produced (all in `/mnt/user-data/outputs/`):

**`vigil-architecture-inventory.md`** — Step 1 output:
- Complete file inventory (all source files, roles, line counts)
- All features catalogued
- Known bugs / dead code identified
- Configuration surface mapped
- Agent architecture described

**`vigil-architecture-mapping.md`** — Step 3 output:
- 10 detailed architecture reports:
  1. System Architecture Overview
  2. Data Flow Diagram
  3. Database Schema Analysis
  4. Security Surface Map
  5. Scheduler Architecture
  6. Frontend Architecture
  7. Agent Architecture
  8. Registry Integration Map
  9. Configuration Architecture
  10. Deployment Architecture

**`vigil-dependency-risk-audit.md`** — Step 2 output:
- Report 1: Dependency Necessity Matrix (all 12 backend deps + frontend + CDN)
- Report 2: Dependency Risk Assessment (risk level + justification per dep)
- Report 3: Configuration Risk Analysis (dangerous defaults, drift, undocumented vars)
- Report 4: Database Growth Analysis (unbounded tables, large payload fields)
- Report 5: Security Surface Inventory (auth, TOTP, certs, tokens, encryption)
- Report 6: Scheduler Risk Analysis (failure points, race conditions, recovery)
- Report 7: Frontend Maintainability Assessment (hook density, component complexity)
- Report 8: Risk Register (26 risks, RISK-01 through RISK-26)

**`vigil-dead-code-analysis.md`** — Step 4a output:
- Report 1: Unused Imports (flask-session confirmed dead; App.jsx imports all active)
- Report 2: Unused Functions (5 dead in utils.py; Host.check_token; hosts._check_token; ca.decrypt_cert_package; settings.scan_summary route)
- Report 3: Unused Models & Fields (auto_update unexecuted by scheduler; Host.token_hash written never read; triggered_by has two dead values)
- Report 4: Duplicate Logic Inventory (7 groups: norm×3, sort_key×3, derive_status×2, parse_image_name×2, parse_compose_images×2, CH_LABELS×2, scan_summary×2)
- Report 5: Duplicate Configuration Paths (CHECK_INTERVAL_HOURS, Telegram creds, agent token dual-representation)
- Report 6: UI Contract Analysis (auto_update auto/silent = UI-Only; triggered_by schedule/telegram = Partial)
- Report 7: Legacy Artifact Inventory (plain: token, bare token, SHA-256 backup codes, category list divergence)
- Report 8: Authoritative Path Analysis (version check, notification, auth, status calculation, scheduler)
- Report 9: Complexity Hotspots (App.jsx 4515L/87useState, scheduler.py 877L/10resp, hosts.py 760L/11resp)
- Report 10: Cleanup Candidate Register (31 candidates: CC-01 through CC-31)

---

**`vigil-target-architecture.md`** — Step 5 output:
- Report 1: Architectural Principles (P1–P8: single source of truth, explicit ownership, separation of concerns, no dead code, no duplication, explicit legacy policy, complexity at point of introduction, passive scheduler)
- Report 2: Target Backend Architecture (9 modules: services/version_checker, services/notifications, services/update_executor; scheduler reduced to ~80L orchestrator)
- Report 3: Target Frontend Architecture (App.jsx → pages/ + components/ + context/ + hooks/ + api.js + constants.js; target ~150L App.jsx)
- Report 4: Configuration Architecture (DB as single source of truth; env vars seed once on first run; no drift possible)
- Report 5: Scheduler Architecture (scheduler owns only APScheduler lifecycle + orchestration; all logic delegated to services)
- Report 6: Notification Architecture (single notifications.py; CH_LABELS defined once; dead scan-summary endpoint removed)
- Report 7: Data Ownership Architecture (explicit authoritative writer per entity per field group)
- Report 8: Legacy Compatibility Strategy (plain: token — retain; bare token — retain; SHA-256 backup codes — retain; _DEFAULT_CATEGORIES — deprecate; Host.token_hash — deprecate via migration v19/v20)
- Report 9: Refactor Domains (7 domains, sequenced by risk: doc fixes → dead code → utils → config → scheduler → routes → frontend)
- Report 10: Target Architecture Blueprint (module map, dependency direction, source of truth summary, ownership model, file size targets, implementation phases)


**`vigil-refactor-execution-plan.md`** — Step 6 output:
- Report 1: Refactor Strategy (philosophy, ordering rationale, risk management, rollback strategy)
- Report 2: Refactor Phases (7 phases, each independently releasable)
- Report 3: Dead Code Removal Plan (per-CC-ID phase assignment, pre-flight greps, risk)
- Report 4: Backend Refactor Plan (file-by-file implementation sequence with code sketches)
- Report 5: Frontend Refactor Plan (11-step extraction order, api.js design)
- Report 6: Configuration Migration Plan (check_interval, Telegram, agent token — current/intermediate/target state)
- Report 7: Database Migration Plan (migration v19 nullable, migration v20 drop deferred to v2.6+)
- Report 8: Testing Strategy (manual verification checklist per phase, high-risk area callouts)
- Report 9: Release Plan (v2.4 config fixes, v2.5 decomposition, v2.6 frontend, v3.0 future)
- Report 10: Execution Blueprint (master phase list, dependency graph, risk profile, expected outcomes, session structure)


**`vigil-stabilization-review.md`** — Step 7 output:
- Report 1: Goal Validation (5 objectives evaluated across v2.3→v2.4→v2.5→v2.6 timeline)
- Report 2: Roadmap Completeness (11 missing items: LICENSE, CONTRIBUTING, .github/, auto_update, WAL mode, rate limiting, etc.)
- Report 3: Remaining Architectural Risks (12 post-v2.6 risks, 0 High / 4 Medium / 8 Low)
- Report 4: Feature Contract Review (auto_update auto/silent = Misleading; 12/13 features fully implemented)
- Report 5: Public GitHub Readiness (Strengths: SECURITY.md, CHANGELOG, clean arch; Blockers: LICENSE, placeholder URLs, .github/)
- Report 6: Production Readiness (GO with limitations; 6 reliability gaps remain post-roadmap)
- Report 7: Portainer Compatibility (Portainer-deployable via Git method; not via YAML paste without pre-built images)
- Report 8: Security Baseline (7/10; strengths: mTLS, AES tokens, TOTP; weaknesses: TOTP plaintext, ALLOWED_ORIGIN=*)
- Report 9: v3.0 Readiness Scorecard (6.75/10 overall; Arch 8, Maintain 8, Reliable 6, Security 7, Docs 6, Deploy 7, Contrib 5, Ops 7)
- Report 10: Final Recommendations (Roadmap: GO | Public GitHub: NO-GO now / Conditional GO post-v2.6 | Production: GO | v3.0: Conditional GO)


## Risk Register Summary (26 Risks)

### Security Risks (High Priority)
| Risk ID | Description |
|---------|-------------|
| RISK-01 | `flask-session` installed but unused — unnecessary attack surface |
| RISK-02 | `ALLOWED_ORIGIN=*` default with `supports_credentials=True` |
| RISK-03 | `SECURE_COOKIES` defaults false — session cookie over plain HTTP |
| RISK-04 | TOTP secrets stored **plaintext** in DB |
| RISK-05 | `/api/agent-provision` public endpoint has no rate limiting |
| RISK-24 | `reportlab` carries full PDF/XML CVE surface for single use case |

### Reliability Risks
| Risk ID | Description |
|---------|-------------|
| RISK-06 | `install_tokens` used tokens never deleted — unbounded growth |
| RISK-07 | `update_log` no automatic retention |
| RISK-08 | `CHECK_INTERVAL_HOURS` config drift: env var vs DB diverge after restart |
| RISK-09 | Telegram creds config drift: env var vs DB diverge |
| RISK-10 | `SECRET_KEY` loss silently invalidates all agent tokens |
| RISK-16 | No Docker Hub rate limit handling |
| RISK-17 | SQLite concurrent writes (10 threads, no WAL mode) |
| RISK-25 | Notification failures are silent |
| RISK-26 | Scheduler re-fires immediately on every restart |

### Architecture / Maintainability
| Risk ID | Description |
|---------|-------------|
| RISK-11 | `host.token_hash` vestigial — written but never verified |
| RISK-12 | `auto_update` field unimplemented despite UI support |
| RISK-13 | `triggered_by` field in update_log only ever writes "user" |
| RISK-14 | `container_id` column name misleading (stores label, not Docker ID) |
| RISK-15 | `GITEA_TOKEN` env var undocumented in `.env.example` |
| RISK-18 | `App.jsx` 4,515-line monolith — 87 useState, hooks ordering fragile |
| RISK-19 | `CardMenu` nested inside `App()` with hooks — hooks violation risk |
| RISK-20 | `app_logo` transmitted on every settings load (large payload) |
| RISK-21 | `icon_data` in `GET /api/apps` — potentially multi-MB responses |
| RISK-22 | External CDN icons with no SRI verification |
| RISK-23 | `SESSION_LIFETIME_HOURS` documented as "idle timeout" but is absolute |

---

## Bugs Previously Fixed (Don't Re-introduce)

| Bug | Fix Summary |
|-----|------------|
| Black screen on load | `useState` hooks were after conditional early return in `App()` |
| Docker healthcheck failing | `wget` in busybox image → changed to `curl` |
| Migration crash | `NOT NULL totp_enabled` without default on new column |
| `appAccent` undefined on LoginScreen | Was reading from settings before they loaded |
| `_contrastOn`/`_hexToRgba` closure error | Moved from inside `App()` to module level |
| Logo black background | JPEG replaced with transparent PNG using Pillow darkness threshold |
| lscr.io labeled "Docker Hub" | Added `lscr` to both `CH_LABELS` locations + `CHANNEL_META` in App.jsx |
| BookStack uncategorized | Added `bookstack` to `_BUILTIN_KEYWORDS` storage list |
| BookStack no icon | Added to `ICON_MAP` |
| Install banner said "DOCKER" | Replaced with "VIGIL" ASCII art |
| Agent write timeout too short | Split to READ=30s / WRITE=180s |
| nginx 502 on long updates | Added separate nginx location blocks with 300s proxy_read_timeout |
| mTLS client cert missing | Added `vigil-client.crt`/`vigil-client.key` for Vigil's outbound connection |
| Permission errors on `.vigil-backups` | Installer now chowns all compose dirs to vigil-agent user |
| CardMenu dropdown disappearing | `mousedown` listener on open caused race; fixed with `setTimeout(..., 10)` |
| `nightly-0.8.9.15` misclassified as pinned | Updated `_is_version_tag()` to handle keyword-prefixed version tags |

---

## Session Start Ritual (Every Session)

```bash
# 1. Verify working directory exists
ls /home/claude/docker-tracker/ 2>/dev/null || echo "MISSING — restore from zip"

# 2. If missing, restore
cd /home/claude && unzip /mnt/user-data/outputs/vigil-v2.3.zip -d docker-tracker/

# 3. Verify key files
cat /home/claude/docker-tracker/frontend/package.json | grep version
grep "LATEST_VERSION" /home/claude/docker-tracker/backend/migrations.py
wc -l /home/claude/docker-tracker/frontend/src/App.jsx
```

---

## Session End Ritual (Every Session)

```bash
# 1. Verify fixes with grep before packing
# 2. Pack everything into the output zip
cd /home/claude/docker-tracker
zip -r /mnt/user-data/outputs/vigil-v2.3.zip . \
  --exclude "*.pyc" \
  --exclude "__pycache__/*" \
  --exclude "node_modules/*" \
  --exclude ".git/*" \
  --exclude "frontend/dist/*"
```

---

## What's Next (Pending Work)

### High priority
1. **Error logging feature** — requested by user, not yet implemented. Should log backend errors, agent errors, and scheduler failures somewhere visible in the UI.
2. **`flask-session` removal** — RISK-01. Just remove from `requirements.txt`.
3. **`install_tokens` cleanup** — RISK-06. Delete used tokens after a TTL (e.g. 24h) or on next provisioning.
4. **`GITEA_TOKEN` documentation** — RISK-15. Add to `.env.example`.
5. **`package.json` version** — needs `"version": "2.3.0"`.

### Architecture Stabilization Program — Next Step
**Step 8 — Implementation:** Execute the phases defined in `vigil-refactor-execution-plan.md`. Pre-implementation checklist in Execution Plan Report 10.

**Go/No-Go summary from Step 7 Review:**
- Roadmap execution: **GO**
- Public GitHub visibility: **NO-GO** now / **CONDITIONAL GO** post-v2.6 (needs LICENSE + README fixes)
- Production deployment: **GO** (with noted limitations)
- v3.0 foundation: **CONDITIONAL GO** (requires `auto_update` resolution + docs)

**Critical blockers (outside roadmap):**
1. No LICENSE file (hard blocker for open-source)
2. `auto_update` broken feature contract (UX)
3. SQLite no WAL mode (reliability at scale)

**Post-v2.6 v3.0 readiness score: 6.75/10**

### Medium priority
6. **`/api/agent-provision` rate limiting** — RISK-05.
7. **TOTP secret encryption** — RISK-04. Encrypt `users.totp_secret` at rest using same AES key as agent tokens.
8. **`update_log` retention policy** — RISK-07. Auto-delete entries older than N days.
9. **`SESSION_LIFETIME_HOURS` documentation fix** — RISK-23. Update `.env.example` comment to say "absolute session lifetime."

### Ongoing / architectural
10. **`auto_update` implementation** — RISK-12. The field exists; the scheduler needs to actually read it.
11. **Docker Hub rate limit detection** — RISK-16. Detect 429/401, add backoff.
12. **Expand LinuxServer icon/keyword coverage** — ongoing, add new apps as needed.

---

## Constants & Defaults

| Constant | Value |
|----------|-------|
| Default accent color | `#6c63ff` |
| Topbar height | 100px |
| Logo size (navbar) | 84×84px |
| Logo size (login screen) | 144×144px |
| Backend health endpoint | `curl http://localhost:5000/api/health` every 20s |
| Frontend health endpoint | `curl http://localhost/` every 10s |
| Default port | 3000 (`PORT` env var) |
| Data volume | `tracker-data` |
| Max icon size | 512 KB (`MAX_ICON_BYTES = 512 * 1024`) |
| Version history cap | 20 entries (`MAX_HISTORY = 20`) |
| DB migrations | 18 (LATEST_VERSION = 18) |
| Gunicorn workers | 1 (required for APScheduler) |
| Gunicorn threads | 4 |
| Gunicorn timeout | 300s |
| Scheduler max workers | 10 (ThreadPoolExecutor) |
| Agent read timeout | 30s |
| Agent write timeout | 180s |
| Install token TTL | 5 minutes |

---

## Homes' Preferences

- Communicates in mixed Spanish/English; brief and direct.
- Prefers fixes confirmed with a grep/verify step before repacking.
- No unnecessary explanations — just do the work.
- Compact summary table for multi-fix sessions.
- Always ends session with repacked zip to `/mnt/user-data/outputs/vigil-v2.3.zip`.
