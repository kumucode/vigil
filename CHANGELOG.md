# Changelog

All notable changes to Vigil will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
