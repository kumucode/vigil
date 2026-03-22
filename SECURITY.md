# Security Model — Vigil

This document explains Vigil's security design, known limitations, and
recommendations for hardening your deployment.

---

## Authentication

| Mechanism | Details |
|---|---|
| Password hashing | bcrypt with a random salt (cost factor 12) |
| Session cookies | `HttpOnly`, `SameSite=Lax`; `Secure` flag set when `SECURE_COOKIES=true` |
| Rate limiting | Login, TOTP, and password-change endpoints are limited to **10 attempts / 60 s per IP** |
| Forced password change | The default `admin/admin` credential triggers a mandatory change on first login |
| TOTP 2FA | RFC 6238 (SHA-1, 30 s window, ±1 step clock drift tolerance), pure stdlib implementation |
| Backup codes | 8 one-time codes, stored as SHA-256 hashes — never in plaintext |

---

## What Vigil does NOT do

- **No multi-user support** — there is a single admin account. Anyone with the
  password has full access.
- **No CSRF tokens** — mitigated in practice by `SameSite=Lax` cookies and
  CORS restrictions, but not formally protected.
- **No audit log** — actions are not logged per-user.
- **No TLS termination** — Vigil speaks plain HTTP. TLS must be handled
  by a reverse proxy in front of it.

---

## Recommended deployment for internet exposure

1. Put Vigil behind a TLS-terminating reverse proxy
   ([Nginx Proxy Manager](https://nginxproxymanager.com/),
   [Traefik](https://traefik.io/), or [Caddy](https://caddyserver.com/)).

2. Set the following environment variables:

   ```env
   SECURE_COOKIES=true
   ALLOWED_ORIGIN=https://track.yourdomain.com
   ```

3. Enable TOTP 2FA in Settings → Security after your first login.

4. Consider restricting access to trusted IP ranges at the proxy level if
   Vigil is only used by you or a small team.

---

## Local-network-only deployments

If Vigil is only reachable on your LAN (e.g. `192.168.x.x:3000`),
the threat model is much lower.  You do not need a reverse proxy or TLS,
and `SECURE_COOKIES` can remain `false`.

Enabling TOTP 2FA is still recommended as a defence against accidental
exposure (e.g. a misconfigured router rule).

---

## Dependency surface

| Package | Purpose |
|---|---|
| Flask | HTTP framework |
| Flask-SQLAlchemy | ORM / SQLite access |
| Flask-CORS | Cross-origin request handling |
| APScheduler | Background version-check jobs |
| bcrypt | Password hashing |
| reportlab | QR code generation for TOTP setup |
| gunicorn | Production WSGI server |
| requests | Outbound HTTP to Docker Hub / GitHub / GitLab |
| PyYAML | docker-compose import parsing |

No authentication libraries (pyotp, authlib, etc.) are used — TOTP and
backup codes are implemented against the RFC using stdlib only.

---

## Reporting a vulnerability

Please open a GitHub issue marked **[SECURITY]** or contact the maintainer
directly.  Do not disclose security issues publicly until a fix is available.
