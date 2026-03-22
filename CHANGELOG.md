# Changelog

All notable changes to Vigil will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
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
