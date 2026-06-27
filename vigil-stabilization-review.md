# Vigil — Architecture Stabilization Review
**Version:** v2.3 baseline / post-v2.6 roadmap  
**Step:** 7 of the Architecture Stabilization Program  
**Scope:** Governance and validation review. No code was modified.  
**Evidence source:** Steps 1–6 findings only.

---

## Report 1 — Goal Validation

The program was initiated against four stated objectives. Each is evaluated across the roadmap timeline.

---

### Objective 1 — Public GitHub Ready

**Definition:** The repository can be published publicly without embarrassment, security risk to users, or contributor confusion. New contributors can understand the codebase and contribute safely.

| State | Assessment |
|-------|-----------|
| **Current (v2.3)** | **Not ready.** Three blockers: (1) README contains placeholder GitHub URLs (`youruser/vigil`, `username/vigil`). (2) No LICENSE file exists — the README badge claims MIT but no `LICENSE` file is present in the repository. (3) No `.github/` directory — no issue templates, no pull request template, no contributing guidelines. Additionally, the 4,515-line `App.jsx` monolith and 877-line `scheduler.py` with 10 mixed concerns are hostile to new contributors. |
| **After v2.4** | **Improved but not ready.** Documentation fixes (GITEA_TOKEN, SESSION_LIFETIME_HOURS comment, package.json version) applied. Dead code removed. Cleaner codebase but the structural blockers remain: no LICENSE, placeholder URLs, no `.github/`, and the frontend monolith is untouched. |
| **After v2.5** | **Improved.** Backend is significantly more navigable: `scheduler.py` is ~100 lines, `routes/hosts.py` is ~350 lines, three clean `services/` modules exist. A contributor reading the backend can now understand each module's scope. Still no LICENSE, still no `.github/`, frontend still a monolith. |
| **After v2.6** | **Conditionally ready.** Frontend decomposed into 25 files — a contributor can now find the component they need to change. The architecture is clean, modules are well-scoped, dead code is gone. **Remaining blockers:** LICENSE file, placeholder GitHub URLs, `.github/` directory with issue/PR templates, CONTRIBUTING.md. These are outside the roadmap scope. |

**Remaining gaps:**
- LICENSE file is absent — this is a hard blocker for any open-source claim
- `README.md` contains `github.com/youruser/vigil` and `github.com/username/vigil` placeholders
- No `.github/` directory (issue templates, PR template, CONTRIBUTING.md)
- README still carries the `⚠️ Alpha release — vv1.0` warning despite the software being at v2.3 with a mature feature set
- No OpenAPI spec or API documentation for contributors adding new endpoints

**Verdict:** The roadmap is necessary but not sufficient for public GitHub readiness. Four non-code items must be addressed separately.

---

### Objective 2 — Production Ready (Self-Hosted)

**Definition:** A technically capable homelab user can deploy Vigil, trust it to run reliably, recover from failures, and understand what it is doing.

| State | Assessment |
|-------|-----------|
| **Current (v2.3)** | **Partially ready.** Vigil is deployed in production by the maintainer on real homelab hardware. Core tracking, notifications, mTLS agent communication, and authentication are functional and correctly implemented. However: the check interval restart bug (RISK-08) silently discards user-configured values on restart; no `install_tokens` pruning means the table grows indefinitely; no `update_log` retention policy; SQLite running without WAL mode under 10 concurrent threads (RISK-17). |
| **After v2.4** | **More ready.** The check interval restart bug and Telegram credential drift are fixed. These were the two most user-impactful reliability issues. `install_tokens` growth and `update_log` retention remain unaddressed. |
| **After v2.5** | **No change to production readiness.** v2.5 is an internal refactor with zero behavior change. |
| **After v2.6** | **Same as v2.5 for production readiness.** The frontend decomposition does not affect backend reliability. |

**Remaining gaps after v2.6:**
- `install_tokens` table grows unbounded (RISK-06): used/expired tokens never deleted
- `update_log` has no retention policy (RISK-07)
- SQLite without WAL mode under 10 concurrent reader threads (RISK-17): risk of `database is locked` errors during heavy concurrent checks
- Notification failures are silent (RISK-25): a Telegram API outage produces a log warning but no visible signal in the UI
- Scheduler fires immediately on every restart (RISK-26): if the container restarts during a check cycle, it fires again instantly, potentially sending duplicate notifications
- `SECRET_KEY` loss silently invalidates all agent tokens with no recovery path in the UI (RISK-10) — documented in SECURITY.md but no operational mitigation
- `app_logo` and `icon_data` cause potentially large payloads on every `/api/settings` and `/api/apps` response (RISK-20, RISK-21) — no lazy loading

**Verdict:** v2.4 is the significant production improvement milestone. v2.6 does not materially change production readiness. Six reliability issues remain after roadmap completion and require a separate work track.

---

### Objective 3 — Portainer Compatible

**Definition:** A user can deploy Vigil as a Portainer Stack using the included `docker-compose.yml` without modification.

| State | Assessment |
|-------|-----------|
| **Current (v2.3)** | **Partially compatible.** The compose file uses `build:` directives for `frontend` and `backend` services. Portainer Stacks support `build:` contexts when deploying from a Git repository, but not when deploying from a raw compose file pasted into the Portainer UI. This is the primary compatibility issue. The `nginx` service uses a pre-built image (`nginx:1.27-alpine`) and is compatible. Named volumes, health checks, `unless-stopped` restart policies, and environment variable pass-through are all Portainer-compatible. |
| **After v2.6** | **Same.** The roadmap does not change the compose file structure. The `build:` vs `image:` question is unaddressed. |

**Portainer strengths (post-roadmap):**
- Named volume `tracker-data` survives container re-creates — correct Portainer pattern
- `restart: unless-stopped` works correctly in Portainer
- `depends_on` with health check conditions is supported by Portainer
- Environment variables map correctly to Portainer Stack env var UI
- Health check endpoint (`/api/health`) is clean and reliable
- Three-container design (nginx, frontend, backend) is a natural Portainer Stack topology

**Portainer weaknesses (post-roadmap):**
- `build:` directives require the full source code to be present at deploy time, or a Git repository URL in Portainer's stack configuration
- No pre-built Docker Hub images (`docker pull vigil/vigil`) — users cannot deploy without building
- The `nginx/default.conf` volume mount (`./nginx/default.conf:ro`) requires a relative path — works in Portainer Git-based stacks, may require adjustment for file-upload stacks
- No `image:` fallback that points to a published registry

**Remaining gap:** Portainer native compatibility requires either (a) published Docker Hub images for `frontend` and `backend`, or (b) documentation confirming the Git-repository deployment path in Portainer. The roadmap does not address this. It is a publishing/CI-CD concern, not a code concern.

**Verdict:** Portainer-compatible via Git repository method. Not compatible via the simpler paste-compose-YAML method. Roadmap does not close this gap.

---

### Objective 4 — Maintainable Long-Term

**Definition:** A small maintenance team (1–2 developers) can understand, modify, and extend the codebase without fear of cascading breakage.

| State | Assessment |
|-------|-----------|
| **Current (v2.3)** | **Poor.** Complexity hotspots actively obstruct maintenance: 4,515-line `App.jsx` (Step 4 R9), 877-line `scheduler.py` (10 concerns), 760-line `routes/hosts.py` (11 concerns). The black-screen bug was directly caused by the hooks-ordering fragility of the monolith. 7 duplicate logic groups mean a fix in one copy does not propagate to another. 3 dual-source config scenarios create silent runtime bugs. |
| **After v2.4** | **Improved.** Dead code removed, duplicates consolidated, config drift fixed. The codebase is cleaner but the structural complexity remains: `scheduler.py` and `hosts.py` are still monolithic. |
| **After v2.5** | **Significantly improved.** Backend structure matches the target architecture. Each module has one concern. The dependency direction is clean. A maintainer can open `services/notifications.py` and understand the entire notification system. `scheduler.py` is 100 lines. `routes/hosts.py` is 350 lines. |
| **After v2.6** | **Substantially maintained.** Frontend is decomposed. A maintainer can open `components/apps/AppEditModal.jsx` and see exactly the edit form, nothing else. The `CardMenu` hooks violation is fixed, preventing a class of future React bugs. New features can be added in the right place (the correct module) rather than appended to the monolith. |

**Remaining gaps after v2.6:**
- `auto_update` field remains partially implemented — any maintainer touching update logic must understand that `auto` and `silent` modes are stored but never executed
- `triggered_by` dead values (`"schedule"`, `"telegram"`) are tracked (CC-29) but not resolved — future maintainers must know these are aspirational
- `container_id` field name is semantically incorrect (stores a label, not a container ID) — misleads maintainers unfamiliar with the history
- No automated test suite — all regression checking is manual
- The implicit API contract (`to_dict()` shape drives the frontend) is undocumented

**Verdict:** The roadmap achieves maintainability. v2.5 is the critical milestone. v2.6 completes it for the frontend. Residual documentation gaps are the only meaningful remaining issue.

---

### Objective 5 — Easy Future Feature Development

**Definition:** Adding a new feature (e.g., a new notification channel, a new registry, a new UI page) does not require understanding the entire codebase.

| State | Assessment |
|-------|-----------|
| **Current (v2.3)** | **Difficult.** Adding a new registry channel requires: touching `scheduler.py` (877L), updating `CH_LABELS` in **two** places in the same file, and updating `CHANNEL_META` in `App.jsx` (4,515L). Adding a notification channel (e.g., ntfy) requires finding the notification logic buried inside `run_version_checks()` in `scheduler.py`. |
| **After v2.6** | **Straightforward.** Adding a new registry: add a fetcher to `services/version_checker.py`, add to `resolve_latest_version()` routing, add to `config.CH_LABELS`, add to `CHANNEL_META` in `constants.js`. Adding a notification channel: add `send_ntfy()` to `services/notifications.py`, add settings keys, add to `dispatch_notifications()`. No other files need changing. |

**Verdict:** The target architecture provides clean extension points. This objective is substantially met by v2.6.

---

## Report 2 — Roadmap Completeness Review

### Missing Work

The roadmap is scoped to architectural stabilization (dead code, duplication, configuration, module structure, frontend decomposition). It explicitly does not address feature bugs, security improvements, or reliability items beyond what overlaps with architecture. The following items are absent from the roadmap and should be tracked separately.

**Missing from roadmap — not blockers for releasing v2.4:**

| Item | Evidence | Risk |
|------|---------|------|
| LICENSE file creation | Confirmed absent in filesystem check | **Blocker for public GitHub** |
| README placeholder URL cleanup | `youruser/vigil`, `username/vigil` in README.md | Blocker for public GitHub |
| `.github/` directory | Confirmed absent | Required for contributor experience |
| `install_tokens` pruning | RISK-06; table grows indefinitely | Production reliability |
| `update_log` retention | RISK-07; no auto-pruning | Production reliability |
| `/api/agent-provision` rate limiting | RISK-05; public endpoint with no rate limit | Security |
| Docker Hub rate limit handling | RISK-16; 429/401 not detected, no backoff | Reliability |
| SQLite WAL mode | RISK-17; 10 concurrent threads, no WAL | Reliability |
| Notification failure visibility | RISK-25; silent log warning only | Operational |
| TOTP secret encryption | RISK-04; stored plaintext unlike agent tokens | Security |
| Portainer image publishing | No pre-built images | Portainer gap |

**Missing from roadmap — deliberate architecture decisions:**

| Item | Decision | Rationale |
|------|---------|-----------|
| `auto_update` scheduler implementation | Deferred (CC-29 tracked) | Out of scope for stabilization |
| `reportlab` replacement | Not in roadmap | Improvement, not blocking |
| `container_id` field rename | Not in roadmap | Would require migration and UI change |
| Certificate renewal | Not in roadmap | 10-year lifetime is acceptable for homelab |
| Multi-user support | Explicitly out of scope | Enterprise requirement |

### Missing Migration Work

The roadmap includes migration v19 (nullable `token_hash`) and defers v20 (drop column). No other migrations are needed for the roadmap scope. However, there is one gap: the roadmap does not include a migration to add a `created_at` timestamp or `expired_at` index on `install_tokens`, which would be needed for the pruning mechanism when that is eventually implemented. This is a minor gap — the schema can accommodate pruning queries without an index, at the cost of a full table scan on a typically small table.

### Missing Testing Requirements

The testing strategy (Step 6 Report 8) is adequate for manual verification. However, it does not cover:

- **Regression test for the `check_interval_hours` seeding logic** (the highest-risk behavior change in the roadmap): specifically, the case where a user has a non-default interval configured, restarts after v2.4, and expects the configured value to be preserved. This case must be explicitly documented as a verification step and verified on a real database with a pre-existing `check_interval_hours` value.
- **Version comparison edge cases**: Phase 3 upgrades `norm()` to lowercase + strip-v + collapse whitespace. The testing checklist verifies `latest` and `nightly` tags but does not verify capitalized tags (e.g., `V1.2.3`, `Release-1.2.3`). These exist in the wild and the new `norm()` behavior handles them differently from the old `apps._norm()`.
- **Frontend accessibility**: No accessibility testing is included.

### Missing Documentation Requirements

- No `CONTRIBUTING.md` — required before public GitHub visibility
- No OpenAPI/Swagger spec for the backend API
- `CHANGELOG.md` entries for v2.4, v2.5, v2.6 are sketched in the execution plan but not created
- `README.md` alpha notice is stale — the software has shipped three major versions and is running in production

### Missing Deployment Requirements

- No CI/CD pipeline definition (GitHub Actions)
- No Docker Hub image publishing workflow
- No automated image vulnerability scanning
- No `docker-compose.override.yml` example for development mode

---

## Report 3 — Remaining Architectural Risks

*All risks below assume v2.6 is completed exactly as designed.*

---

### RISK-04 — TOTP Secret Stored Plaintext
**Description:** `users.totp_secret` is stored unencrypted in the SQLite database. Agent tokens receive AES-256-GCM encryption using `SECRET_KEY`; TOTP secrets do not.  
**Impact:** An attacker who extracts the database file can derive the TOTP key directly without cracking. Combined with a stolen password hash, this fully compromises 2FA.  
**Likelihood:** Low (requires database file access, which requires compromising the host).  
**Severity:** High — 2FA is rendered ineffective if the DB is extracted.  
**Classification: Medium** (low probability, high impact, acceptable for self-hosted LAN deployment).

---

### RISK-05 — `/api/agent-provision` Has No Rate Limiting
**Description:** The agent provisioning endpoint is public (no session required) and has no rate limiting. An attacker can make unlimited bcrypt verification attempts against install tokens.  
**Impact:** Increases the practical speed of a brute-force attack against install tokens. Install tokens are short (40 chars, `install-` + 32 hex chars) — though cryptographically random, unlimited attempts against the bcrypt hash is worse than rate-limited attempts.  
**Likelihood:** Low (requires knowledge of the endpoint, only relevant during active provisioning windows).  
**Severity:** Medium (install tokens are 5-minute TTL and single-use, which significantly limits the attack window).  
**Classification: Low** (TTL mitigates the exposure; low probability for a LAN-deployed tool).

---

### RISK-06 — `install_tokens` Table Grows Unbounded
**Description:** Used and expired tokens are marked `used=True` and never deleted. On installations with frequent agent reprovisioning, the table accumulates indefinitely.  
**Impact:** Minor performance degradation over months/years; no functional failure until the table becomes large enough to affect query times (unlikely in homelab scale, but untidy).  
**Likelihood:** Low in practice (most users provision a handful of agents).  
**Severity:** Low.  
**Classification: Low**.

---

### RISK-07 — `update_log` Has No Retention Policy
**Description:** Update log entries accumulate indefinitely with no auto-pruning.  
**Impact:** On installations with frequent automated updates (once `auto_update` is implemented), the log could grow significantly. Currently limited to manual updates only.  
**Likelihood:** Low currently (manual updates only). Becomes Medium if `auto_update` is implemented.  
**Severity:** Low (no functional failure; only disk and query performance).  
**Classification: Low**, rising to **Medium** if `auto_update` automation is implemented.

---

### RISK-10 — `SECRET_KEY` Loss Invalidates All Agent Tokens
**Description:** The Flask `SECRET_KEY` is used as the basis for AES-256-GCM token encryption. Loss of `/data/.secret_key` makes all stored agent tokens permanently unreadable. The only recovery path is to regenerate tokens for all agents, which requires physical or VPN access to each agent host.  
**Impact:** Loss of all agent connectivity on database restore without the key file. No data loss, but operational disruption.  
**Likelihood:** Low (requires specific disaster scenario: DB backup restored without the key file).  
**Severity:** Medium (recoverable but disruptive).  
**Classification: Medium** — the operational risk is real and undocumented outside SECURITY.md. No UI warning exists when backing up.

---

### RISK-12 — `auto_update` Feature is Misleading
**Description:** The UI offers four `auto_update` modes: Off / Ask / Auto / Silent. `Off` and `Ask` are enforced client-side only (a determined user bypassing the frontend can still call `POST /api/apps/<id>/update`). `Auto` and `Silent` are stored but never acted upon — the scheduler never reads `auto_update`.  
**Impact:** Users setting `Auto` mode expect automatic updates. They will not receive them. This is a silent UX failure.  
**Likelihood:** Certain for any user who reads the UI and sets `Auto` mode.  
**Severity:** Medium (no data loss; the app continues to track versions correctly; but the advertised behavior does not occur).  
**Classification: Medium** — a feature contract is broken. This requires either implementation or explicit deprecation.

---

### RISK-13 — `triggered_by` Has Two Dead Values
**Description:** The `UpdateLog.triggered_by` field declares `"user"`, `"schedule"`, and `"telegram"` as valid values in a schema comment. Only `"user"` is ever written. The other two values represent unimplemented features.  
**Impact:** A contributor reading the schema will assume scheduler-triggered and Telegram-triggered updates are implemented and may spend time looking for the triggering code.  
**Likelihood:** Certain (any contributor who reads `models.py`).  
**Severity:** Low (confusion only; no functional impact).  
**Classification: Low**.

---

### RISK-16 — No Docker Hub Rate Limit Handling
**Description:** `fetch_dockerhub_latest()` makes unauthenticated API calls. Docker Hub's unauthenticated rate limit is 100 pulls/6h per IP. On an installation tracking many Docker Hub images, checks will start receiving 429 responses with no detection, backoff, or user notification.  
**Impact:** Apps tracked via Docker Hub silently show `error` status when the rate limit is hit; the error message will be an HTTP 429 response, which is logged but not surfaced distinctively in the UI.  
**Likelihood:** Medium for users tracking 50+ Docker Hub images on a 6-hour interval.  
**Severity:** Medium (apps show `error`; no data loss; resolved by the next successful check cycle after rate limit expires).  
**Classification: Medium**.

---

### RISK-17 — SQLite Without WAL Mode
**Description:** The SQLite database runs without WAL (Write-Ahead Logging) mode. The scheduler uses a `ThreadPoolExecutor` with `max_workers=10` — 10 concurrent threads all attempting database writes. SQLite's default journal mode serializes all writes with a file-level lock, meaning concurrent writes block each other.  
**Impact:** On large installs checking many apps simultaneously, threads will block waiting for the write lock. Occasional `database is locked` SQLAlchemy errors are possible under heavy load.  
**Likelihood:** Low for users with fewer than 20–30 apps. Medium for users with 50+ apps.  
**Severity:** Medium (transient errors; auto-resolves on next check cycle; no data corruption).  
**Classification: Medium** — a simple `PRAGMA journal_mode=WAL` in `app.py` would resolve this.

---

### RISK-25 — Notification Failures Are Silent
**Description:** Telegram and webhook delivery failures are caught with `except Exception as e: log.warning(...)`. They do not set an error state, do not update any UI indicator, and are not retried.  
**Impact:** A user whose Telegram bot token expires or whose webhook endpoint goes down will receive no indication in the Vigil UI. Version updates are detected correctly but notifications silently fail.  
**Likelihood:** Medium (Telegram tokens expire; self-hosted webhook endpoints go down).  
**Severity:** Low-Medium (no data loss; the core tracking function continues; user just doesn't get notified).  
**Classification: Low-Medium**.

---

### RISK-26 — Scheduler Fires Immediately on Every Restart
**Description:** `start_scheduler()` always passes `next_run_time=datetime.now()` to the job, meaning a version check fires immediately when the container starts. This is intentional for responsiveness, but if the container is restarted during an active check (e.g., for a config change), the check fires again immediately, potentially sending duplicate notifications for apps that already notified in the previous run.  
**Impact:** Duplicate Telegram/webhook notifications on container restart.  
**Likelihood:** Low (only occurs if a restart happens concurrently with a notification-triggering event).  
**Severity:** Low (notification duplicates are annoying but not harmful).  
**Classification: Low**.

---

### RISK-22 — External CDN Icons Without SRI
**Description:** App icons are loaded from `cdn.jsdelivr.net` at runtime without Subresource Integrity (SRI) hashes. A compromised or MITMed CDN response could inject malicious content.  
**Impact:** In practice, jsDelivr is a reputable CDN and the icons are display-only PNG/SVG files. The risk is theoretical for a LAN-deployed tool.  
**Likelihood:** Very low.  
**Severity:** Low for LAN deployments; Medium for internet-facing deployments.  
**Classification: Low** (acceptable for self-hosted homelab context).

---

### Summary of Remaining Risks Post-v2.6

| Risk | Classification | Workaround |
|------|---------------|-----------|
| RISK-04: TOTP plaintext | Medium | Enable disk encryption on host |
| RISK-05: agent-provision no rate limit | Low | TTL + single-use tokens limit exposure |
| RISK-06: install_tokens growth | Low | Manual SQL cleanup |
| RISK-07: update_log growth | Low | UI clear button exists |
| RISK-10: SECRET_KEY loss | Medium | Document backup procedure |
| RISK-12: auto_update misleading | **Medium** | Must be fixed or deprecated |
| RISK-13: triggered_by dead values | Low | Comment the schema |
| RISK-16: Docker Hub rate limit | Medium | Use `GITHUB_TOKEN` where possible |
| RISK-17: SQLite no WAL | Medium | Single-line PRAGMA fix |
| RISK-25: notification failures silent | Low-Medium | Check logs manually |
| RISK-26: duplicate on restart | Low | Acceptable; tolerable |
| RISK-22: CDN no SRI | Low | Acceptable for homelab |

**No High-classification risks remain after v2.6.** The three Medium risks (RISK-04, RISK-10, RISK-12) are the highest-priority post-roadmap work items.

---

## Report 4 — Feature Contract Review

A feature contract is broken when the UI promises behavior that the backend does not deliver.

---

### `auto_update` — **Misleading**

**Evidence:** `TrackedApp.auto_update` stores `off`/`ask`/`auto`/`silent`. The UI renders a 4-option dropdown with meaningful labels. `ask` and `off` gate the manual update button client-side only — a direct API call to `POST /api/apps/<id>/update` bypasses these gates. `auto` and `silent` are stored and displayed but the scheduler never reads them.

**Status post-v2.6:** Unchanged. The roadmap does not implement or deprecate this feature.

**Required action:** Either implement `auto` and `silent` scheduler logic, or rename the field to `manual_update_mode` and remove the `auto`/`silent` options until they are implemented. The current state misleads users.

---

### Notification Policies (never / always / major_only) — **Fully Implemented**

**Evidence:** `_should_notify()` in `scheduler.py` correctly enforces all three values. The `major_only` check compares `bump_type != "major"`. Frontend renders the dropdown and the setting is sent via `PATCH /api/apps/<id>`. The entire chain is active.

**Status post-v2.6:** Fully implemented.

---

### Update History — **Fully Implemented**

**Evidence:** `UpdateLog` entries are created by `_log_update()` on every update and revert. `GET /api/apps/<id>/logs` returns them. Frontend history modal displays them with timestamp, versions, status, and trigger source.

**Caveat:** `triggered_by` only ever shows `"user"` — the other declared values are never written. This is a cosmetic gap, not a functional failure.

**Status post-v2.6:** Functionally complete. Cosmetic gap on `triggered_by`.

---

### Agent Provisioning — **Fully Implemented**

**Evidence:** Complete 4-step TLS wizard, install token generation, certificate issuance via private CA, AES-256-GCM encrypted package delivery, fingerprint verification UI with per-segment highlighting, `confirm-tls` endpoint, `tls_enabled` flag. The entire chain from wizard to active mTLS connection is implemented and verified working in production.

**Status post-v2.6:** Fully implemented.

---

### TLS Provisioning — **Fully Implemented**

Same as agent provisioning. The private CA, certificate signing, encrypted delivery, and TOFU fingerprint model are all active. Documented in SECURITY.md with honest disclosure of the TOFU window risk.

**Remaining gap:** Certificate renewal is not implemented. Certificates are issued with a 10-year lifetime. This is documented as a known limitation.

**Status post-v2.6:** Fully implemented within stated scope.

---

### Categories — **Fully Implemented**

**Evidence:** CRUD for categories, auto-categorization on app add/import, `recategorize_all()` on keyword edit, `category_locked` flag to prevent auto-recategorization, 15 default categories after migration v12.

**Minor gap:** `_DEFAULT_CATEGORIES` divergence (7-entry vs 15-entry) is resolved in Phase 3. `bookstack` duplicate keyword resolved in Phase 1.

**Status post-v2.6:** Fully implemented.

---

### Scan Summaries — **Fully Implemented**

**Evidence:** The scheduler's inline scan summary block fires after every check run when `scan_summary_notify == "on"`. The toggle is in the UI. The dead `POST /api/scan-summary` endpoint is removed in Phase 2.

**Status post-v2.6:** Fully implemented (with dead code removed).

---

### Version Snooze — **Fully Implemented**

**Evidence:** `snoozed_until` checked in `_should_notify()`. UI sends ISO timestamp. Clear snooze endpoint exists.

**Status post-v2.6:** Fully implemented.

---

### Version Ignore — **Fully Implemented**

**Evidence:** `ignored_version` checked in `_should_notify()` and in the digest builder. Frontend UI for setting/clearing it exists.

**Status post-v2.6:** Fully implemented.

---

### Digest Notifications — **Fully Implemented**

**Evidence:** `_should_send_digest()` evaluates daily/weekly/interval modes with timezone awareness. `_build_digest()` constructs the message. All settings are stored and read correctly.

**Status post-v2.6:** Fully implemented.

---

### Feature Contract Summary

| Feature | Status | Post-v2.6 |
|---------|--------|-----------|
| auto_update (off/ask) | Client-side only | **Misleading** — no server gate |
| auto_update (auto/silent) | Stored, never executed | **Misleading** — scheduler ignores |
| Notification policies | Fully implemented | ✅ |
| Update history | Fully implemented | ✅ |
| triggered_by values | "user" only written | Cosmetic gap |
| Agent provisioning | Fully implemented | ✅ |
| TLS provisioning | Fully implemented (10yr lifetime) | ✅ |
| Categories | Fully implemented | ✅ |
| Scan summaries | Fully implemented | ✅ |
| Version snooze | Fully implemented | ✅ |
| Version ignore | Fully implemented | ✅ |
| Digest notifications | Fully implemented | ✅ |
| Certificate renewal | Not implemented | Documented gap |

**One broken feature contract remains after v2.6: `auto_update` `auto` and `silent` modes.** This is the only misleading UI element in the application.

---

## Report 5 — Public GitHub Readiness Assessment

### Strengths

**Architecture and code quality (post-v2.6):** The target architecture is clean, well-structured, and internally consistent. Module boundaries are clear. Dependency direction is unidirectional. Dead code is removed. Each module handles one concern. A developer familiar with Flask and React can navigate the codebase without a guide.

**Security documentation:** `SECURITY.md` is unusually thorough for an open-source homelab project. It openly acknowledges limitations, explains the threat model, provides deployment recommendations for different scenarios, and documents the security changelog. This builds trust with security-conscious contributors.

**CHANGELOG:** A detailed, well-written changelog covering every release from v1.0 to v2.3. Each entry explains the `why`, not just the `what`. This signals a project that cares about communication.

**Self-contained deployment:** `docker compose up -d` is genuinely the full deployment procedure. No external services, no accounts, no API keys required for basic use.

**Agent design:** The agent (`vigil-agent.py`) is ~300 lines of straightforward Python. A contributor can read and understand it in 10 minutes. The SECURITY.md explicitly invites this: "You can read the whole thing in ten minutes."

**Feature completeness:** At v2.3, the feature set is mature. Version checking across 6 registries, Telegram notifications, mTLS agents, TOTP 2FA, import/export, custom categories, icons, CSS — these are real features that work correctly in production.

### Weaknesses

**Missing GitHub artifacts (hard blockers):**
- No LICENSE file. The README claims MIT via a badge but no `LICENSE` file exists. Without this, the legal status is undefined — no contributor can safely contribute, and no user can confirm it is safe to use.
- No `.github/` directory: no issue templates, no PR template, no CONTRIBUTING.md.
- README contains unfilled placeholders: `github.com/youruser/vigil`, `github.com/username/vigil`.

**README staleness:** The `⚠️ Alpha release — vv1.0` banner contradicts a project that has shipped v2.3 with mTLS, TOTP, 18 database migrations, and production use. It creates an inaccurate impression of the software's maturity.

**No API documentation:** Contributors adding a new endpoint have no spec to follow and no documentation to update. The implicit contract is `to_dict()` shapes, which are undocumented.

**No automated tests:** The absence of any test suite is a contributor experience problem. A contributor making a change has no way to verify they haven't broken something else. All verification is manual. This is documented honestly in the execution plan but remains a gap.

**No CI/CD pipeline:** No GitHub Actions workflow for building, testing, or releasing. Contributors must manually verify their changes. Maintainers must manually publish releases.

### Remaining Blockers for Public GitHub Visibility

| Blocker | Severity | In roadmap? |
|---------|---------|-------------|
| No LICENSE file | **Hard blocker** | No |
| Placeholder URLs in README.md | **Hard blocker** | No |
| `⚠️ Alpha release — vv1.0` banner | Strong recommendation | No |
| No CONTRIBUTING.md | Recommendation | No |
| No `.github/` directory | Recommendation | No |
| `auto_update` misleading UI | Recommendation | No (tracked CC-29) |

**Readiness verdict:** Post-v2.6 architecture is ready for public visibility. Two hard blockers (LICENSE and placeholder URLs) are outside the roadmap scope and must be resolved separately before publishing.

---

## Report 6 — Production Readiness Assessment

### Current State (v2.3)

Vigil is currently running in production on the maintainer's homelab. The core functionality is reliable: version tracking, Telegram notifications, mTLS agent communication, and authentication all work correctly. Known production issues:

- **RISK-08:** Check interval reverts to env var value on container restart — any UI-configured interval is lost. This is a real reliability issue for users who have customized their check interval.
- **RISK-09:** Telegram credentials set via env var may not seed the DB, leading to silent notification failures on new installs.
- **RISK-17:** SQLite without WAL mode under 10 concurrent threads. In practice, the scheduler is the only heavy concurrent user and the homelab scale is low, so this has not caused failures.

### Post-v2.6 State

**Fixed by v2.4:**
- Check interval restart bug (RISK-08) — the most user-impactful reliability issue
- Telegram credential seeding (RISK-09)

**Not fixed by roadmap:**
- `install_tokens` unbounded growth (RISK-06) — minor, easily resolved outside the roadmap
- `update_log` no retention (RISK-07) — minor, easily resolved
- SQLite no WAL mode (RISK-17) — one-line fix, not in roadmap scope
- Notification failure visibility (RISK-25) — no UI indicator for failed notifications
- Docker Hub rate limit handling (RISK-16) — silent errors on 429 responses

### Deployment Consistency

The deployment procedure is consistent and well-documented: `cp .env.example .env && docker compose up -d`. Volumes are named and persistent. Health checks are implemented on both `backend` and `frontend` services. `depends_on` with health check conditions ensures the proxy waits for services to be healthy before accepting traffic.

**One inconsistency:** `docker-compose.yml` passes `TELEGRAM_TOKEN` and `TELEGRAM_CHAT_ID` as environment variables, but the scheduler reads them from the database at runtime. Before v2.4, these env vars have no effect unless the user also configures them in the UI. After v2.4, the seeding mechanism closes this gap for new installs.

### Recoverability

**Database:** SQLite file at `/data/tracker.db` on named volume `tracker-data`. Recovery is `docker compose down && cp backup.db /data/tracker.db && docker compose up -d`.

**Agent tokens:** Recoverable by regenerating tokens if `SECRET_KEY` is lost. This requires physical or VPN access to each agent host to re-run the provisioning wizard.

**CA and certificates:** The CA at `/data/vigil-ca.key` is the root of trust. Losing it invalidates all agent certificates and requires re-provisioning all agents. Not documented as a backup priority item in the user-facing README.

**Gap:** No backup reminder or guidance for the critical files: `tracker.db`, `.secret_key`, `vigil-ca.key`. A user who backs up only the `tracker-data` volume has `tracker.db` but not the key files if they are stored outside the volume. Inspection confirms all three are inside `/data` which maps to `tracker-data` — this is correct, but should be explicitly documented.

### Operational Safety

Gunicorn is configured with 1 worker and 4 threads with a 300-second timeout. The single-worker constraint is documented and enforced in `entrypoint.sh` with a comment. The 300-second timeout accommodates the longest expected agent operation (docker image pull + container restart).

The nginx configuration correctly applies 300-second timeouts to the update and revert endpoints, and 120-second timeouts to all other API endpoints.

**Remaining concern:** The single gunicorn worker means a long-running update operation (up to 180 seconds by agent timeout) blocks all other API requests. A user who triggers an update and then tries to use the dashboard will experience unresponsiveness for up to 3 minutes. This is documented nowhere.

---

## Report 7 — Portainer Compatibility Assessment

### Portainer Strengths

**Compose file structure:** The three-service design (nginx + frontend + backend) is idiomatic for Portainer Stacks. Named volumes, restart policies, and health checks are all Portainer-native concepts.

**Named volume:** `tracker-data` uses the standard named volume pattern. Portainer's volume management UI will correctly show and manage it.

**Health checks:** Both `backend` and `frontend` services have health checks. Portainer displays health status in the container list. The `depends_on` condition ensures correct startup ordering.

**Environment variables:** All environment variables are listed in `docker-compose.yml` with `${VAR:-default}` syntax. Portainer's Stack environment variable UI surfaces these exactly. A user can fill in `TELEGRAM_TOKEN` and `PORT` directly in the Portainer Stack editor.

**Restart policy:** `unless-stopped` is the recommended policy for Portainer-managed containers.

**`restart: unless-stopped` vs Portainer recreation:** Portainer Stack updates recreate containers (not restart them). Named volumes survive recreation. Configuration in `tracker-data` persists correctly.

### Portainer Weaknesses

**`build:` directives:** Both `frontend` and `backend` use `build: context:` in `docker-compose.yml`. Portainer Stacks deployed from a Git repository URL support `build:` — Portainer will run the build on the host. However, Portainer Stacks deployed by pasting the compose YAML into the editor do not support `build:` — the service definition must reference a pre-built image via `image:`. This limits deployment flexibility.

**No published images:** There are no pre-built Docker Hub images (`docker pull vigil/vigil-backend`). Every deployment requires building from source. This is a higher barrier than most popular homelab tools (e.g., Portainer itself, Nextcloud, Jellyfin — all have official Docker Hub images).

**Relative volume mount:** The nginx service mounts `./nginx/default.conf:ro`. This relative path works when deploying from a cloned repository but may require adjustment when deploying via Portainer's Git integration, depending on where the compose file is relative to the nginx config.

**Three-container overhead:** Portainer's visual interface shows three running containers for one service. For users accustomed to single-image tools, this can appear complex. The frontend container (nginx serving static files) could theoretically be eliminated by serving the React build from the backend container, reducing to two containers.

### Remaining Deployment Concerns

| Concern | Impact | Resolution |
|---------|--------|-----------|
| `build:` requires source at deploy time | Users cannot deploy without cloning repo | Publish Docker Hub images |
| No published images | Manual build required on every update | GitHub Actions workflow + Docker Hub publish |
| Three containers | Minor complexity | Could be reduced to two; not a blocker |
| Relative nginx config path | May need adjustment in some Portainer setups | Document Portainer deployment explicitly |

**Verdict:** Portainer-deployable via Git repository method. Not deployable via YAML paste without pre-built images. The roadmap does not address this. Publishing pre-built images is the correct solution and is a CI/CD concern, not a code concern.

---

## Report 8 — Security Baseline Assessment

### Security Strengths

**Password security:** bcrypt with cost factor 12. The choice is appropriate. Not upgradeable to Argon2 without a migration, but bcrypt-12 is not a weakness.

**TOTP implementation:** Custom RFC 6238 implementation using only stdlib (`hmac`, `struct`, `base64`). Zero external TOTP library dependency. Correct: ±1 window for clock drift, rate-limited (10/60s), pending state has 5-minute TTL. The implementation is auditable in ~50 lines.

**Agent token security:** AES-256-GCM with PBKDF2-derived key from `SECRET_KEY`. Constant-time comparison via `hmac.compare_digest`. Plain HTTP fallback removed in v2.3. This is a well-designed token security model.

**mTLS implementation:** Private CA model with per-agent certificates. Two-secret certificate delivery (install token + decryption key never transmitted). TOFU fingerprint verification. Backwards-compatible with pre-TLS agents. This is the most sophisticated security feature in the codebase.

**Input validation:** All write endpoints validate and length-cap inputs. URL fields accept only `http://` and `https://`. YAML writes go through PyYAML validation. Agent request body capped at 10MB. No raw SQL queries.

**Session security:** `HttpOnly`, `SameSite=Lax` cookies. Configurable `SECURE_COOKIES` for HTTPS deployments. Session lifetime configurable. Rate limiting on all auth endpoints.

**Honest documentation:** SECURITY.md openly documents known limitations, invites code review, and provides threat-appropriate deployment recommendations. This is a security strength, not a weakness.

### Security Weaknesses

**TOTP secret plaintext (RISK-04, post-v2.6):** Agent tokens are encrypted at rest with AES-256-GCM. TOTP secrets are not. This asymmetry is unexplained and creates a weaker security model for the 2FA system than for agent tokens. For a self-hosted LAN deployment where the database is protected by host OS security, this is tolerable. For an internet-facing deployment, it is a meaningful gap.

**`ALLOWED_ORIGIN=*` default (RISK-02, post-v2.6):** CORS is set to wildcard by default. Combined with `supports_credentials=True`, this means any origin can make credentialed API requests to Vigil from a browser. For a LAN-only deployment, this is low risk. For an internet-facing deployment without changing this setting, it is a CSRF vulnerability. The `.env.example` documents the fix but the default is unsafe for internet deployments.

**`SECURE_COOKIES=false` default (RISK-03, post-v2.6):** Session cookies are not marked `Secure` by default. On a plain HTTP deployment, this is appropriate. When deployed behind HTTPS without setting `SECURE_COOKIES=true`, the session cookie can be transmitted over HTTP in mixed-content scenarios. The `.env.example` documents this but the default is unsafe for HTTPS deployments.

**No CSRF tokens:** Acknowledged in `SECURITY.md` and CHANGELOG ("No CSRF tokens — mitigated by SameSite=Lax + CORS but not formally protected"). `SameSite=Lax` prevents cross-origin POST from form submissions but not from JavaScript fetch requests on the same origin. For a LAN-deployed single-user tool, the risk is low.

**Rate limiter resets on restart (RISK-05 partial):** The in-process rate limiter loses all state on container restart. An attacker who can restart the container can reset rate limits. For a LAN deployment, local Docker access implies a more serious compromise.

**`reportlab` attack surface (RISK-24, post-v2.6):** `reportlab` is a 2MB+ library with a history of CVEs related to PDF/XML parsing. It is used only to generate a QR code SVG for TOTP setup — a one-time operation. The library is not used in any request handling path after setup is complete, limiting the exploitable surface. But it increases the image attack surface unnecessarily.

### Risks Acceptable for Self-Hosted Homelab

| Risk | Rationale for acceptance |
|------|------------------------|
| No CSRF tokens | SameSite=Lax; single-user; LAN deployment |
| `ALLOWED_ORIGIN=*` default | LAN-only default; documented fix for internet exposure |
| `SECURE_COOKIES=false` default | Appropriate for HTTP-only LAN; documented fix for HTTPS |
| TOTP secret plaintext | DB protected by host OS; same physical security model as password hash |
| Rate limiter resets on restart | Requires local Docker access to exploit |
| Certificate no revocation | 10-year lifetime; token regeneration is the effective revocation mechanism |
| CDN icons no SRI | Display-only PNGs; CDN is reputable; LAN deployment |

### Risks Requiring Future Attention

| Risk | Priority | Effort |
|------|---------|--------|
| TOTP secret encryption | Medium | Low — use same AES mechanism as agent tokens |
| `/api/agent-provision` rate limiting | Medium | Low — add `@rate_limited(5, 60)` decorator |
| `reportlab` replacement with lightweight QR library | Low | Low — `qrcode` package is ~50KB |
| CSRF token implementation | Low | Medium — requires session token in all forms |
| Docker image vulnerability scanning | Low | Medium — GitHub Actions workflow |

---

## Report 9 — v3.0 Readiness Scorecard

*Scores reflect the post-v2.6 state (all roadmap phases complete). Each score is out of 10.*

---

### Architecture — 8/10

**Evidence:**
- Clean module boundaries: `services/version_checker`, `services/notifications`, `services/update_executor`, `scheduler`, `routes/*` — each with one concern (Steps 5–6)
- Dependency direction is unidirectional: routes → services → models (Step 5 R2)
- Dead code eliminated: 31 cleanup candidates addressed (Step 4)
- 7 duplicate logic groups resolved (Step 4)
- No dual-source configuration drift (Steps 4–6)
- Explicit data ownership per entity (Step 5 R7)

**Deductions (-2):**
- `auto_update` feature contract is broken — the architecture stores a value that is never consumed (RISK-12)
- `container_id` field name is semantically incorrect — a maintainability debt that survives the roadmap

---

### Maintainability — 8/10

**Evidence:**
- `scheduler.py`: 877 → ~100 lines (Step 6 R2)
- `routes/hosts.py`: 760 → ~350 lines (Step 6 R2)
- `App.jsx`: 4,515 → ~150 lines with 25-file structure (Step 6 R5)
- Canonical utility functions (no more silent divergence between copies)
- String constants in `config.py` (no more literal string typos)
- Architectural principles documented (Step 5 R1)

**Deductions (-2):**
- No automated test suite — all regression checks are manual (Step 6 R8)
- `auto_update` and `triggered_by` dead values require future maintainers to hold implicit knowledge about what is and isn't implemented

---

### Reliability — 6/10

**Evidence for score:**
- Core tracking and notification functions work correctly in production (Step 1)
- Check interval and Telegram credential drift bugs fixed in v2.4 (Step 6 R6)
- Health checks, named volumes, and restart policies are correct (Report 7)
- Gunicorn 300s timeout accommodates longest operations (Step 1)

**Deductions (-4):**
- SQLite without WAL mode under 10 concurrent threads (RISK-17) — unaddressed
- No Docker Hub rate limit detection or backoff (RISK-16) — unaddressed
- Notification failures are silent with no UI indicator (RISK-25) — unaddressed
- `install_tokens` grows unbounded (RISK-06) — unaddressed
- Single gunicorn worker blocks all requests during a 3-minute update operation — undocumented

---

### Security — 7/10

**Evidence for score:**
- bcrypt-12 passwords, TOTP, rate limiting, `HttpOnly`/`SameSite` cookies (Step 2 R5)
- AES-256-GCM agent token encryption with PBKDF2-derived key (Step 2 R5)
- Full mTLS implementation: private CA, per-agent certs, encrypted delivery, TOFU verification (Step 1)
- Input validation on all write endpoints; URL scheme validation (Step 1)
- Honest and thorough SECURITY.md (Report 8)
- `flask-session` dead dependency removed (Phase 2)

**Deductions (-3):**
- TOTP secret stored plaintext while agent tokens are encrypted — asymmetric and unexplained (RISK-04)
- `ALLOWED_ORIGIN=*` default with `supports_credentials=True` — unsafe for internet deployments (RISK-02)
- `/api/agent-provision` has no rate limiting — minor but exploitable (RISK-05)
- `reportlab` is a 2MB+ library for a one-time QR generation (RISK-24)

---

### Documentation — 6/10

**Evidence for score:**
- SECURITY.md is thorough, honest, and deployment-appropriate (Report 5)
- CHANGELOG is detailed and well-written through v2.3 (Report 2)
- `.env.example` is comprehensive with helpful inline comments (Report 2)
- README explains the tool's purpose clearly for its target audience (Report 5)

**Deductions (-4):**
- No LICENSE file — hard blocker for open-source status (Report 5)
- README contains placeholder GitHub URLs (Report 5)
- `⚠️ Alpha release — vv1.0` notice is stale and misleading (Report 5)
- No API documentation (no OpenAPI spec, no endpoint reference)
- No CONTRIBUTING.md or contributor guide (Report 5)
- No `.github/` directory (Report 5)

---

### Deployment Experience — 7/10

**Evidence for score:**
- `docker compose up -d` is genuinely the full deployment procedure (Report 6)
- Health checks and named volumes are correctly implemented (Report 7)
- `.env.example` is clear and complete (post-Phase 1 fix for `GITEA_TOKEN`) (Report 2)
- SECURITY.md provides LAN vs internet-facing deployment recommendations (Report 8)

**Deductions (-3):**
- No pre-built Docker Hub images — every deployment requires building from source (Report 7)
- Single gunicorn worker blocks UI during updates — undocumented (Report 6)
- Portainer paste-compose deployment does not work without pre-built images (Report 7)
- `SECRET_KEY` and `vigil-ca.key` backup criticality is not prominently documented (Report 6)

---

### Contributor Experience — 5/10

**Evidence for score (post-v2.6):**
- Clean module structure — a contributor can find the relevant code without reading the whole codebase (Reports 5, 6)
- Architectural principles documented in Step 5 R1 (foundation for CONTRIBUTING.md)
- Simple technology stack: Flask + React + SQLite — no exotic dependencies (Step 1)
- Agent code (~300 lines) explicitly invites reading (SECURITY.md)

**Deductions (-5):**
- No CONTRIBUTING.md — a new contributor has no guide (Report 5)
- No automated tests — no way to verify a change didn't break something (Report 8)
- No CI/CD pipeline — no automated build verification on PRs (Report 2)
- No `.github/` issue/PR templates (Report 5)
- No API documentation (Report 2)
- `auto_update` feature contract requires implicit knowledge that `auto`/`silent` don't work (Report 4)

---

### Operational Simplicity — 7/10

**Evidence for score:**
- Single data volume (`tracker-data`) contains all persistent state (Step 1)
- Startup sequencing is correct: migrations → CA init → category seeding → scheduler (Step 1)
- Health endpoint is simple and reliable (Step 1)
- Settings are user-configurable via UI without container restarts (post-v2.4) (Report 6)
- Log output from `docker compose logs` is informative (Step 1)

**Deductions (-3):**
- Notification failures are invisible to the operator — no dashboard indicator (RISK-25)
- Container restart fires an immediate version check — no grace period option (RISK-26)
- No built-in backup/restore workflow or documentation (Report 6)
- Single-worker limitation causes UI unresponsiveness during updates — undocumented (Report 6)

---

### Overall Readiness Score

| Dimension | Score |
|-----------|-------|
| Architecture | 8/10 |
| Maintainability | 8/10 |
| Reliability | 6/10 |
| Security | 7/10 |
| Documentation | 6/10 |
| Deployment Experience | 7/10 |
| Contributor Experience | 5/10 |
| Operational Simplicity | 7/10 |
| **Overall** | **6.75 / 10** |

**Interpretation:** A score of 6.75 reflects a codebase that is functional, thoughtfully designed in its security and core mechanics, and on a clear trajectory. It is not yet ready to be declared production-stable or publicly visible without addressing specific gaps. The lowest-scoring dimension — Contributor Experience (5/10) — is the most actionable gap. Most of it can be addressed with documentation work (LICENSE, CONTRIBUTING.md, `.github/`) rather than code changes.

---

## Report 10 — Final Recommendation

### Go / No-Go Recommendations

---

#### Roadmap Execution — **GO**

**Evidence:** The roadmap addresses the correct problems in the correct order. The architectural cleanup (dead code, duplicates, configuration drift, module decomposition) is necessary and well-designed. The sequencing is safe: each phase is independently deployable, the highest-risk phases are last, and the rollback strategy for each phase is defined. The pre-flight verification steps (grep before removal) correctly account for the time lag between analysis and implementation. No phase in the roadmap carries unacceptable risk.

**Condition:** Pre-implementation checklist in Step 6 Report 10 must be completed before Phase 1 begins. In particular, a database backup must exist before Phase 4 (migration v19).

**Outstanding:** The roadmap does not address LICENSE, placeholder URLs, or `.github/` artifacts. These must be completed alongside or before public visibility.

---

#### Public GitHub Visibility — **NO-GO** (current), **CONDITIONAL GO** (post-v2.6)

**Evidence for current NO-GO:**
- No LICENSE file. Without a LICENSE, the software has no defined legal status. Contributors cannot contribute, and users cannot confirm the terms of use. This is an unambiguous hard blocker.
- Placeholder URLs (`youruser/vigil`) in README.md would immediately signal to visitors that the repository is unfinished.

**Evidence for post-v2.6 CONDITIONAL GO:**
After completing the roadmap AND separately:
- Creating a LICENSE file (`LICENSE` or `LICENSE.md` with MIT or the chosen license text)
- Replacing all placeholder URLs in README.md and SECURITY.md
- Updating the README's alpha notice to reflect v2.3+ maturity
- Creating a CONTRIBUTING.md with minimum contributor guidance
- Creating `.github/` with issue templates

The codebase itself (post-v2.6) is ready for public visibility. The blockers are all documentation artifacts.

---

#### Production Self-Hosted Deployment — **GO** (with noted limitations)

**Evidence:** Vigil is already running in production on the maintainer's hardware at v2.3. The core tracking, notification, authentication, and mTLS agent functions are correct and verified. v2.4 fixes the two most significant operational issues (check interval drift, Telegram seeding). No blocking reliability issue exists for a typical homelab deployment (1–50 tracked apps, one or a few agents).

**Noted limitations that must be communicated to users:**
- SQLite without WAL mode: risk of `database is locked` errors on installations with 50+ apps
- No Docker Hub rate limit handling: apps may show `error` status if rate limits are hit
- Notification delivery failures are silent: check logs if notifications stop arriving
- Single gunicorn worker: UI is unresponsive during agent update operations (~1–3 minutes)
- No automated backup tooling: users must manually protect `tracker-data` volume contents

---

#### v3.0 Foundation Status — **CONDITIONAL GO**

**Evidence:** Post-v2.6, the architecture provides clean extension points for all features on the roadmap (new notification channels, new registries, multi-page frontend, user management). The dependency direction is clean, module boundaries are clear, and the implementation sequencing guidance exists for new contributors. The 6.75/10 overall score reflects a foundation that is structurally ready but operationally and documentationally incomplete.

**Conditions for v3.0 foundation status:**
1. v2.6 roadmap completed
2. LICENSE file created
3. README updated (alpha notice, placeholder URLs)
4. CONTRIBUTING.md created
5. `.github/` directory with issue templates
6. **One of the following addressed:** `auto_update` implemented or removed from UI — the broken feature contract is the single most damaging UX issue remaining after v2.6

**The `auto_update` condition is the most important.** A v3.0 release that still offers four update modes in the UI while only enforcing two of them, client-side, is not a credible product release. This must be resolved — either by implementing the scheduler logic for `auto` and `silent`, or by removing those options from the UI until they are implemented.

---

### Critical Blockers

| Blocker | Prevents |
|---------|---------|
| No LICENSE file | Public GitHub visibility, any open-source claim |
| `auto_update` broken contract | v3.0 credibility; ongoing user confusion |
| SQLite no WAL mode | Production reliability at scale (50+ apps) |

### Non-Critical Improvements

| Improvement | Value |
|-------------|-------|
| CONTRIBUTING.md + `.github/` | Contributor experience |
| README alpha notice update | Accurate first impression |
| `/api/agent-provision` rate limiting | Security hardening |
| TOTP secret encryption | Security consistency |
| `install_tokens` pruning | Operational tidiness |
| Notification failure UI indicator | Operational visibility |
| Docker Hub image publishing | Portainer paste-deployment |
| `reportlab` → `qrcode` | Reduced attack surface |

---

### Final Executive Summary

Vigil is a thoughtfully built, functionally mature homelab tool with a well-designed security model and an honest self-assessment of its limitations. The mTLS agent architecture (v2.3) in particular demonstrates sophisticated security thinking rarely seen in open-source homelab software.

The Architecture Stabilization Program identified real problems — a 4,515-line monolith, 877-line mixed-concern scheduler, 10 dead functions, 7 duplicate logic groups, and 3 silent runtime drift scenarios — and produced a specific, sequenced, evidence-based plan to fix them. The roadmap is sound, safe, and executable.

**After v2.6:**
- The backend is structurally clean and maintainable
- The frontend is decomposed and navigable
- The configuration is drift-free
- Dead code is removed
- Module boundaries are enforced

**What the roadmap does not do:**
- Create the LICENSE file (hard blocker for open-source)
- Fix the `auto_update` broken feature contract (significant UX issue)
- Address the six remaining Medium reliability and security risks
- Publish Docker Hub images for Portainer ease-of-use
- Build a contributor onboarding experience

The overall assessment: the roadmap should be executed as designed. It transforms a working but structurally complex codebase into a maintainable, navigable foundation. The non-roadmap items (LICENSE, `auto_update`, three Medium risks) are a small and well-defined post-roadmap work package. A project that completes the roadmap and addresses those five items will be genuinely ready for public GitHub visibility, confident production deployment, and v3.0.
