# Security

This document explains how Vigil handles security, what it protects against, what it doesn't, and what you should know before running it. It's written for everyone — beginners, homelab enthusiasts, and security engineers alike.

If you find a security issue, please read the [Reporting section](#reporting-a-security-issue) before opening a GitHub issue.

---

## The honest summary

Vigil is a self-hosted homelab tool. It is **not** designed to be exposed directly to the internet without additional hardening. It does the right things for a LAN-first tool — bcrypt passwords, 2FA, rate limiting, session protection — but it has known limitations we document openly below.

We'd rather tell you the truth than let you make uninformed decisions about what runs on your network.

---

## What Vigil protects

**Your login:**
- Passwords are hashed with bcrypt (cost factor 12). Even if someone extracts the database, cracking your password requires significant computational effort.
- TOTP two-factor authentication via any RFC 6238 app (Google Authenticator, Authy, etc.).
- 8 one-time backup codes, stored as bcrypt hashes. Never saved in plaintext.
- Login and TOTP endpoints are rate-limited to 10 attempts per 60 seconds per IP.
- Session cookies use `HttpOnly` and `SameSite=Lax` to prevent basic cross-site attacks.

**Your data:**
- All write operations are validated and length-capped on the backend.
- URL fields (`app_url`, `version_source_url`) only accept `http://` and `https://` — no `javascript:` or `file://` URIs.
- YAML files are validated with PyYAML before the agent writes them — no blind writes.

**The agent:**
- Every request to the agent requires a token. Token comparison uses constant-time `hmac.compare_digest` to prevent timing attacks.
- The agent only reads and writes files inside the `allowed_base` directory you set at install time. Requests for paths outside that directory are rejected at the agent level before any disk access.
- Request bodies are capped at 10 MB — oversized requests are rejected before processing.
- In dedicated-user mode, the agent runs as a system user with no shell, no home directory, no password, and no privileges beyond the `docker` group.
- Systemd hardening: `NoNewPrivileges=true`, `ProtectSystem=strict`, `PrivateTmp=true`, `ReadWritePaths` locked to only the necessary directories.

---

## Known limitations

We know about these. They are documented here so you can make informed decisions, not discovered later.

### 1. Agent communication is plain HTTP

Traffic between Vigil and the agent travels over HTTP, not HTTPS. This means:

- The agent token is sent in plaintext on every request.
- Anyone on the same network segment running a packet capture can intercept it.
- On a trusted home LAN behind a router, this risk is low.
- On any network you don't fully control, this is a real concern.

**What to do:** Keep Vigil and its agents on a trusted LAN or VLAN. Do not expose port 7777 to the internet. If you need agents on a remote host, use a VPN tunnel (WireGuard, Tailscale) between the two machines before connecting them.

**Roadmap:** Mutual TLS between Vigil and agents (planned for v2.1). The agent will generate a self-signed certificate on install; Vigil will pin the fingerprint when adding the host. No external CA required, no complexity for users.

---

### 2. Agent token stored in plaintext in the database

Vigil needs the plaintext agent token to include in outbound HTTP headers when calling the agent. That plaintext is stored in the SQLite database in the `settings` table under the key `host_<id>_token`.

This means: if someone can read your Vigil database file, they get all agent tokens in plaintext.

The bcrypt hash in the `hosts` table is used for a separate purpose (verifying tokens sent *to* Vigil from external callers) and does not protect the stored plaintext.

**What to do:** Protect your Vigil data volume with proper filesystem permissions. Do not expose the container's data directory. Treat the database file like you'd treat a file containing passwords.

**Roadmap:** Encrypt stored tokens at rest using a key derived from the `SECRET_KEY` (planned for v2.1).

---

### 3. No session idle timeout

Sessions persist until the browser closes or the user explicitly logs out. There is no automatic expiry after a period of inactivity.

**What to do:** Log out when you're done, especially on shared machines. Enable 2FA — a stolen session cookie is significantly less useful if the attacker also needs your authenticator app.

---

### 4. Docker group access is not rootless

The dedicated-user agent mode (`vigil-agent` user + `docker` group) is meaningfully better than running as root, but it is not fully unprivileged. A process in the `docker` group can start a privileged container and mount the host filesystem. This is a well-known Docker limitation — it's the same model used by Portainer, Watchtower, and every other Docker management tool.

**What this means in practice:**

- In dedicated-user mode: if someone steals the agent token, they can read and write files under your `allowed_base` path and restart Docker services. They cannot directly execute arbitrary shell commands on the host. The blast radius is bounded by Docker operations and the scoped filesystem path.
- In root mode: the blast radius is the entire host, with no containment. That's why we show a full risk warning when root mode is selected, require a `y` confirmation, and default to dedicated-user mode.

---

### 5. Single admin account — no privilege separation

Vigil has one user account. Whoever logs in has full control over everything, including all remote agents. There are no read-only or limited-scope accounts.

---

### 6. Rate limiter resets on container restart

The login rate limiter is in-process Python memory. Restarting the Vigil container resets all counters. This is a minor concern for a LAN-only tool — an attacker would need local Docker access to do this, at which point they have bigger problems to worry about — but worth knowing.

---

## Deployment recommendations

**LAN-only (home network, not exposed to internet):**
- Default settings are appropriate for this setup.
- Enable 2FA. It takes 30 seconds.
- Use dedicated-user mode for the agent.
- Change the default password on first login (Vigil forces this).

**Internet-facing:**
- Put Vigil behind a reverse proxy that handles HTTPS (Nginx Proxy Manager, Caddy, Traefik).
- Set `SECURE_COOKIES=true` and `ALLOWED_ORIGIN=https://yourdomain.com` in `.env`.
- Do not expose the agent port (7777) to the internet under any circumstances.
- Connect agents over a VPN (WireGuard, Tailscale) — not over the open internet.
- Enable 2FA without exception.

---

## What the agent can and cannot do

The agent is a small Python HTTP server (~300 lines). Here is the complete list of what it is capable of:

**Can do:**
- Read `docker-compose.yml` from any directory under `allowed_base`
- Write a validated new `docker-compose.yml` to any directory under `allowed_base`
- Run `docker compose up -d [service]` to restart a specific service or all services
- Create timestamped backups before every write
- Restore a previous backup

**Cannot do:**
- Execute arbitrary shell commands
- Read or write files outside `allowed_base`
- Access anything beyond what `docker compose` needs
- Communicate with anything other than the Vigil instance holding its token
- Persist any state of its own — it is fully stateless between requests

If you want to verify this yourself: the entire agent is `agent/vigil-agent.py`. It's around 300 lines of straightforward Python with no external dependencies beyond PyYAML. You can read the whole thing in ten minutes.

---

## How to harden further

**Change the default port:**
Set `PORT=3001` in your `.env`. Reduces exposure to automated scanners targeting port 3000.

**Restrict network access:**
Use your router or host firewall to limit which IPs can reach Vigil. Most home routers support this.

**Lock the data volume:**
```bash
chmod 700 /opt/vigil/data
```
The database, secret key, and all settings live here.

**Monitor agent activity:**
```bash
journalctl -u vigil-agent -f
```
Every read, write, and restart is logged with a timestamp.

**Rotate agent tokens periodically:**
Vigil → Settings → Agents → Regenerate. The old token is immediately invalidated.

**Keep Vigil updated:**
New releases fix issues as they're found. Update by pulling the latest release and rebuilding.

---

## What we haven't done yet

To be completely transparent:

- Vigil has not been audited by an independent security firm.
- Docker images are not scanned automatically in CI for base image vulnerabilities.
- Python and frontend dependencies are not yet pinned with hash verification.
- No penetration testing has been performed. The findings in this document are from a self-conducted code review.

We are a small open-source project. We document what we know, fix issues promptly, and tell you the truth. We are not claiming enterprise-grade security — if that's what you need, this is probably not the right tool. If homelab-grade, honestly documented security is enough for your use case, Vigil tries hard to get that right.

---

## Reporting a security issue

**Please do not open a public GitHub issue for security vulnerabilities.** Issues are visible to everyone and could expose other users before a fix is available.

Report privately via GitHub's built-in security reporting:

**GitHub → Security tab → "Report a vulnerability"**

We will acknowledge within 48 hours and aim to release a fix within 14 days for critical issues. Please include a description of the issue, its potential impact, and steps to reproduce if applicable. We will credit you in the changelog unless you prefer to stay anonymous.

---

## Security changelog

| Version | Change |
|---|---|
| v2.0 | Backup codes migrated from SHA-256 to bcrypt with backwards compatibility for existing installs |
| v2.0 | Agent token comparison uses `hmac.compare_digest` — constant-time, not vulnerable to timing attacks |
| v2.0 | Agent request body capped at 10 MB — oversized requests rejected before processing |
| v2.0 | YAML validation is now strictly required before agent writes — no fallback to unvalidated writes |
| v2.0 | URL fields validated server-side to only allow `http://` and `https://` schemes |
| v2.0 | Dedicated-user agent mode with systemd hardening (`NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`) |
| v2.0 | Root mode requires explicit typed confirmation with full risk disclosure |
| v1.1 | `app_url` domain field added — opens in new tab, never injected into page |
| v1.0 | bcrypt passwords (cost 12), TOTP 2FA, rate limiting, `HttpOnly`/`SameSite` session cookies |
