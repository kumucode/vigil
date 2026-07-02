# Changelog

All notable changes to Vigil will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [2.7] — 2026-06-25

### Added — Design System & Appearance

This release replaces all ad-hoc component colours with a centralized semantic
design-token architecture. Every colour in the application now flows through a
single `C` object produced by `useTheme.js`. No component carries local colour
overrides.

**Theme presets**
- Five built-in themes: **Warm Vintage** · **Nordic** · **Slate** · **Carbon** · **Midnight**
- Each preset defines its own complete token set: surfaces, borders, text, status,
  buttons, header, icon actions, glow, scrollbars
- `darkMode` is automatically synced when switching between light and dark presets
- `changePreset()` handles mode switch + accent update atomically; no reload needed

**Adaptive logo**
- Replaced the base64 PNG default logo with an SVG shield+eye icon in `LogoSVG.jsx`
- Uses `currentColor` throughout — inherits the active accent from the parent wrapper
- Works at any size (topbar: 52px, login screen: 144px)

**Header**
- New `C.header` token: a distinct surface darker than the page background
- `box-shadow` for depth separation; `min-height:72px` + `padding-block:10px` instead
  of `height:72px` so the bar never clips content

**Button system**
- Five button roles, all token-driven: **primary/save** · **test** · **close** · **danger** · **success**
- Light themes use `2px solid` borders; dark themes `1px solid` (via `_btnBW`)
- Warm Vintage: rgba translucent fills (0.75 opacity) with matching solid border
- Nordic: solid fills with specific hover lightening
- Close buttons: Nordic at 70% element opacity; hover always fully opaque
- New `.btn-success` class (confirm / create / deploy actions)
- `btnTestHoverText` token so hover text colour can differ from default

**Status colour normalization**
- Single `statusMap` object is the source of truth for all five statuses across
  Grid cards, Compact Table rows, and Dashboard stat cards
- Dashboard stat cards previously hardcoded `#8FA88C` (outdated green) and
  `#e05c5c` etc; now read `C.statusMap[status].fg` exclusively
- Grid status badge previously derived from a separate `STATUS_COLORS` constant;
  now uses `statusMap.bg / .fg / .border` for full consistency with the table
- `STATUS_COLORS` import removed from `App.jsx`

**Icon actions**
- `.ic-action` default colour is now `C.iconAction` = accent at 55% opacity
- Hover is full `C.accent`; never defaults to gray
- `.ic-action.deploy` and `.ic-action.del` retain their own semantic colours

**Typography & readability**
- Body: `14px`, `font-weight:450`, `line-height:1.55`
- Card names: `15.5px`; version values: `14.5px`; list/table names: `14–15px`
- Form labels: `14px` at `opacity:0.92`; hints: `opacity:0.85`
- Input height `+6px` (min-height 54px); textarea `+8px`; buttons vertical padding `+4px`
- All tabs (`.stab`): `min-width:fit-content`, `font-size:13px`, `opacity:0.78`
- Status badges (`.sb`): `11px`, `white-space:nowrap`

**Zero-clip policy**
- Global `*,*::before,*::after{box-sizing:border-box}` rule added
- Settings sidebar `.sw-nav`: `line-height:2` → `1.65`, `font-size:16px` → `18px`,
  `display:block` → `display:flex; align-items:center`, `padding-bottom:22px`
  — eliminates descender clipping on "g"/"y" in "Telegram", "Agents", "Branding"
- Compact table cells: `height:56px` → `min-height:56px; overflow:visible`
- Table headers: `height:44px` → `min-height:44px`
- Category tags (`.tag`): `overflow:visible` — no unintentional ellipsis
- HostWizard step tabs: `padding:7px 0` → `padding:12px 6px`, `font-size:11` → `12`,
  `line-height:1.6`, `overflow:visible` — fixes "Verify" / "agent" descender clip

**Topbar layout**
- New button order: Check Updates → Import YML → Export → Import JSON →
  Grid → Compact → Dark mode → Settings → Logout → **Add Application**
- "Add Application" moved to the far right, after Logout, separated by a divider
- Import/Export controls moved before the view-toggle group

**Utility helpers**
- `_lighten(hex, frac)` and `_darken(hex, frac)` added to `services/utils.js`
  for computed solid button colours

### Changed
- `services/designTokens.js` — removed duplicate `FOCUS_RING` and `BTN` exports;
  added `TYPE` scale and tightened `SPACE` / `RADIUS` usage
- Username / form-action buttons (`btn-g.btn-warn-hover`) — universal steel blue
  `#3B6EA8` on hover across all themes (was amber/gold)
- Warm Vintage accent base updated to `#964B07` (consistent with button border spec)
- Nordic Save button: solid `#3D4758`; hover 15% lighter

### Internal
- `App.jsx`: `4,515` lines → `~1,680` lines (P7 frontend decomposition complete)
- All dialogs extracted to `src/dialogs/`
- Auth and settings state extracted to `src/hooks/useAuth.js`, `src/hooks/useSettings.js`
- Theme system centralised in `src/hooks/useTheme.js` (THEME_PRESETS registry exported)
- `src/pages/LoginScreen.jsx` and `ChangePasswordScreen.jsx` extracted
- `src/services/api.js` — typed API client; `fetch()` calls removed from App.jsx

---

## [2.6] — 2026-05-20

### Added — Frontend decomposition (P7)

`App.jsx` refactored from a 4,515-line monolith to a composable component tree.

**New files**
- `src/hooks/useTheme.js` — theme state (dark mode, accent, preset, view mode)
- `src/hooks/useAuth.js` — authentication state (login, logout, TOTP, backup codes)
- `src/hooks/useSettings.js` — settings state and save logic
- `src/services/api.js` — typed `api(path, options)` client replacing inline `fetch()`
- `src/services/designTokens.js` — design constants (SPACE, RADIUS, TYPE, STATUS_LABEL)
- `src/services/utils.js` — shared helpers: `_hexToRgba`, `_contrastOn`, `copyText`,
  `parseImage`, `stripBlackBackground`
- `src/services/categories.js` — category colour utilities
- `src/components/LogoSVG.jsx` — logo + LogoutIcon
- `src/components/Icon.jsx` — icon library (sun, moon, settings, refresh, …)
- `src/components/CardMenu.jsx` — card action dropdown (extracted from App.jsx)
- `src/components/AccentColorPicker.jsx`
- `src/components/AppIcon.jsx`
- `src/components/CategoryPopover.jsx`
- `src/components/ChannelPill.jsx`
- `src/components/Step2Body.jsx`
- `src/components/Step3Poll.jsx`
- `src/components/Tooltip.jsx`
- `src/components/TzSelect.jsx`
- `src/dialogs/SettingsDialog.jsx` — full settings workspace (837 lines extracted)
- `src/dialogs/HostWizard.jsx` — 4-step agent setup wizard
- `src/dialogs/AddAppDialog.jsx`
- `src/dialogs/HistoryDialog.jsx`
- `src/dialogs/ImportDialog.jsx`
- `src/dialogs/ImportAppsDialog.jsx`
- `src/dialogs/OverrideDialog.jsx`
- `src/dialogs/QuickEditDialogs.jsx`
- `src/dialogs/UpdateDialog.jsx`
- `src/dialogs/UpdateLogDialog.jsx`
- `src/pages/LoginScreen.jsx`
- `src/pages/ChangePasswordScreen.jsx`

### Changed
- `App.jsx` reduced to shell: routing between auth screens, topbar, toolbar, and
  the main grid/table views. All hook state wired via explicit props
- `submitChangePw` and `submitChangeUsername` moved to `api.js`
  (`postChangePw`, `postChangeUser`)
- No user-visible behaviour changes


## [2.4] — 2026-02-15

### Fixed
- Check interval configured in the UI is now preserved across container restarts.
  Previously, restarting the container silently reset the interval to the
  `CHECK_INTERVAL_HOURS` environment variable value, discarding any UI change.
- Telegram credentials set via environment variables (`TELEGRAM_TOKEN`,
  `TELEGRAM_CHAT_ID`) are now seeded into the database on first run. Previously,
  env var credentials had no effect unless the user also saved them in the Settings UI.
- `bookstack` now consistently auto-categorises to Productivity. Previously it
  could match Storage depending on keyword iteration order.
- `SESSION_LIFETIME_HOURS` documented correctly as an absolute session lifetime
  (not an idle timeout). Session expires N hours after login, not after inactivity.

### Internal
- Removed unused `flask-session==0.8.0` dependency (installed but never imported).
- Removed 6 dead functions: `utils.norm`, `utils.sort_key`, `utils.derive_status`,
  `utils.parse_image_name`, `utils.parse_compose_images`, `Host.check_token`,
  `hosts._check_token`, `ca.decrypt_cert_package`.
- Removed dead API endpoint `POST /api/scan-summary` (scan summaries are sent
  inline by the scheduler; this endpoint was never called).
- Added named string constants to `config.py` for session keys, Settings table
  keys, token format prefixes, and channel labels — eliminating repeated string
  literals across modules.
- `GITEA_TOKEN` documented in `.env.example` (also used for Forgejo and Codeberg).
- Frontend `package.json` version bumped to `2.3.0`.
- Duplicate `CH_LABELS` channel-label dict (defined twice in `scheduler.py`) replaced
  with a single canonical definition in `config.py`, imported where needed.
- Duplicate `_SKIP_TAGS` floating-tag set replaced with a single canonical
  `SKIP_TAGS` in `config.py`. The scheduler's 24-entry set is now used everywhere;
  the previous `apps.py` 13-entry subset is retired. Tags `lts`, `dev`, `canary`,
  `prod`, `production`, `trunk`, `head`, `preview`, `next`, `current`, `experimental`
  are now correctly identified as pinned in all code paths.
- `apps._derive_status()` updated to use canonical `SKIP_TAGS`.

### Configuration (v2.4)
- `check_interval_hours` is now seeded from `CHECK_INTERVAL_HOURS` env var on
  first run and stored in the database. On all subsequent restarts the database
  value is used, so UI-configured intervals are preserved across container restarts.
- `telegram_token` and `telegram_chat_id` are similarly seeded from env vars on
  first run. The database is authoritative after initial setup.
- `HOST.token_hash` column is no longer written on host create or token regenerate.
  The column exists but is `NULL` for all new hosts (migration v19). It will be
  dropped in a future migration. Authentication uses the AES-256-GCM encrypted
  token in the settings table exclusively.
- Legacy agent token formats (`plain:` prefix and bare-string) now log a warning
  on each use, prompting token regeneration to upgrade to AES-256-GCM.
- `SESSION_LIFETIME_HOURS` comment corrected: this is an absolute session lifetime,
  not an idle timeout.

### Schema
- Migration v19: `hosts.token_hash` made nullable via table rebuild. Existing
  token_hash values are preserved for installed hosts.

### Backend — v2.5 additional (route thinning / P6)
- Extracted `services/agent_client.py` from `routes/hosts.py`. Owns: mTLS
  context creation (`build_tls_context`), HTTP agent requests (`agent_request`),
  and agent health checks (`agent_health`). No Flask objects cross this boundary.
- Extracted `services/update_executor.py` from `routes/hosts.py`. Owns: compose
  patching, update execution (`execute_update`), revert execution
  (`execute_revert`), and update log writes (`_log_update`). Calls
  `services.agent_client` and `services.notifications` directly.
- `routes/hosts.py` reduced from 726 lines to 479 lines. Responsibilities:
  request validation, auth, token management, response generation.
- Token encryption/decryption stays in `routes/hosts.py` (requires Flask
  `current_app` for key derivation).
- All 14 API endpoints preserved with identical signatures and behavior.
- No user-visible changes.


### Backend — v2.5 (scheduler decomposition)
- Extracted `services/notifications.py` from `scheduler.py`. Owns: Telegram
  delivery, webhook delivery, template rendering, digest logic, scan summary,
  and update/revert action notifications.
- Extracted `services/version_checker.py` from `scheduler.py`. Owns: all
  registry fetchers (Docker Hub, GitHub, GitLab, Gitea, Quay), version
  comparison, tag classification, and the per-app check worker (`check_one`).
- `scheduler.py` reduced from 877 lines to 143 lines — orchestration only.
- Bug fixed: `_FLOAT_WORDS` was defined as a local variable inside `_semver_key`
  but referenced by `_smart_gte`, causing a `NameError` on every outdated-app
  comparison. Silently caught as a Worker error in production. Fixed by
  promoting to module level in `version_checker.py`.
- `routes/apps.py`, `routes/hosts.py`, `routes/settings.py` updated to import
  from `services/` instead of private scheduler functions.
- No user-visible behavior changes.


## [2.3] — 2026-04-14

### Security — Mutual TLS for agent communication

This release closes the last major security gap in the remote agent system.
All traffic between Vigil and its agents is now encrypted and mutually
authenticated using a Private CA model.

- **Private CA** — Vigil generates a self-signed CA on first start
  (`vigil-ca.key` + `vigil-ca.crt`). The private key never leaves the
  data volume. The CA signs all agent certificates.
- **Per-agent certificates** — 2048-bit RSA, 10-year lifetime, signed by
  Vigil's CA. Issued once per host during the wizard. The agent private
  key is generated in memory, encrypted, delivered, and immediately
  discarded — never stored by Vigil.
- **Encrypted certificate delivery** — the certificate package is encrypted
  with AES-256-GCM using a PBKDF2-derived key before transmission. Two
  independent secrets are required to decrypt it: an install token
  (single-use, 5-minute expiry) and a decryption key that never travels
  over the network — clipboard only.
- **Fingerprint verification** — after install, the agent's certificate
  fingerprint is shown in the terminal. The Vigil wizard fetches the same
  fingerprint and displays both side-by-side for the user to compare.
  Mismatching segments are highlighted in red. The host is only saved
  after explicit confirmation.
- **Public IP detection** — the wizard automatically detects non-RFC-1918
  host IPs and shows a prominent VPN recommendation before step 2.
- **Backwards compatible** — existing hosts without certificates continue
  to work over plain HTTP. A visible "⚠ Upgrade to TLS" badge appears on
  each unupgraded host in the Agents settings tab.
- **`install.sh` served from Vigil** — users can curl the installer
  directly from their Vigil instance (`curl .../agent/install.sh | bash`)
  rather than downloading from GitHub.

### Changed
- Wizard expanded from 3 to 4 steps: Name & IP → Install agent →
  Verify cert → Done.
- Step 2 now shows three separate copy fields: agent token, install token,
  and decryption key — each with individual copy buttons and feedback.
- Countdown timer in step 2 changes colour as time runs low
  (green → amber → red) and locks the form when expired.
- Agent health endpoint reports `version: 2.3` and `tls: enabled/disabled`.
- DB migration v18: `cert_fingerprint` and `tls_enabled` columns added to
  `hosts` table; new `install_tokens` table for short-lived provisioning.

### Known limitations
- Agent certificate lifetime is 10 years — automatic renewal not yet
  implemented.
- The TOFU window during initial provisioning carries residual risk on
  VPS deployments without a VPN. A VPN eliminates it.
  See SECURITY.md for full analysis.

---

## [2.0] — 2026-04-05

### Added — Remote agent system
- **`agent/vigil-agent.py`** — lightweight standalone Python agent (~300 lines) that runs on any LXC or VM. Exposes a minimal HTTP API for read, write, and restart operations. No SSH required.
- **`agent/install.sh`** — one-command installer. Sets up the agent as a systemd service, validates all user inputs (token format, IP address, port range), opens the firewall port via UFW, and explains every prompt with inline guidance.
- **Host management** — new Agents tab in Settings with a 3-step wizard: Name & IP → Install agent → Test & save. Manage multiple hosts from one dashboard.
- **Token system** — 64-hex tokens prefixed with `vigil-`, stored as bcrypt hashes in Vigil's DB and shown in plaintext only once. Regenerate at any time with immediate invalidation.
- **Path scoping** — agent enforces an `allowed_base` directory at install time. Any request to read or write outside that directory is rejected at the agent level.
- **Remote updates** — upload icon button (↑) appears on outdated cards when a host is linked. Vigil reads the compose file, patches the image tag, writes it back, and restarts the service via the agent.
- **Auto-update modes** — per-app: Off / Ask me (confirmation dialog) / Auto (notify) / Silent.
- **Automatic backup** — agent creates a timestamped backup in `.vigil-backups/` before every write. Keeps the last 10 backups per app, auto-prunes older ones.
- **Update log** — full audit trail per app accessible via the history icon in the card action row. Shows timestamp, version change, trigger source, and status.
- **Revert** — restore any previous backup from the update log. Shows a diff of what will change before confirming. Agent auto-reverts if the container fails to start after an update.
- **Post-connection guidance** — wizard step 3 shows a numbered checklist of what to do next once the agent is confirmed reachable.
- **Copy feedback** — copy buttons in the wizard turn green with a checkmark for 2 seconds after clicking, replacing the previous emoji-only approach.

### Added — UI improvements
- History icon button added to card action row: `↗ · 🤖 · 🗑 · 📁 · 🔔 · 📄 · ⋯`
- Update icon button in card action row (green upload icon) — replaces the old inline "Update now" text button
- `auto_update`, `host_id`, `service_name` fields in Edit card modal
- Domain field in Edit card modal (below Install Path)
- Clickable Current version field in all three views (grid, list, compact) to quickly edit version
- "Add domain in Edit this card" hint on ↗ button when no URL is set

### Changed
- Backend split from single `app.py` (1,260 lines) into modular `routes/` package
- `_BUILTIN_KEYWORDS` and seeding logic moved to `categories.py`
- Constants and rate limiter moved to `config.py`; shared helpers to `utils.py`
- Settings modal Agents tab added between Branding and Security
- Status badge `v1.0` → `v2.0`

### Fixed
- Install script bind address field now validates IP format and warns on invalid input
- Install script port field rejects non-numeric and out-of-range values
- Install script token field rejects anything not matching `vigil-[a-f0-9]{64}`
- Backup directory created with `parents=True` to handle nested paths correctly
- Copy buttons use React state instead of DOM mutation (innerHTML) — works correctly in all browsers
- "Ask me" auto-update mode now prompts a confirmation dialog before triggering any update
- Update history modal header is single-line, responsive, no wrapping on long app names



### Added
- **Remote agents** — lightweight Python agent (`agent/vigil-agent.py`) that runs on any LXC/VM and exposes a minimal HTTP API for read, write, and restart operations. No SSH required.
- **Agent installer** (`agent/install.sh`) — one-command installer that sets up the agent as a systemd service, configures path scoping, and optionally opens the firewall port.
- **Host management** — new Agents tab in Settings to add, edit, test, and remove remote hosts. Three-step wizard guides users through setup.
- **Token system** — each host gets a cryptographically random 32-hex token. Tokens are stored hashed in Vigil's DB (bcrypt) and shown plaintext only once. Regenerate at any time.
- **Path scoping** — agent enforces an `allowed_base` path set at install time. Any request to read/write outside that directory is rejected.
- **Remote updates** — "Update now" button on outdated cards when a host is linked. Vigil reads the compose file, patches the image tag, writes it back, and restarts the service via the agent.
- **Auto-update modes** — per-app setting: Off / Ask me / Auto (notify) / Silent.
- **Automatic backup** — agent creates a timestamped backup in `.vigil-backups/` before every write. Up to 10 backups kept per app.
- **Update log** — full audit trail per app (timestamp, versions, triggered by, status). Accessible via 📋 icon on any host-linked card.
- **Revert** — restore any previous backup from the update log. Shows a diff of what will change before confirming. Auto-reverts on restart failure.
- **Edit card: Remote host** — dropdown to link an app to a host, service name field for multi-service compose files, auto-update mode selector.
- **"Update now" button** — appears in grid, list, and compact table views when a host is linked and an update is available.

### Changed
- Settings modal now has an Agents tab between Branding and Security.
- `TrackedApp` DB model gains `host_id`, `service_name`, `auto_update` columns (migration v17).
- New `hosts` and `update_log` DB tables (migration v16).

Versions follow [Semantic Versioning](https://semver.org/) — `MAJOR.MINOR.PATCH`.

---

## [v1.0] — 2025 — Initial public release

This is the first public release of Vigil. The app is functional and
has been used in real self-hosted environments, but consider it alpha:
APIs may change, rough edges exist, and feedback is very welcome.

### Features shipped in vv1.0

**Core tracking**
- Docker Hub, GitHub Container Registry (ghcr.io), GitLab Registry, and custom registry support
- Configurable auto-check interval (default: every 6 hours)
- Manual "check now" per app or full-scan trigger from the dashboard
- Smart tag filtering — ignores `latest`, `nightly`, `edge`, `beta`, `stable`, etc.
- Version history per app
- Snooze (skip temporarily) or ignore (skip a specific version) per app

**Dashboard**
- Color-coded status chips: up-to-date · outdated · error · pinned · unknown
- Auto-categorisation into Media, Networking, Monitoring, Security, Storage, Database, DevOps
- Fully customisable categories (rename, recolor, add keywords, reorder)
- Custom icon per app (emoji picker or image upload)
- Notes and install path fields per app

**Import & Export**
- Paste any `docker-compose.yml` to bulk-import all images in one step
- Export full app list as JSON

**Notifications**
- Telegram bot integration (instant alerts + scan summaries)
- Webhook support (ntfy, Gotify, Discord, Slack, and anything that accepts a POST)
- Per-app notification policy: always · major only · mute
- Configurable scan summary digest

**Authentication & Security**
- bcrypt password hashing (cost factor 12)
- Forced password change on first login (default: admin/admin)
- TOTP two-factor authentication (RFC 6238 — Google Authenticator, Authy, etc.)
- 8 one-time backup codes, stored as SHA-256 hashes
- Rate limiting on auth endpoints (10 attempts / 60 s per IP, in-process)
- `SECURE_COOKIES` env var for HTTPS deployments behind a reverse proxy
- `ALLOWED_ORIGIN` env var for CORS lockdown

**Customisation**
- Custom app name and logo
- Custom CSS injection
- Dark UI throughout

**Operations**
- Single `docker compose up -d --build` deploy
- SQLite persistence via named Docker volume
- 11 incremental schema migrations (applied automatically on startup)
- Health check endpoint for Docker Compose dependency management

### Known limitations in vv1.0

- **Single-user only** — one admin account, no multi-user support
- **No CSRF tokens** — mitigated by `SameSite=Lax` + CORS but not formally protected
- **No audit log** — actions are not attributed or logged per-session
- **Frontend is a single file** — `App.jsx` is ~2,500 lines; will be modularised in a future release
- **No dark/light mode toggle** — dark only for now

---

## Roadmap (not committed, just thinking out loud)

- [ ] Light mode / theme switcher
- [ ] Multi-user support with role-based access
- [ ] CSRF protection
- [ ] Frontend split into components
- [ ] More registry sources (Quay.io, Amazon ECR public)
- [ ] Mobile-optimised layout improvements
- [ ] Notification channels: email, Pushover, Apprise
- [ ] REST API documentation (OpenAPI / Swagger)

---

*Have a feature idea or found a bug? [Open an issue](https://github.com/youruser/vigil/issues).*
