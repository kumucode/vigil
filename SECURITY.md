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

### 1. ~~Agent communication is plain HTTP~~ — Fixed in v2.3

As of v2.3, all traffic between Vigil and its agents uses **mutual TLS** — both sides present certificates signed by Vigil's Private CA, and both sides verify each other. The token travels inside the encrypted channel. A packet capture on the network shows only TLS handshakes and ciphertext.

**How it works:**

Vigil generates a Private CA on first start (`vigil-ca.key` + `vigil-ca.crt`), stored in the data volume. The CA private key never leaves Vigil. When a new agent host is added, Vigil issues a certificate for that specific agent, signed by its CA. The agent installer downloads an encrypted package containing three files — the CA cert, the agent cert, and the agent private key — using a short-lived install token (5 minutes, single-use) and a separate decryption key that never travels over the network.

**Certificate delivery security:**

Two secrets are required to decrypt the certificate package:

- **Install token** — shown in the Vigil wizard, travels in the installer request (single-use, 5 minutes)
- **Decryption key** — shown in the Vigil wizard, never transmitted — goes clipboard → terminal only

An interceptor who captures the network request gets an AES-256-GCM encrypted blob. Without the decryption key — which never left the user's clipboard — it is useless.

**Fingerprint verification:**

After the agent installs, its certificate fingerprint is shown in the terminal. The Vigil wizard shows the same fingerprint (fetched from the agent). The user compares them side-by-side — matching segments are highlighted green, mismatching ones red. This is the TOFU (Trust On First Use) model — the same approach SSH uses for host key verification. Once confirmed, all future connections are verified automatically against the pinned fingerprint.

**Backwards compatibility:**

Existing hosts added before v2.3 have no certificate. They continue to work over plain HTTP with a visible **⚠ Upgrade to TLS** badge in the Agents settings. Clicking it re-runs the provisioning wizard for that host.

**Remaining considerations:**

- The certificate lifetime is 10 years. This avoids expiry headaches for homelab users. Renewal is a future improvement.
- The TOFU window (seconds between installer running and user confirming the fingerprint in Vigil) is the moment of lowest security. On a LAN this risk is negligible. On a VPS without a VPN, a sophisticated attacker could theoretically intercept and substitute a certificate during this window.
- **For VPS deployments:** establish a VPN (WireGuard, Tailscale) between Vigil and the agent before running the installer. The certificate exchange then happens inside the encrypted tunnel — eliminating the TOFU window risk entirely.

**What to do:**
- LAN deployments: proceed as normal. The default setup is secure.
- VPS deployments: set up a VPN first, then add the agent through it. Keep port 7777 restricted to Vigil's IP only with your firewall.
- Always verify the fingerprint in step 3 of the wizard. If the fingerprints don't match — stop and investigate before proceeding.

---

### 2. ~~Agent token stored in plaintext in the database~~ — Fixed in v2.2

Previously, agent tokens were stored in plaintext in the SQLite `settings` table. As of v2.2, tokens are encrypted at rest using **AES-256-GCM** with a key derived from Flask's `SECRET_KEY` via SHA-256. The plaintext is decrypted in memory only when an outbound agent call is made, then immediately discarded.

**What this means:** If someone extracts the database file, they get ciphertext, not tokens. Without the `SECRET_KEY` (stored separately in `.secret_key` in the data volume), the tokens cannot be decrypted.

**What to do:** Protect your data volume. The `SECRET_KEY` file is as sensitive as the database itself — losing it means losing access to all stored agent tokens (they can be regenerated) but also means existing encrypted tokens are permanently unreadable.

---

### 3. No session idle timeout — Fixed in v2.2

Previously sessions persisted indefinitely until the browser closed or the user logged out. As of v2.2, sessions expire after **12 hours of inactivity** by default.

Configure via the `SESSION_LIFETIME_HOURS` environment variable in your `.env` file:
- `SESSION_LIFETIME_HOURS=12` — default, suitable for most home setups
- `SESSION_LIFETIME_HOURS=1` — tighter, good for internet-facing deployments
- `SESSION_LIFETIME_HOURS=168` — one week, for single-user machines where convenience matters more

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
- Python backend dependencies are pinned to exact versions but not yet verified with `--require-hashes`. Frontend dependencies are pinned to exact versions in `package.json`.
- No penetration testing has been performed. The findings in this document are from a self-conducted code review.
- Agent certificate lifetime is 10 years — automatic renewal is not yet implemented.
- The TOFU window during initial certificate provisioning carries residual risk on VPS deployments without a VPN. A VPN eliminates it.

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
| v2.3 | Mutual TLS for all Vigil ↔ agent communication — Private CA model, both sides authenticate |
| v2.3 | Private CA generated on first Vigil start — CA private key never leaves the data volume |
| v2.3 | Per-agent certificates issued and signed by Vigil's CA — 2048-bit RSA, 10-year lifetime |
| v2.3 | Certificate package encrypted with AES-256-GCM + PBKDF2 before delivery — safe over HTTP |
| v2.3 | Install token: single-use, 5-minute expiry, bcrypt-hashed in DB — never stored in plaintext |
| v2.3 | Decryption key never transmitted — clipboard only, derived via PBKDF2-HMAC-SHA256 |
| v2.3 | Fingerprint comparison UI — user verifies agent identity with per-segment mismatch highlighting |
| v2.3 | Public IP auto-detection — wizard shows VPN recommendation for non-RFC-1918 addresses |
| v2.3 | Backwards compatible — existing HTTP hosts get visible upgrade prompt, no forced breakage |
| v2.3 | `install.sh` served directly from Vigil — no third-party download needed |
| v2.2 | Agent tokens encrypted at rest with AES-256-GCM — key derived from `SECRET_KEY`, never stored |
| v2.2 | Session idle timeout — configurable via `SESSION_LIFETIME_HOURS` env var (default 12h) |
| v2.2 | Frontend dependencies pinned to exact versions — no `^` or `~` ranges |
| v2.2 | Backend `cryptography` package added and pinned — required for token encryption |
| v2.0 | Backup codes migrated from SHA-256 to bcrypt with backwards compatibility for existing installs |
| v2.0 | Agent token comparison uses `hmac.compare_digest` — constant-time, not vulnerable to timing attacks |
| v2.0 | Agent request body capped at 10 MB — oversized requests rejected before processing |
| v2.0 | YAML validation is now strictly required before agent writes — no fallback to unvalidated writes |
| v2.0 | URL fields validated server-side to only allow `http://` and `https://` schemes |
| v2.0 | Dedicated-user agent mode with systemd hardening (`NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`) |
| v2.0 | Root mode requires explicit typed confirmation with full risk disclosure |
| v1.1 | `app_url` domain field added — opens in new tab, never injected into page |
| v1.0 | bcrypt passwords (cost 12), TOTP 2FA, rate limiting, `HttpOnly`/`SameSite` session cookies |
