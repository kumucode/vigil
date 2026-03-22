<div align="center">

<img src="https://raw.githubusercontent.com/youruser/vigil/main/frontend/public/logo.svg" alt="Vigil logo" width="72" height="72"/>

# Vigil

**Never miss a Docker update again.**

Self-hosted · Dark UI · 2FA · Telegram alerts · Zero cloud dependency

[![Version](https://img.shields.io/badge/version-1.0-e0a83c.svg)](./CHANGELOG.md)
[![Status](https://img.shields.io/badge/status-alpha-e05c5c.svg)](#alpha-notice)
[![License: MIT](https://img.shields.io/badge/License-MIT-5865F2.svg)](./LICENSE)
[![Docker Compose](https://img.shields.io/badge/deploy-docker%20compose-2496ED.svg)](./docker-compose.yml)
[![Python](https://img.shields.io/badge/backend-Python%203.11%2B-3776AB.svg)](./backend)
[![React](https://img.shields.io/badge/frontend-React%2018-61DAFB.svg)](./frontend)

</div>

---

> **⚠️ Alpha release — vv1.0**
>
> Vigil is functional and has been tested in real self-hosted environments,
> but it is still early software. You may encounter rough edges. If you do,
> [open an issue](https://github.com/youruser/vigil/issues) — that's exactly
> how alpha software gets better. Core data (your app list, settings, categories)
> is persisted in SQLite and will survive updates.

---

## What is this?

Vigil is a lightweight, self-hosted dashboard that watches your Docker images and tells you when updates are available — before you find out the hard way that you've been running a six-month-old version of something important.

You add your apps once (or paste a `docker-compose.yml` to import them all at once), and Vigil handles the rest: checking Docker Hub, GitHub Container Registry, GitLab, and custom registries on a schedule, then alerting you via Telegram or webhook the moment something new drops.

Everything runs on your own hardware. No accounts, no subscriptions, no data leaving your server.

---

## Who is this for?

**You run self-hosted services.** Whether it's five containers or fifty — Jellyfin, Nextcloud, Vaultwarden, Portainer, Grafana, or anything else — keeping track of which ones are up to date quickly becomes a spreadsheet problem. Vigil solves that.

You do not need to be a developer to use it. If you've ever run `docker compose up -d`, you can deploy and use Vigil.

---

## Why does it matter?

Outdated containers are one of the most common and preventable sources of vulnerabilities in self-hosted setups. Most people update reactively — after something breaks, or after a security notice surfaces somewhere. Vigil makes it proactive.

Beyond security, it's just convenient. One glance at the dashboard tells you the full picture: what's current, what's outdated, what errored out, and what you've deliberately pinned.

---

## Features

### Dashboard
- Color-coded status for every app: ✅ up-to-date · 🔴 outdated · ⚠️ error · 📌 pinned
- Current version vs latest version, side by side
- Full version history per app
- Snooze an update (skip it for now) or ignore a specific version permanently
- Manual "check now" per app, or trigger a full scan from the dashboard

### Tracking
- **DockerHub** — official and community images
- **GitHub Container Registry** (ghcr.io)
- **GitLab Registry**
- **Custom / private registries** via configurable URLs
- Smart tag filtering — ignores meaningless tags like `latest`, `nightly`, `edge`, `beta`, `stable` and focuses on real version numbers

### Organisation
- Auto-categorises apps on import (Media, Networking, Monitoring, Security, Storage, Database, DevOps)
- Fully customisable categories — rename, recolor, add keywords, reorder
- Add notes and install paths per app for your own reference
- Custom emoji or uploaded icon per app

### Notifications
- **Telegram** — instant alerts when an update is available
- **Webhooks** — works with ntfy, Gotify, Discord, Slack, and anything that accepts a POST
- Per-app notification policy (always · only major · mute)
- Scan summary digest — a single daily message listing everything that needs attention

### Import & Export
- Paste any `docker-compose.yml` and all images are imported in one click
- Export your full app list as JSON for backup or migration
- Auto-detection of image name, version tag, and category on import

### Security
- bcrypt password hashing (cost factor 12)
- TOTP two-factor authentication (Google Authenticator, Authy, any RFC 6238 app)
- 8 one-time backup codes, stored as SHA-256 hashes — shown once, never in plaintext
- Rate-limited login and TOTP endpoints (10 attempts / 60 seconds per IP)
- `SECURE_COOKIES` flag for HTTPS deployments behind a reverse proxy
- No third-party auth libraries — TOTP implemented directly against RFC 6238 using stdlib

### Customisation
- Rename the app and upload your own logo
- Inject custom CSS — restyle anything
- Configurable check interval (default: every 6 hours)

---

## Getting started

### Requirements

- Docker and Docker Compose (v2) installed on your server
- That's it

### Deploy in 3 steps

```bash
# 1. Get the code
git clone https://github.com/youruser/vigil /opt/vigil
cd /opt/vigil

# 2. Create your config file (everything is optional to start)
cp .env.example .env

# 3. Build and launch
docker compose up -d --build
```

Open **http://your-server-ip:3000** in a browser.

**Default login: `admin` / `admin`**
You will be asked to set a new password immediately on first login.

---

### Configuration

All settings live in your `.env` file. Nothing requires a rebuild to change.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | The port you'll open in your browser |
| `CHECK_INTERVAL_HOURS` | `6` | How often Vigil polls for updates |
| `TELEGRAM_TOKEN` | — | Bot token from [@BotFather](https://t.me/botfather) |
| `TELEGRAM_CHAT_ID` | — | Your chat ID from [@userinfobot](https://t.me/userinfobot) |
| `GITHUB_TOKEN` | — | Raises GitHub API rate limit from 60 → 5,000 req/hr |
| `GITLAB_TOKEN` | — | For private GitLab registry access |
| `GITEA_TOKEN` | — | For Gitea / Forgejo registry access |
| `SECURE_COOKIES` | `false` | Set `true` when using a reverse proxy with HTTPS |
| `ALLOWED_ORIGIN` | `*` | Lock CORS to your domain, e.g. `https://track.example.com` |

---

### Exposing it to the internet

Vigil is designed to run behind a reverse proxy that handles HTTPS. It does not terminate TLS itself — that's intentional, keeping the codebase lean and letting you use whichever proxy you prefer.

Popular choices in the self-hosted community:

| Proxy | Best for | Notes |
|---|---|---|
| [**Nginx Proxy Manager**](https://nginxproxymanager.com/) | Beginners | GUI-driven, free SSL via Let's Encrypt in a few clicks |
| [**Traefik**](https://traefik.io/) | Docker-heavy setups | Label-based config, automatic certificate renewal |
| [**Caddy**](https://caddyserver.com/) | Simplicity | One-line config, automatic HTTPS by default |

Once your proxy handles HTTPS, add two lines to your `.env`:

```env
SECURE_COOKIES=true
ALLOWED_ORIGIN=https://track.yourdomain.com
```

This ensures session cookies are only sent over encrypted connections and that
your browser won't accept API responses from unexpected origins.

> **LAN only?** If Vigil is only accessible on your home network
> (e.g. `192.168.1.x:3000`), you don't need any of this. Just run it and use it.

---

## Things to pay attention to

**Change the default password immediately.**
Vigil forces this on first login, but worth saying explicitly. `admin/admin` is the starting point, not a valid credential.

**Enable 2FA.**
It takes 30 seconds and adds a meaningful layer of protection, especially if the dashboard is accessible over the internet. Go to Settings → Security after logging in.

**Save your backup codes.**
When you enable 2FA, you'll be shown 8 one-time backup codes. Download or copy them somewhere safe (a password manager is ideal). These are the only way back in if you lose access to your authenticator app — they are not stored in a recoverable form on the server.

**Add a GitHub token if you track many ghcr.io images.**
Without a token, GitHub's API allows 60 unauthenticated requests per hour. If you're tracking more than a handful of GitHub-hosted images, you'll hit this limit quickly. A read-only personal access token raises it to 5,000/hr.

**Don't expose it without HTTPS if you can avoid it.**
Plain HTTP means your session cookie travels unencrypted. On a trusted LAN this is a reasonable risk. On the open internet, it isn't — set up a reverse proxy first.

**Vigil is single-user by design.**
There is one admin account. It's built for personal or small-team self-hosted use, not as a multi-tenant service.

---

## Project layout

For anyone curious about the internals or looking to contribute:

```
vigil/
│
├── frontend/                   React 18 + Vite
│   └── src/App.jsx             Single-file SPA (~2,500 lines)
│
├── backend/                    Python 3.11 + Flask
│   ├── app.py                  All API routes, auth, rate limiting, input validation
│   ├── models.py               SQLAlchemy models — User, TrackedApp, Category, Settings
│   ├── migrations.py           11 incremental SQLite schema migrations
│   ├── scheduler.py            APScheduler background jobs + registry polling logic
│   └── requirements.txt        ~10 dependencies, intentionally minimal
│
├── nginx/default.conf          Thin reverse proxy (frontend ↔ backend routing)
├── docker-compose.yml          Single-command deploy
├── .env.example                Annotated config template
├── SECURITY.md                 Security model, known limitations, hardening guide
└── README.md                   You are here
```

The backend is ~1,200 lines of plain Flask with no magic frameworks. The frontend is a single JSX file. Both are deliberately readable — if you know Python and React basics, you should be able to follow the code without a guided tour.

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18 + Vite | Fast dev experience, minimal build output |
| Backend | Python / Flask | Readable, low ceremony, easy to contribute to |
| Database | SQLite | Zero-config, single file, perfect for personal deployments |
| Auth | bcrypt + sessions | No external auth service required |
| Background jobs | APScheduler | In-process, no Redis or message queue needed |
| Proxy | Nginx (Alpine) | Tiny, fast, handles the frontend/API split cleanly |

No Kubernetes. No microservices. No message queues. No external databases. The entire stack runs in four containers and fits comfortably on a $5 VPS.

---

## Security

See **[SECURITY.md](./SECURITY.md)** for the full security model: what's protected, what isn't, and how to harden your deployment.

Short version: Vigil does the right things for a single-user self-hosted app (bcrypt, secure cookies, rate limiting, 2FA with backup codes). It does not pretend to be an enterprise-grade multi-tenant system. Know what you're running.

---

## Development setup

Want to run it locally outside Docker, make changes, or just explore:

```bash
# Backend
cd backend
pip install -r requirements.txt
mkdir -p ./data
DATA_DIR=./data python app.py
# API available at http://localhost:5000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
# UI at http://localhost:5173 — proxies /api/* to :5000 automatically
```

---

## Contributing & community

Vigil started as a personal tool to solve a real itch — keeping track of 30+ self-hosted containers without losing the plot. If you've found it useful, have ideas, or spotted something broken, you're warmly welcome here.

**Ways to get involved:**

- 🐛 **Found a bug?** Open an issue with what you expected vs what happened, and your deployment context (Docker version, OS, browser). A screenshot goes a long way.
- 💡 **Have an idea?** Open an issue and describe the use case. Features get built when the problem is clearly understood, not just when someone asks nicely.
- 🔧 **Want to contribute code?** Fork the repo, make your change, and open a pull request. There's no style guide beyond "match the existing code". Small focused PRs get reviewed faster.
- 🔒 **Security issue?** Please don't open a public issue — see [SECURITY.md](./SECURITY.md) for how to report it responsibly.
- ⭐ **Like the project?** A GitHub star helps other self-hosters find it.

You don't need to be a developer to contribute. Clear bug reports, well-described feature ideas, and documentation improvements are just as valuable as code.

---

<div align="center">

Made for the self-hosted community · MIT License

*If something's broken, confusing, or missing — that's a bug worth reporting.*

</div>
