# Vigil — Refactor Execution Plan
**Version:** v2.3 baseline  
**Step:** 6 of the Architecture Stabilization Program  
**Scope:** Implementation roadmap only. No code was modified.

---

## Report 1 — Refactor Strategy

### Philosophy

The refactor is executed as a series of **small, independently releasable changes** that each leave the application in a fully working state. No branch sits unmerged for more than the duration of one phase. No phase depends on an earlier phase being in production — only on it being complete in the codebase.

The strategy is explicitly **not** a Big Bang rewrite. Every file touched produces a working, deployable artifact at the end of the session in which it is touched. A user running v2.4 should be able to upgrade to v2.5 with a single `docker compose pull && docker compose up -d` and observe no behavior change.

The North Star test: **any phase can be reverted by a single git revert and a container restart, with no data migration required.** The exception is database schema migrations, which must be forward-only and are handled with explicit rollback analysis in Report 7.

---

### Ordering Rationale

The sequencing is driven by four constraints, in priority order:

**1. Correctness dependency.** Some changes cannot be correct until a prior change is in place. `routes/apps.py` cannot import `version_checker.check_one()` until `version_checker.py` exists. Canonical `utils.py` functions cannot replace private `apps.py` functions until the canonical versions are verified to be behaviorally complete.

**2. Risk stacking.** High-risk changes are placed after the codebase has been simplified by lower-risk changes. Decomposing `scheduler.py` is medium risk; doing it while `utils.py` still has dead code and `apps.py` still has private duplicates adds cognitive overhead that increases that risk. Dead code and duplication are removed first.

**3. Independent releasability.** Each phase must be shippable. This means a phase cannot leave the codebase in a state where a known bug exists that will not be fixed until the next phase. Configuration drift (the `check_interval_hours` restart bug) is fixed in Phase 3, not Phase 5, because it is a real user-visible bug that should not wait for scheduler decomposition.

**4. Frontend is fully independent.** The frontend refactor (Phase 7) has zero coupling to the backend refactor. It can be done in any order relative to the backend phases, in parallel if there is a second contributor, or deferred entirely without affecting backend correctness. It is last only because it carries the highest risk.

---

### Risk Management Strategy

**Pre-flight check for each phase:**  
Before beginning any phase, run a targeted grep to confirm that no new callers of the code being removed or moved have been added since the analysis in Step 4. Steps 1–6 will be executed over time; the codebase may have received small fixes in the interim.

**Behavioral verification for each phase:**  
Each phase has a defined set of manual verification steps (Report 8). These are the minimum checks needed to confirm the phase did not regress behavior. They are documented per phase, not deferred to a final integration test.

**Extraction-before-deletion rule:**  
When moving code to a new location, the new location is created and verified working before the old location is deleted. The only exception is dead code removal (Phase 1), where there is no new location.

**No speculative changes:**  
Each phase executes exactly the scope defined in this document. If a problem is discovered during a phase that is not in scope, it is logged for a future phase rather than fixed inline. Scope creep during implementation is the primary cause of unexpected regressions.

---

### Rollback Strategy

**Phases 1–2 (dead code, utilities):** Git revert of the commit. No migration. Zero user impact.

**Phases 3a–3b (configuration deduplication, schema migration v19):** Git revert stops new code writing `token_hash`. Migration v19 makes `token_hash` nullable — this is safe to leave in place even if the code is reverted. Rollback of the config seeding requires care: if `check_interval_hours` was seeded into the DB during Phase 3 and the code is reverted, the DB now has a value the reverted scheduler code ignores (it reads from env). This is acceptable — the DB value is stale but harmless.

**Phases 4–5 (scheduler and route decomposition):** Git revert restores the original files. The new `services/` directory is deleted. No migrations are involved.

**Phase 6 (frontend):** Git revert restores `App.jsx`. The new `pages/`, `components/`, `hooks/`, `context/` directories are deleted. No backend changes are involved. A frontend rollback has zero impact on any running backend.

---

### Safest Sequencing Justification

The sequence is safe because:

1. The codebase is always in a deployable state after each phase commit.
2. Phases that touch the same file are grouped (e.g., `utils.py` cleanup and `apps.py` private function removal are both in Phase 2, not separated).
3. Configuration behavior changes (Phase 3) happen before structural changes (Phase 4) so that if Phase 4 breaks something, the configuration fix is already in place and is not a confound.
4. The highest-complexity file (`App.jsx`) is touched last.
5. Database migrations are always additive in Phase 3 (nullable column) — the destructive step (column drop) is deferred to a later version.

---

## Report 2 — Refactor Phases

### Phase Overview

| Phase | Name | Risk | Release | Independently deployable |
|-------|------|------|---------|--------------------------|
| 1 | Documentation & Minor Fixes | Negligible | v2.4 | Yes |
| 2 | Dead Code Removal | Low | v2.4 | Yes |
| 3 | Utility Consolidation | Low | v2.4 | Yes |
| 4 | Configuration Deduplication | Medium | v2.4 | Yes |
| 5 | Scheduler Decomposition | Medium | v2.5 | Yes |
| 6 | Backend Route Thinning | Medium | v2.5 | Yes |
| 7 | Frontend Decomposition | High | v2.6 / v3.0 | Yes |

Phases 1–4 ship together as v2.4. Phases 5–6 ship as v2.5. Phase 7 ships as v2.6 (or v3.0 if the frontend change is considered a major structural break — see Report 9).

---

### Phase 1 — Documentation & Minor Fixes

**Objective:** Correct all known documentation errors, version inconsistencies, and minor standalone bugs with zero behavior risk.

**Scope:**
- `.env.example`: add `GITEA_TOKEN`, fix `SESSION_LIFETIME_HOURS` comment
- `frontend/package.json`: bump `"version"` to `"2.3.0"`
- `categories.py`: remove `bookstack` from the `storage` keyword list (it already appears in `productivity`)
- `config.py`: add named string constants for session key names, Settings KV key names, and token format prefixes
- `CHANGELOG.md`: add v2.4 entry describing this stabilization work

**Dependencies:** None.

**Estimated risk:** Negligible. No executable logic changes in this phase.

**Files touched:** `.env.example`, `frontend/package.json`, `categories.py`, `config.py`, `CHANGELOG.md`

---

### Phase 2 — Dead Code Removal

**Objective:** Remove all confirmed dead code identified in Step 4 Report 10, items CC-01 through CC-10.

**Scope:**
- `utils.py`: remove `norm()`, `sort_key()`, `derive_status()`, `parse_image_name()`, `parse_compose_images()`
- `models.py`: remove `Host.check_token()` method
- `routes/hosts.py`: remove `_check_token()` function (lines ~50–56)
- `ca.py`: remove `decrypt_cert_package()` function
- `routes/settings.py`: remove `scan_summary()` function and its route registration (`POST /api/scan-summary`)
- `requirements.txt`: remove `flask-session==0.8.0`

**Dependencies:** Phase 1 must be complete (so `config.py` has the new constants that Phase 3 will reference).

**Estimated risk:** Low. Confirmed by Step 4 analysis. Pre-flight grep required before execution.

**Pre-flight check required:**
```
grep -rn "flask_session\|Host\.check_token\|_check_token\|decrypt_cert_package\|/api/scan-summary" backend/
grep -rn "from utils import.*\bnorm\b\|from utils import.*sort_key\|from utils import.*derive_status\|from utils import.*parse_image_name\|from utils import.*parse_compose_images" backend/
```
Both must return zero results (outside the files being deleted) before proceeding.

**Files touched:** `utils.py`, `models.py`, `routes/hosts.py`, `ca.py`, `routes/settings.py`, `requirements.txt`

---

### Phase 3 — Utility Consolidation

**Objective:** Eliminate the 7 duplicate logic groups identified in Step 4. Establish `utils.py` as the single canonical utility library. Consolidate `CH_LABELS` into a single definition.

**Scope:**
- Upgrade `utils.py` canonical function implementations (merge best behaviors from private copies)
- `routes/apps.py`: remove `_norm`, `_sort_key`, `_derive_status`, `_parse_image_name`, `_parse_compose_images`; import from `utils.py`
- `routes/apps.py`: remove `_GENERIC_NAMES` and `_SKIP_TAGS` — import `_SKIP_TAGS` from `scheduler.py` (temporary) or `config.py` (preferred); `_GENERIC_NAMES` embedded in `parse_image_name` in `utils.py`
- `scheduler.py`: remove inline `_norm` lambda; import `norm` from `utils`
- `scheduler.py`: extract `CH_LABELS` dict to `config.py`; remove the two inline definitions; import from `config`
- `categories.py`: consolidate `_DEFAULT_CATEGORIES` (7-entry) with `migrations.py:DEFAULT_CATEGORIES` (15-entry) by importing from a single source

**Dependency ordering within this phase:**
1. Upgrade `utils.py` functions first (they become the new canonical versions)
2. Update `routes/apps.py` to use `utils` imports
3. Update `scheduler.py` inline `_norm` to use `utils.norm`
4. Migrate `CH_LABELS` to `config.py`, update `scheduler.py` both call sites

**Dependencies:** Phase 2 must be complete (dead versions of these functions are removed, so there is no confusion about which version is canonical).

**Estimated risk:** Low with one caveat: `utils.norm` currently lowercases and collapses whitespace; `apps._norm` and `scheduler._norm` only strip `v`. The canonical `utils.norm` is more aggressive. Verify that the additional normalization does not affect the `_derive_status` comparison logic (where `apps._norm("1.2.3") == apps._norm("1.2.3")` must remain true — it will, since lowercasing an already-lowercase version string is a no-op). Document the behavioral difference.

**Files touched:** `utils.py`, `routes/apps.py`, `scheduler.py`, `config.py`, `categories.py`, `migrations.py`

---

### Phase 4 — Configuration Deduplication

**Objective:** Resolve the three dual-source configuration drift scenarios. Establish the database as the single source of truth for all user-configurable settings. Stop writing the dead `Host.token_hash` field.

**Scope:**

**4a — Env-var seeding on first run:**
- `app.py`: add `_seed_config_from_env(flask_app)` call during startup, before `start_scheduler()`. Seeds `check_interval_hours`, `telegram_token`, `telegram_chat_id` from env vars into DB if those keys are absent or empty.
- `scheduler.py`: change `start_scheduler()` to read `check_interval_hours` from DB (via `Settings.get()`) instead of `os.getenv()` directly.

**4b — Agent token deduplication:**
- `routes/hosts.py`: remove calls to `_hash_token()` and writes to `host.token_hash` in `create_host()` and `regenerate_token()`.
- `routes/hosts.py`: remove `_hash_token()` function definition (now unused, since `_check_token()` was removed in Phase 2).
- Add migration v19: make `hosts.token_hash` column nullable (`ALTER TABLE hosts ALTER COLUMN token_hash ...`) — this is the safe first step of eventual column removal.

**Dependencies:** Phase 2 (dead `_check_token` removed), Phase 3 (clean utility baseline).

**Estimated risk:** Medium. The config seeding logic must not overwrite user-configured values. The detection condition is: `Settings.get("check_interval_hours")` returns `None` or empty string → seed from env. If it returns any non-empty value → skip. This is a one-time idempotent seed, not a persistent override.

**Migration safety:** v19 makes `token_hash` nullable. Existing installs have non-null values which remain intact. The column is not dropped until migration v20 in a future release, giving a full release cycle of buffer.

**Files touched:** `app.py`, `scheduler.py`, `routes/hosts.py`, `migrations.py`

---

### Phase 5 — Scheduler Decomposition

**Objective:** Extract `services/version_checker.py` and `services/notifications.py` from `scheduler.py`. Reduce `scheduler.py` to its target scope: APScheduler lifecycle + orchestration only.

**Scope:**

**5a — Create `services/` package:**
- Create `backend/services/__init__.py` (empty)

**5b — Create `services/version_checker.py`:**
- Move from `scheduler.py`: all registry fetch functions (`fetch_dockerhub_latest`, `fetch_github_latest`, `fetch_github_latest_smart`, `fetch_gitlab_latest`, `fetch_gitea_latest`, `fetch_quay_latest`), all routing helpers (`_extract_tag_prefix`, `_extract_version_series`, `_extract_channel_prefix`, `resolve_latest_version`), all comparison functions (`_semver_key`, `_smart_gte`, `_version_bump_type`, `_is_version_tag` nested function — promote to module level), `_check_one()` renamed `check_one()` (now public), `_gh_headers()`, `_gl_headers()`, `_SKIP_TAGS`, `_VERSION_RE`, `_OS_SUFFIX_RE`, `MAX_WORKERS`, `MAX_HISTORY`, `DOCKERHUB_API`, and associated constants.
- Update `routes/apps.py`: replace `from scheduler import _check_one` with `from services.version_checker import check_one`.

**5c — Create `services/notifications.py`:**
- Move from `scheduler.py`: `send_telegram()`, `_send_webhook()` (renamed `send_webhook()` — public), `_render_template()`, `DEFAULT_NOTIFY_TEMPLATE`, `_should_notify()`, `_should_send_digest()`, `_build_digest()`, and the inline scan summary block (extracted to `send_scan_summary(flask_app)`).
- Import `CH_LABELS` from `config.py` (placed there in Phase 3).
- Update `routes/hosts.py`: replace `from scheduler import send_telegram, _send_webhook as send_webhook` in `_notify_action()` with `from services.notifications import send_telegram, send_webhook`.
- Update `routes/settings.py` `test_telegram()`: replace `from scheduler import send_telegram` with `from services.notifications import send_telegram`.

**5d — Reduce `scheduler.py`:**
- `run_version_checks()` becomes a thin orchestrator: load IDs → call `version_checker.check_one()` for each → collect notify_list → call `notifications.dispatch_notifications()` → call `notifications.maybe_send_digest()` → call `notifications.send_scan_summary()`.
- Remove all moved functions. `scheduler.py` retains: `start_scheduler()`, `get_scheduler_status()`, `reschedule_interval()`, `run_version_checks()`, module-level globals.
- Target size: ~100 lines.

**Execution order:** 5a → 5b → 5c → 5d. Each sub-step must be import-tested before proceeding.

**Dependencies:** Phase 3 (canonical utils in place), Phase 4 (scheduler reads from DB, so `start_scheduler()` is already updated).

**Estimated risk:** Medium. The logic does not change — only its module location. Primary risks: circular import (if `services/` accidentally imports from `routes/`), incorrect function move (a helper referenced by two moved functions that is only moved with one of them), and execution order changes (if `send_scan_summary` previously had access to scheduler globals that it now needs to receive as parameters).

**Circular import prevention:** `services/version_checker.py` imports only from `models`, `config`, `utils`, `requests`. `services/notifications.py` imports only from `models`, `config`, `requests`. Neither imports from `routes/` or `scheduler.py`. This must be verified after each sub-step.

**Files touched:** `backend/services/__init__.py` (new), `backend/services/version_checker.py` (new), `backend/services/notifications.py` (new), `scheduler.py`, `routes/apps.py`, `routes/hosts.py`, `routes/settings.py`

---

### Phase 6 — Backend Route Thinning

**Objective:** Extract `services/update_executor.py` from `routes/hosts.py`. Reduce `routes/hosts.py` to its target scope: host and provisioning HTTP endpoints only (~350 lines).

**Scope:**

**6a — Create `services/update_executor.py`:**
- Move from `routes/hosts.py`: `_agent_url()`, `_tls_context()`, `_agent_request()`, `_agent_health()`, `_log_update()`, and the core logic of `trigger_update()` and `revert_update()`.
- Public interface: `execute_update(entry, host, token, triggered_by)`, `execute_revert(entry, host, token, log_entry)`, `test_agent_connection(host, token)`.
- `_notify_action()` is removed from `hosts.py` — `update_executor.py` calls `notifications.notify_update()` directly.
- `_log_update()` moves into `update_executor.py` — it is an internal helper, not a public function.

**6b — Thin `routes/hosts.py`:**
- Route handlers `trigger_update()` and `revert_update()` become thin: extract parameters → call `update_executor.execute_update()` / `execute_revert()` → return result as JSON.
- Route handler `test_host()` calls `update_executor.test_agent_connection()`.
- Remove all moved helper functions.
- Token encryption/decryption helpers (`_encrypt_token`, `_decrypt_token`, `_store_token`, `_get_token`, `_delete_token`, `_generate_token`) remain in `routes/hosts.py` because they own the `Settings` key for agent tokens — this is host provisioning logic, not update execution logic.

**Dependencies:** Phase 5 (notifications service must exist for update_executor to call `notifications.notify_update()`).

**Estimated risk:** Medium. The update/revert code path is the most user-visible backend operation. Exact preservation of: error handling, backup path recording, host.last_seen update, host.status update, and the specific HTTP response shape is required. The function boundary must be designed so that `update_executor` returns a result dict that `routes/hosts.py` renders as JSON — no Flask objects cross the boundary.

**Key design constraint:** `update_executor.py` must not import from Flask or use `request`, `jsonify`, or `current_app`. It receives ORM objects and returns plain dicts. Error conditions are signaled by raising exceptions or returning result dicts with `"error"` keys. The Flask layer in `routes/hosts.py` translates these into HTTP responses.

**Files touched:** `backend/services/update_executor.py` (new), `routes/hosts.py`

---

### Phase 7 — Frontend Decomposition

**Objective:** Decompose `App.jsx` (4,515 lines, 87 state variables) into a conventional React project structure. Target: ~150-line `App.jsx`, 25 files, zero new dependencies.

**This phase is subdivided into 11 extraction steps, each a standalone commit.**

**Dependencies:** None (fully independent of backend phases).

**Estimated risk:** High. Detailed extraction order and risk management in Report 5.

---

## Report 3 — Dead Code Removal Plan

All items reference the Cleanup Candidate Register from Step 4 Report 10.

### Phase 2 Items (Pure Removals)

| CC-ID | Item | File | Pre-flight grep | Risk |
|-------|------|------|----------------|------|
| CC-01 | `utils.norm()` | `utils.py:91` | `grep -rn "utils\.norm\b\|from utils import.*\bnorm\b"` outside utils.py | Low |
| CC-02 | `utils.sort_key()` | `utils.py:98` | `grep -rn "utils\.sort_key\b\|from utils import.*sort_key"` outside utils.py | Low |
| CC-03 | `utils.derive_status()` | `utils.py:111` | `grep -rn "derive_status"` outside utils.py | Low |
| CC-04 | `utils.parse_image_name()` | `utils.py:120` | `grep -rn "utils\.parse_image_name\|from utils import.*parse_image_name"` outside utils.py | Low |
| CC-05 | `utils.parse_compose_images()` | `utils.py:127` | `grep -rn "utils\.parse_compose_images\|from utils import.*parse_compose_images"` outside utils.py | Low |
| CC-06 | `Host.check_token()` | `models.py:166` | `grep -rn "\.check_token\b"` — must only show `InstallToken.check_token` | Low |
| CC-07 | `hosts._check_token()` | `routes/hosts.py:50` | `grep -n "_check_token"` in hosts.py — must show only definition | Low |
| CC-08 | `ca.decrypt_cert_package()` | `ca.py:291` | `grep -rn "decrypt_cert_package"` — must show only definition | Low |
| CC-09 | `settings.scan_summary()` + `POST /api/scan-summary` | `routes/settings.py:141` | `grep -rn "scan.summary\|scan_summary"` in frontend — must show zero POST calls | Low |
| CC-10 | `flask-session==0.8.0` | `requirements.txt` | `grep -rn "flask_session\|FlaskSession"` | Low |

**Critical note on CC-09:** Before removing the `POST /api/scan-summary` route, verify the frontend does not call it. The grep above confirms this. The frontend toggle for scan summary notif sets `scan_summary_notify` in Settings — the scheduler reads that setting inline. The endpoint is redundant.

### Phase 3 Items (Deduplication)

| CC-ID | Item | Action | Phase |
|-------|------|--------|-------|
| CC-12 | `norm` × 3 implementations | Canonical in `utils.py`; remove `apps._norm` and `scheduler._norm` lambda | Phase 3 |
| CC-13 | `sort_key` × 3 | Canonical in `utils.py`; remove `apps._sort_key` | Phase 3 |
| CC-14 | `derive_status` × 2 | Canonical in `utils.py` (with `pinned` detection); remove `apps._derive_status` | Phase 3 |
| CC-15 | `parse_image_name` × 2 | Canonical in `utils.py` (with generic name fallback); remove `apps._parse_image_name` | Phase 3 |
| CC-16 | `parse_compose_images` × 2 | Canonical in `utils.py` (with tag splitting); remove `apps._parse_compose_images` | Phase 3 |
| CC-17 | `CH_LABELS` × 2 in `scheduler.py` | Move single definition to `config.py`; import in `scheduler.py` both call sites | Phase 3 |
| CC-18 | Scan summary × 2 | Canonical in `services/notifications.send_scan_summary()`; dead endpoint removed in Phase 2 | Phase 5 |

### Phase 4 Items (Configuration)

| CC-ID | Item | Action | Phase |
|-------|------|--------|-------|
| CC-19 | `Host.token_hash` written, never read | Stop writing in Phase 4; migration v19 makes nullable; migration v20 drops column (future release) | Phase 4 |
| CC-20 | `check_interval_hours` dual-source | Env var seeds DB on first run; scheduler reads DB | Phase 4 |
| CC-21 | Telegram creds dual-source | Env vars seed DB on first run; runtime reads DB | Phase 4 |
| CC-22 | `plain:` token prefix | **Retain** — backward compat; add `log.warning` | Phase 4 (add warning only) |
| CC-23 | Bare-string token | **Retain** — backward compat; add `log.warning` | Phase 4 (add warning only) |

### Retained Items

| CC-ID | Item | Reason |
|-------|------|--------|
| CC-24 | SHA-256 backup codes | Retain indefinitely; one-time-use; users may still have old codes |
| CC-25 | `_DEFAULT_CATEGORIES` divergence | Consolidate in Phase 3 |
| CC-26 | App.jsx complexity | Addressed in Phase 7 |
| CC-27 | `scheduler.py` complexity | Addressed in Phase 5 |
| CC-28 | `routes/hosts.py` complexity | Addressed in Phase 6 |
| CC-29 | `triggered_by` dead values | Tracked for future feature implementation; not removed |
| CC-30 | `flask-session` | Removed in Phase 2 (CC-10) |
| CC-31 | Frontend state density | Addressed in Phase 7 |

---

## Report 4 — Backend Refactor Plan

### File-by-File Implementation Sequence

#### `config.py` — Phase 1 and 3

**Phase 1 additions:**
```python
# String constants to eliminate repeated literals
SESSION_KEY_USER_ID     = "user_id"
SETTINGS_TELEGRAM_TOKEN = "telegram_token"
SETTINGS_TELEGRAM_CHAT  = "telegram_chat_id"
SETTINGS_WEBHOOK_URL    = "webhook_url"
SETTINGS_DIGEST_MODE    = "digest_mode"
SETTINGS_CHECK_INTERVAL = "check_interval_hours"
TOKEN_PREFIX_ENC        = "enc1:"
TOKEN_PREFIX_PLAIN      = "plain:"
```

**Phase 3 additions:**
```python
CH_LABELS = {
    "dockerhub": "Docker Hub",
    "github":    "GitHub Releases",
    "gitlab":    "GitLab",
    "gitea":     "Gitea/Forgejo",
    "quay":      "Quay.io",
    "lscr":      "LinuxServer (lscr.io)",
    "unknown":   "Registry",
}
```

Modules that currently define `CH_LABELS` inline import it from `config` instead.

---

#### `utils.py` — Phase 2 and 3

**Phase 2:** Remove `norm`, `sort_key`, `derive_status`, `parse_image_name`, `parse_compose_images` (dead exported versions).

**Phase 3:** Re-add as upgraded canonical versions that incorporate the best behaviors from both locations:

```python
# norm — canonical: lowercase + strip v + collapse whitespace (from current utils.norm)
# Note: apps._norm only strips v. The canonical is a superset — all version
# strings in use are already lowercase so the extra lowercase() is a no-op.
def norm(s: str | None) -> str:
    if not s: return ""
    return re.sub(r"\s+", "", s.strip().lstrip("v").lower())

# parse_image_name — canonical: adds generic name fallback from apps._parse_image_name
_GENERIC_NAMES = {"server", "app", "backend", "frontend", "service",
                  "worker", "api", "main", "core", "base"}
def parse_image_name(image: str) -> str:
    base  = image.split(":")[0]
    parts = [p for p in base.split("/") if p]
    if not parts: return image
    leaf  = parts[-1]
    if leaf in _GENERIC_NAMES and len(parts) >= 2:
        return parts[-2]
    return leaf

# parse_compose_images — canonical: splits image:tag (from apps._parse_compose_images)
def parse_compose_images(content: str) -> list[dict]:
    ...  # with tag splitting and _parse_image_name for name derivation

# derive_status — canonical: adds pinned detection from apps._derive_status
# Uses local _SKIP_TAGS (imported from config or scheduler until version_checker exists)

# sort_key — canonical: from current utils.sort_key (more general than apps._sort_key)
```

**Transition note for `_SKIP_TAGS`:** `_derive_status` in `utils.py` needs `_SKIP_TAGS` to detect pinned status. In Phase 3, `_SKIP_TAGS` is defined in both `scheduler.py` and `apps.py`. The temporary solution is to define `_SKIP_TAGS` in `utils.py` itself (it is a pure constant — no import issue). In Phase 5, `version_checker.py` will own `_SKIP_TAGS` and `utils.py` may import from it. This is acceptable because `utils` is a lower-level module than `version_checker` — however, an import from `version_checker` in `utils` would create an upward dependency. The resolution: move `_SKIP_TAGS` to `config.py` in Phase 3.

---

#### `routes/apps.py` — Phase 3

Remove `_norm`, `_sort_key`, `_derive_status`, `_parse_image_name`, `_parse_compose_images`, `_SKIP_TAGS` (local definition), `_GENERIC_NAMES`.

Add imports:
```python
from utils import norm, derive_status, parse_image_name, parse_compose_images
from config import _SKIP_TAGS   # or import via utils
```

Change `_parse_image_name(new_image)` call at line ~320 to `parse_image_name(new_image)`.
Change all `_norm(...)` calls in `update_app()` to `norm(...)`.
Change all `_derive_status(...)` calls to `derive_status(...)`.
Change `_parse_compose_images(content)` to `parse_compose_images(content)`.

In Phase 5, additionally change `from scheduler import _check_one` to `from services.version_checker import check_one` (and update the call site).

---

#### `scheduler.py` — Phase 3, 4, 5

**Phase 3:** Replace inline `_norm` lambda with `from utils import norm`. Remove both `CH_LABELS` dict definitions, `from config import CH_LABELS`.

**Phase 4:** Change `start_scheduler()` from:
```python
hours = int(os.getenv("CHECK_INTERVAL_HOURS", "6"))
```
to:
```python
with flask_app.app_context():
    hours = int(Settings.get("check_interval_hours") or
                os.getenv("CHECK_INTERVAL_HOURS", "6"))
```

**Phase 5:** Move all registry and notification functions to `services/`. Reduce `scheduler.py` to ~100 lines.

---

#### `routes/hosts.py` — Phase 2, 4, 6

**Phase 2:** Remove `_check_token()` (lines ~50–56).

**Phase 4:** Remove `_hash_token()` call and `host.token_hash = ...` write in `create_host()` and `regenerate_token()`. Remove `_hash_token()` function definition. Add `log.warning` for legacy token paths in `_decrypt_token`.

**Phase 6:** Move `_agent_url`, `_tls_context`, `_agent_request`, `_agent_health`, `_log_update`, and core update/revert logic to `services/update_executor.py`. Thin route handlers call `update_executor.execute_update()`.

---

#### `app.py` — Phase 4

Add `_seed_config_from_env(app)` function:
```python
def _seed_config_from_env(flask_app):
    """
    One-time seeding of env-var values into the Settings table.
    Only seeds keys that are absent or empty in the DB.
    Runs once at startup before the scheduler starts.
    """
    with flask_app.app_context():
        seeds = [
            ("check_interval_hours", os.getenv("CHECK_INTERVAL_HOURS", "6")),
            ("telegram_token",       os.getenv("TELEGRAM_TOKEN", "")),
            ("telegram_chat_id",     os.getenv("TELEGRAM_CHAT_ID", "")),
        ]
        for key, env_val in seeds:
            if env_val and not Settings.get(key):
                Settings.set(key, env_val)
                log.info("Config: seeded %s from environment.", key)
```
Call `_seed_config_from_env(app)` in `create_app()` after migrations run, before `start_scheduler()`.

---

#### `migrations.py` — Phase 4

Add `migration_19`:
```python
def migration_19(conn, insp):
    """Make hosts.token_hash nullable (first step of eventual removal).
    The column is vestigial — bcrypt hash written but never read for auth.
    See vigil-dead-code-analysis.md CC-19."""
    if _col_exists(insp, "hosts", "token_hash"):
        conn.execute(text(
            "CREATE TABLE hosts_new AS SELECT * FROM hosts"
        ))
        # SQLite does not support ALTER COLUMN; requires table rebuild
        # Full migration implemented in Step 6 execution
```
Note: SQLite `ALTER COLUMN` to change NOT NULL requires a table rebuild. The migration implementation must use the SQLite pattern: create new table → copy data → drop old → rename. This is safe with zero data loss since `token_hash` values are simply copied verbatim.

---

## Report 5 — Frontend Refactor Plan

### Strategy

Each extraction step is one commit. The rule: after each commit, the app builds and runs with identical behavior. An extraction is never "mostly done" — it is either complete or not started.

The extraction order is determined by the **dependency graph of the current App.jsx**: extract leaves first, then their parents, then the root.

---

### Extraction Order (11 Steps)

#### Step F1 — Pure Utility Extraction

**Target:** `frontend/src/utils/version.js`, `frontend/src/utils/color.js`, `frontend/src/utils/image.js`

**What moves:** Pure JavaScript functions with no React imports.
- `version.js`: `resolveChannelUrl(channel, image, url)`, `parseImageName(image)`, `formatVersion(v)`
- `color.js`: `hsvToRgb(h,s,v)`, `rgbToHsv(r,g,b)`, `hexToRgb(hex)`, `rgbToHex(r,g,b)`
- `image.js`: `stripBlackBackground(imgData)`, `parseImage(file)`

**How:** Move the function definitions. Update call sites in `App.jsx` with `import { resolveChannelUrl } from './utils/version'` etc.

**Risk:** Negligible. Pure functions, no state, no hooks.

---

#### Step F2 — Constants Extraction

**Target:** `frontend/src/constants.js`

**What moves:** `CHANNEL_META`, `DEFAULT_LOGO`, `CSS_TEMPLATE` (the inline `<style>` string), `C` (the color palette object).

**How:** Move the constant definitions to `constants.js`. `App.jsx` imports them.

**Risk:** Negligible. Constants have no side effects.

---

#### Step F3 — Leaf Components (No Hooks)

**Target:** `frontend/src/components/shared/`

**What moves:**
- `Tooltip.jsx`: the tooltip div rendered on hover
- `ChannelPill.jsx`: the registry channel badge
- `AppIcon.jsx`: the icon with CDN fallback logic
- `Toast.jsx`: the toast notification display

**How:** Each becomes a standalone functional component. Props are the data the component currently receives as variables from `App()` scope. No hooks in any of these.

**Risk:** Low. These components have no state. The only risk is accidentally omitting a prop or getting the prop name wrong. Each one is individually verifiable.

---

#### Step F4 — `CardMenu` Extraction (Critical)

**Target:** `frontend/src/components/apps/CardMenu.jsx`

**Why this is critical:** `CardMenu` is currently defined inside `App()`, which means it is recreated on every render, resetting its `useState` and `useRef` hooks. This is a React rules violation and was identified in Step 4 as a potential source of the black-screen bug. This step fixes a real bug, not just structure.

**What moves:** The entire `CardMenu` component definition (currently an inner function of `App`), including its `useState` and `useRef` calls.

**How:** Move `CardMenu` to a top-level component file. It receives `app`, `onEdit`, `onDelete`, `onHistory`, `onCheck`, `onUpdate`, `onSnooze`, `onIgnore`, `accent` as props.

**Risk:** Medium. This is a behavioral fix — the component gains stable hook identity. Verify that the menu opens and closes correctly after extraction, and that all menu actions call the correct callbacks. The component must not close when re-rendered from outside.

---

#### Step F5 — Hooks Extraction

**Target:** `frontend/src/hooks/`

**What moves:**
- `useApi.js`: the authenticated `api()` fetch wrapper (currently `const api = useCallback(...)` in `App()`)
- `useToast.js`: `toast` state + `showToast()` callback
- `useScheduler.js`: `schedulerStatus` state + the polling effect

**How:** Each `const = useCallback/useState/useEffect` block becomes a custom hook. `App()` calls the hook and destructures the return value.

**Risk:** Low-Medium. Hooks have a specific execution contract (must be called in the same order, cannot be conditional). The extraction must preserve the order these hooks were called in `App()`. Use ESLint rules-of-hooks to verify after extraction.

---

#### Step F6 — `AuthContext` Extraction

**Target:** `frontend/src/context/AuthContext.jsx`

**What moves:** `authState`, `currentUser`, `login()`, `logout()`, `totp_required`, the entire login/TOTP JSX. These are currently 4–5 state variables and a large JSX block in `App()`.

**How:** Create `AuthContext` with `createContext()`. `AuthProvider` wraps `App()` in `main.jsx`. `App()` reads `{ authState, currentUser }` from context via `useContext(AuthContext)`.

**Risk:** Medium. Auth state is read by multiple components. All consumers must use `useContext(AuthContext)` after extraction. The login page JSX moves to `LoginPage.jsx` (see Step F8).

---

#### Step F7 — `AppEditModal` Extraction

**Target:** `frontend/src/components/apps/AppEditModal.jsx`

**What moves:** All `overData` state (15 fields), the `openEdit(app)` / `closeEdit()` / `saveEdit()` handlers, and the edit overlay JSX.

**How:** `AppEditModal` receives `app` (the app being edited) and `onClose`, `onSave` as props. It owns all `overData` state internally. `App()` passes `activeApp` and callback functions.

**Risk:** Medium. This is the most complex modal in the application. The 15-field form has inline validation, host dropdown, icon picker integration, and a URL field. Test each field after extraction. The `onSave` callback must trigger `refreshApps()` from `AppDataContext`.

---

#### Step F8 — `ProvisionWizard` Extraction

**Target:** `frontend/src/components/hosts/ProvisionWizard.jsx`

**What moves:** All wizard state (~10 variables: `provStep`, `installToken`, `decKey`, `newToken`, `tokenExpiry`, `isPublicIp`, `copiedInstall`, `copiedToken`, `copiedDecKey`, `fingerprintData`), the 4-step wizard JSX, and the countdown timer effect.

**How:** `ProvisionWizard` receives `host` (the host being provisioned), `onClose`, and `onComplete` as props. It owns all wizard state.

**Risk:** Medium. The wizard has a complex multi-step flow with async operations (token generation, cert fetch, fingerprint comparison). Each step must be individually verified after extraction.

---

#### Step F9 — `AppDataContext` Extraction

**Target:** `frontend/src/context/AppDataContext.jsx`

**What moves:** `apps`, `categories`, `hosts` state arrays and their load/refresh logic. Currently these are 3 state variables in `App()` loaded in a single `useEffect` on mount.

**How:** `AppDataProvider` wraps all page components. Exposes `apps`, `categories`, `hosts`, `setApps`, `setCategories`, `setHosts`, `refreshApps()`, `refreshHosts()`.

**Risk:** Medium. This is the core data layer. All page components and most card components read from this context. After extraction, every component that currently receives `apps`, `categories`, or `hosts` as props switches to `useContext(AppDataContext)`. This is a large surface change but is mechanical: each prop removal and `useContext` addition is individually verifiable.

---

#### Step F10 — Pages Extraction

**Target:** `frontend/src/pages/`

**What moves:**
- `LoginPage.jsx`: login form JSX + TOTP flow JSX (from `AuthContext` / inline in App)
- `DashboardPage.jsx`: the main app grid/list/table view + all filter/sort/view state
- `SettingsPage.jsx`: the settings panel + all settings state
- `HistoryPage.jsx`: the update log view

**How:** Each page is extracted as a standalone component. `App.jsx` renders the correct page based on `modal`/`page` state.

**Risk:** Medium. Pages are large (DashboardPage in particular). The primary risk is a missing import or a prop that was passed implicitly through closure in `App()` and must now be explicitly passed or read from context. Work through one page at a time.

---

#### Step F11 — `App.jsx` Final Reduction

**Target:** `App.jsx` reduced to ~150 lines

**What stays:**
- Import statements for all pages, contexts, hooks
- `App()` function with: `AuthContext` setup, layout shell, `modal` state, `activeApp` state, `schedulerStatus` from `useScheduler()`, `toast` from `useToast()`
- Conditional rendering of pages and modals based on auth state and modal state

**Risk:** Low at this point — all logic has been extracted. This step is assembling already-extracted pieces.

---

### `api.js` — Created at Step F5

All `fetch` calls are moved to `api.js` during the hooks extraction step. Every API call is a named export:

```javascript
// api.js
export const fetchApps         = (signal) => api('/api/apps', {signal})
export const fetchCategories   = ()       => api('/api/categories')
export const patchApp          = (id, d)  => api(`/api/apps/${id}`, {method:'PATCH', body:JSON.stringify(d)})
export const triggerUpdate     = (id, d)  => api(`/api/apps/${id}/update`, {method:'POST', body:JSON.stringify(d)})
export const fetchHosts        = ()       => api('/api/hosts')
// ... all endpoints named and exported
```

The `api()` wrapper (authenticated fetch with session-expiry detection) lives in `hooks/useApi.js` and is called internally by `api.js`.

---

### Migration Order Summary (Frontend)

```
F1: Pure utils        → No risk (no React)
F2: Constants         → No risk (no React)
F3: Leaf components   → Low risk (no hooks)
F4: CardMenu          → Medium risk (fixes hooks violation)
F5: Hooks             → Low-Medium risk
F6: AuthContext       → Medium risk
F7: AppEditModal      → Medium risk
F8: ProvisionWizard   → Medium risk
F9: AppDataContext     → Medium risk (large surface)
F10: Pages            → Medium risk (one at a time)
F11: App.jsx cleanup  → Low risk (assembly)
```

---

## Report 6 — Configuration Migration Plan

### Setting: `check_interval_hours`

**Current State:**
- Env var `CHECK_INTERVAL_HOURS` (default `"6"`) read by `scheduler.py:start_scheduler()` at container start
- DB key `check_interval_hours` written by `routes/settings.py` when user changes interval in UI
- On restart: env var wins; DB value silently discarded
- Result: UI-configured value is lost after any container restart

**Intermediate State (Phase 4 deployed):**
- `app.py:_seed_config_from_env()` checks `Settings.get("check_interval_hours")` at startup
- If DB key is absent or empty: reads `CHECK_INTERVAL_HOURS` env var, writes to DB
- If DB key has a value: does nothing (does not overwrite user's UI configuration)
- `start_scheduler()` reads from DB: `int(Settings.get("check_interval_hours") or os.getenv("CHECK_INTERVAL_HOURS", "6"))`
- First restart after Phase 4: if the DB key was previously set, the user's value is preserved. If it was never set (fresh install), it is seeded from env.

**Target State (stable):**
- DB is always authoritative
- Env var is documentation-only after the first seed
- Restart cannot overwrite a user-configured value
- `docker-compose.yml` `CHECK_INTERVAL_HOURS` comment updated: "Set the initial check interval. After first run, change this in the Vigil UI — this value is only used if no interval is set in the database."

**Migration safety:** No existing user loses their configured value. If a user has the default 6h in both env and DB, behavior is unchanged. If a user changed it in the UI to 2h, Phase 4 preserves the 2h value after restart.

---

### Setting: `telegram_token` / `telegram_chat_id`

**Current State:**
- Env vars `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID` passed to container
- Scheduler reads `Settings.get("telegram_token")` at runtime — reads from DB, not env
- There is no mechanism to seed the DB from the env vars
- A user who set env vars but never saved via the UI gets empty strings from the scheduler
- A user who saved via the UI but changed the env vars gets the DB value (env change has no effect)

**Intermediate State (Phase 4 deployed):**
- `_seed_config_from_env()` seeds `telegram_token` and `telegram_chat_id` from env on first run (when DB keys are absent or empty)
- After seeding, env vars have no further effect

**Target State:**
- DB is always authoritative
- Env vars in `docker-compose.yml` serve as initial setup convenience for new installs
- After first run, Telegram credentials are managed exclusively via the UI
- `docker-compose.yml` comment updated: "Used for initial setup only. After saving in the Vigil UI, these env vars have no effect."

**Migration safety for existing users:**
- Users who already configured Telegram via the UI have non-empty DB values. `_seed_config_from_env()` checks `if not Settings.get(key)` — their values are not overwritten.
- Users who set env vars but never configured via the UI: Phase 4 seeds the DB from their env vars on the first restart. Their Telegram setup now works correctly for the first time.
- No existing working configuration is broken.

---

### Agent Token Dual Representation

**Current State:**
- `host.token_hash`: bcrypt hash, written on create/regenerate, never read for auth
- `settings.host_{id}_token`: AES-256-GCM encrypted token, written on create/regenerate, used for auth
- Two representations of the same secret exist in the database simultaneously

**Intermediate State (Phase 4 deployed):**
- `create_host()` and `regenerate_token()` no longer write to `host.token_hash`
- `_hash_token()` function removed (was used only for `token_hash` writes)
- Existing rows in `hosts` table retain their old `token_hash` values (they are not cleared — migration only makes the column nullable)
- Migration v19: `hosts.token_hash` column is made nullable
- Auth continues to use `settings.host_{id}_token` exclusively (no change to working auth path)

**Target State (after migration v20 in a future release):**
- Migration v20 drops the `hosts.token_hash` column entirely
- Only `settings.host_{id}_token` represents the agent token
- One column, one source of truth

**Migration safety:**
- Phase 4 only stops writing the column — no reads are affected
- Migration v19 (nullable) is safe: existing non-null values remain
- Migration v20 (drop column) is deferred to the release following v2.4, giving a full release cycle to confirm no hidden read path exists

---

## Report 7 — Database Migration Plan

### Migration v19 — `hosts.token_hash` Nullable

**Purpose:** First step of removing the dead `token_hash` field. Makes the column nullable so Phase 4 can stop writing to it without causing NOT NULL constraint violations.

**SQLite pattern required (no native ALTER COLUMN):**
```sql
-- 1. Create new table with nullable token_hash
CREATE TABLE hosts_new (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    ip              TEXT NOT NULL,
    port            INTEGER NOT NULL DEFAULT 7777,
    token_hash      TEXT,              -- was NOT NULL; now nullable
    allowed_base    TEXT NOT NULL DEFAULT '/home',
    last_seen       TEXT,
    status          TEXT NOT NULL DEFAULT 'unknown',
    created_at      DATETIME,
    cert_fingerprint TEXT,
    tls_enabled     INTEGER NOT NULL DEFAULT 0
);
-- 2. Copy all existing rows (token_hash values preserved as-is)
INSERT INTO hosts_new SELECT * FROM hosts;
-- 3. Drop original
DROP TABLE hosts;
-- 4. Rename
ALTER TABLE hosts_new RENAME TO hosts;
```

**Rollback:** SQLite table rebuild can be reversed by restoring from a DB backup. The column change itself is safe: making a NOT NULL column nullable cannot cause data loss. A rollback simply changes the column constraint back.

**Risk:** Low. The migration is idempotent: `_col_exists()` checks ensure it is skipped if already applied. The table rebuild is a standard SQLite migration pattern. Existing data is fully preserved.

**Compatibility period:** The `token_hash` column remains nullable (containing old values for existing hosts) until migration v20 drops it. During this period, `token_hash` is never written by new code and never read. It is dead storage.

---

### Migration v20 — `hosts.token_hash` Drop (Future Release)

**Purpose:** Permanent removal of the dead `token_hash` column.

**Not scheduled for v2.4 or v2.5.** Scheduled for the release following a full release cycle with v19 in production — likely v2.6 or later. This gives time to confirm that no unknown read path exists in any production installation.

**Risk:** Medium. Column drops are irreversible. Pre-condition: grep the codebase for any remaining reference to `token_hash` before shipping v20.

---

### No Other Schema Changes in Phases 1–6

Phases 1–6 do not require any additional schema migrations. All data relationships remain intact. The `update_log`, `install_tokens`, `settings`, `users`, `categories`, `tracked_apps` tables are not structurally changed.

---

### Migration Numbering

| Migration | Purpose | Phase | Release |
|-----------|---------|-------|---------|
| v1–v18 | Historical (schema baseline) | Pre-existing | v1.0–v2.3 |
| v19 | `hosts.token_hash` → nullable | Phase 4 | v2.4 |
| v20 | `hosts.token_hash` → drop column | Future | v2.6+ |

---

## Report 8 — Testing Strategy

Vigil has no automated test suite. All verification is manual. Each phase defines the minimum manual verification required before the phase is considered complete and committable.

### Phase 1 — Documentation & Minor Fixes

| Check | Method |
|-------|--------|
| `GITEA_TOKEN` appears in `.env.example` | Visual inspection |
| `SESSION_LIFETIME_HOURS` comment is corrected | Visual inspection |
| `package.json` version is `2.3.0` | `grep version frontend/package.json` |
| `bookstack` appears in exactly one category keyword list | `grep bookstack categories.py` — expect exactly 1 hit |
| Config constants accessible | `python3 -c "from config import SESSION_KEY_USER_ID; print(SESSION_KEY_USER_ID)"` |

### Phase 2 — Dead Code Removal

| Check | Method |
|-------|--------|
| App starts without error | `docker compose up` → no startup exceptions |
| Login works | Browser: login with admin credentials |
| `GET /api/apps` returns data | Browser or curl |
| `POST /api/check` triggers scan | Dashboard "check all" button, observe log output |
| `GET /api/health` returns `{"status":"ok"}` | curl |
| `install_tokens` table still created | Check via `/api/hosts` response |
| No 500 on settings page | Navigate to Settings in UI |
| `requirements.txt` imports all cleanly | `pip install -r requirements.txt` in a fresh venv — no errors |

### Phase 3 — Utility Consolidation

**High-risk area:** Version comparison behavior. The `norm` function change (added lowercase) must be tested against version strings that are already lowercase (all Docker Hub tags). The `derive_status` change (added `pinned` detection) must be tested against apps tracked with floating tags.

| Check | Method |
|-------|--------|
| App with `latest` tag shows status `pinned` not `outdated` | Add an app with `image:latest` version; verify status after check |
| App with semver tag shows correct `outdated`/`up-to-date` | Run check on a known outdated app |
| Compose import still extracts correct images and versions | Paste a docker-compose.yml with `image: nginx:1.25.3` — verify `version: 1.25.3` is extracted |
| Image name parsing: generic name uses parent | Add app with image `registry/server:latest` — verify name is `registry` not `server` |
| `CH_LABELS` shows correct channel names in notifications | Trigger a version check on a GitHub-hosted image; verify notification shows "GitHub Releases" |
| Category seeding: 15 categories on fresh install | Fresh DB; verify 15 categories exist after startup |

### Phase 4 — Configuration Deduplication

**High-risk area:** The seeding logic must not overwrite existing values. Test the "existing value preserved" case before the "new value seeded" case.

| Check | Method |
|-------|--------|
| Existing `check_interval_hours` in DB not overwritten on restart | Set interval to 2h in UI → restart container → verify Settings table still shows 2h → verify scheduler uses 2h |
| Fresh install seeds interval from env var | Delete DB → set `CHECK_INTERVAL_HOURS=3` in env → start container → verify Settings table has `3` |
| Telegram token seeded on fresh install | Delete DB → set `TELEGRAM_TOKEN=abc123` in env → start container → verify Settings table has `abc123` |
| Existing Telegram token not overwritten | Configure Telegram via UI → restart container → verify token unchanged |
| `create_host` no longer writes `token_hash` | Create a new host → inspect `hosts` table → `token_hash` is NULL |
| Existing hosts auth still works | Existing host with old `token_hash` value → agent connection test → still connected |
| Migration v19 ran | `SELECT token_hash FROM hosts WHERE id=<new_host_id>` → NULL |

### Phase 5 — Scheduler Decomposition

**High-risk area:** The notification path. All notification types must be verified end-to-end after the scheduler decomposition.

| Check | Method |
|-------|--------|
| Scheduled check runs and completes | Wait for scheduled check; observe `last_run_finished_at` updates |
| Single-app check works (`POST /api/apps/<id>/check`) | Dashboard "check" button on one app |
| Docker Hub fetch works | Check an app with a Docker Hub image |
| GitHub fetch works | Check an app with a `ghcr.io/` image |
| Telegram notification sent on update available | Set `digest_mode=immediate`; trigger check on known outdated app; verify Telegram message received |
| Digest notification works | Set `digest_mode=daily`; force `last_digest_sent` to yesterday; trigger check; verify digest sent |
| Scan summary works | Set `scan_summary_notify=on`; run check; verify summary message received |
| Webhook fires | Set `webhook_url` to a test endpoint; trigger check; verify POST received |
| Scheduler status API returns correct data | `GET /api/health` → verify `scheduler.running=true`, `next_run_at` populated |
| `import services.version_checker` in Python shell | `python3 -c "from services.version_checker import check_one; print('OK')"` |
| `import services.notifications` in Python shell | `python3 -c "from services.notifications import send_telegram; print('OK')"` |

### Phase 6 — Backend Route Thinning

**High-risk area:** The update/revert path. These are the most user-impactful operations.

| Check | Method |
|-------|--------|
| Agent health test works | Settings → host → Test connection |
| Update operation completes successfully | Trigger update on a test app; verify compose file patched + container restarted |
| Update failure is logged correctly | Trigger update with agent offline; verify `update_log` entry with `status=failed` |
| Revert operation works | Revert to a previous backup; verify compose restored |
| Notification fired after update | Verify Telegram message after update |
| `update_log` populated correctly | After update, `GET /api/apps/<id>/logs` returns entry with correct fields |
| `import services.update_executor` in Python shell | `python3 -c "from services.update_executor import execute_update; print('OK')"` |
| `routes/hosts.py` has no Flask objects crossing into update_executor | Code review: verify `update_executor.py` imports no Flask modules |

### Phase 7 — Frontend Decomposition

**Per-extraction-step verification:** After each of the 11 extraction steps, the full UI must be functionally verified before committing. The minimum checks per step:

| Extraction step | Minimum checks |
|-----------------|----------------|
| F1: Pure utils | Version comparison display correct; color picker works |
| F2: Constants | Channel pills show correct labels; default logo loads; CSS applied |
| F3: Leaf components | Icons load; channel pills render; tooltips appear; toasts show |
| F4: CardMenu | Card menu opens; all menu items functional; menu closes on outside click |
| F5: Hooks | Login works (useApi); toast shows; scheduler status updates |
| F6: AuthContext | Login/logout; TOTP flow; session expiry redirects to login |
| F7: AppEditModal | Open edit; change all 15 fields; save; verify changes reflected in card |
| F8: ProvisionWizard | Open wizard; complete 4 steps; fingerprint verification |
| F9: AppDataContext | App list loads; categories load; hosts load; refresh after add/delete |
| F10: Pages | Full navigation flow; settings save; history view |
| F11: App.jsx cleanup | Full smoke test: login → dashboard → edit → update → settings → logout |

**React-specific checks for Phase 7:**
- No console errors about hook order violations
- `CardMenu` does not lose state on dashboard re-render (the key fix)
- No "maximum update depth exceeded" errors
- No "cannot update a component while rendering a different component" warnings

---

## Report 9 — Release Plan

### Versioning Rationale

Vigil uses `MAJOR.MINOR` versioning (per CHANGELOG). The current version is 2.3. The stabilization work does not add user-visible features — it fixes bugs, removes dead code, and restructures internals. This warrants minor version increments, not a major version bump.

**Exception:** Phase 7 (frontend decomposition) is a significant structural change but produces zero user-visible behavior change. It does not warrant a major version bump. However, if Phase 7 coincides with any new user-visible feature, the combined release could be v3.0.

---

### Release: v2.4

**Contains:** Phases 1, 2, 3, 4

**Theme:** "Internal Cleanup & Configuration Fix"

**User-visible changes:**
- Bug fix: check interval configured via UI is now preserved after container restart (P4)
- Bug fix: Telegram credentials configured via env vars are now correctly seeded on fresh install (P4)
- `bookstack` auto-categorization now consistently goes to Productivity (P1/Phase 3)

**Non-visible changes:**
- Dead code removed (flask-session, 6 dead functions, 1 dead route)
- Utility functions consolidated (no behavioral change to version comparison)
- Configuration constants added to `config.py`
- `Host.token_hash` column made nullable (migration v19)

**CHANGELOG entry:**

```markdown
## [2.4] — Internal Cleanup & Configuration Fix

### Fixed
- Check interval configured in the UI is now preserved across container restarts.
  Previously, restarting the container reset the interval to the `CHECK_INTERVAL_HOURS`
  environment variable value, silently discarding any UI change.
- Telegram credentials set via environment variables are now correctly seeded into
  the database on first run. Previously, env var credentials had no effect unless
  the user also saved them in the Settings UI.
- `bookstack` now consistently auto-categorizes to Productivity (was sometimes Storage).

### Internal
- Removed unused `flask-session` dependency (was installed but never used).
- Removed 6 dead functions and 1 dead API endpoint (`POST /api/scan-summary`).
- Utility functions (`norm`, `parse_image_name`, `parse_compose_images`, `derive_status`)
  consolidated to a single canonical implementation each.
- Channel label map (`CH_LABELS`) defined once (was duplicated in scheduler.py).
- `GITEA_TOKEN` documented in `.env.example`.
- Schema migration v19: `hosts.token_hash` made nullable (preparation for removal in v2.6+).
```

---

### Release: v2.5

**Contains:** Phases 5, 6

**Theme:** "Backend Decomposition"

**User-visible changes:** None. This release is invisible to users. All behavior is preserved exactly.

**Non-visible changes:**
- `scheduler.py` reduced from 877 lines to ~100 lines
- New `services/version_checker.py` (~380 lines)
- New `services/notifications.py` (~200 lines)
- New `services/update_executor.py` (~230 lines)
- `routes/hosts.py` reduced from 760 lines to ~350 lines

**Risk rationale for separate release from v2.4:** Phases 5 and 6 are structural changes to the most critical backend paths (version checking and update execution). Separating them from v2.4 means that if a regression is discovered in v2.5, it can be attributed specifically to the structural change, not conflated with the configuration fixes of v2.4.

**CHANGELOG entry:**

```markdown
## [2.5] — Backend Decomposition

### Internal
- Scheduler decomposed: registry fetching and version comparison logic extracted to
  `services/version_checker.py`; notification delivery extracted to
  `services/notifications.py`. `scheduler.py` is now a thin orchestrator (~100 lines).
- Agent communication and update execution logic extracted from `routes/hosts.py`
  to `services/update_executor.py`. `routes/hosts.py` is now a clean HTTP layer.
- No behavior changes. All existing functionality preserved.
```

---

### Release: v2.6

**Contains:** Phase 7

**Theme:** "Frontend Decomposition"

**User-visible changes:** None intended. If any UI improvements are included alongside the decomposition, they are documented separately.

**Non-visible changes:**
- `App.jsx` reduced from 4,515 lines to ~150 lines
- 25 new frontend files across `pages/`, `components/`, `hooks/`, `context/`
- `CardMenu` extracted to a top-level component (fixes React hooks violation)

**Why a separate release:** Phase 7 is the highest-risk change in the program. Keeping it in its own release means any regression is trivially attributed to the frontend change.

**CHANGELOG entry:**

```markdown
## [2.6] — Frontend Decomposition

### Fixed
- CardMenu component extracted from App() body to top-level component, resolving
  a React rules-of-hooks violation that could cause state loss on dashboard re-renders.

### Internal
- App.jsx (4,515 lines) decomposed into 25 files across pages/, components/,
  hooks/, and context/. All behavior preserved.
- Canonical api.js client module for all HTTP calls.
- AuthContext and AppDataContext for shared state without prop drilling.
```

---

### Release: v3.0 (Future)

**Trigger:** v3.0 is appropriate when the first user-visible architectural addition is made on top of the clean v2.6 foundation. Likely candidates from the roadmap: light mode, multi-user support, CSRF protection, notification channels beyond Telegram.

The clean architecture produced by the stabilization program is specifically designed to make these additions straightforward — each belongs to a well-defined module with a clear extension point.

---

## Report 10 — Execution Blueprint

### Master Phase List

| Phase | Name | Files Changed | Key Deliverable | Risk | Release |
|-------|------|--------------|----------------|------|---------|
| 1 | Documentation & Minor Fixes | 5 | Correct docs, constants in config.py | Negligible | v2.4 |
| 2 | Dead Code Removal | 6 | 6 dead functions + 1 dead package removed | Low | v2.4 |
| 3 | Utility Consolidation | 5 | Canonical utils.py, no private duplicates in apps.py | Low | v2.4 |
| 4 | Configuration Deduplication | 4 + migration | Drift bugs fixed, token_hash stops being written | Medium | v2.4 |
| 5 | Scheduler Decomposition | 6 + 3 new | services/version_checker.py, services/notifications.py | Medium | v2.5 |
| 6 | Backend Route Thinning | 2 + 1 new | services/update_executor.py, thin hosts.py | Medium | v2.5 |
| 7 | Frontend Decomposition | 1 → 26 | Clean React structure, CardMenu bug fixed | High | v2.6 |

---

### Dependency Graph

```
Phase 1 ──────────────────────────────────────► Phase 2
                                                      │
                                                      ▼
                                                 Phase 3
                                                      │
                                                      ▼
                                                 Phase 4
                                                      │
                                                      ▼
                                                 Phase 5
                                                      │
                                                      ▼
                                                 Phase 6

Phase 7 ── Independent of all backend phases ──────────►
```

Phase 7 has no dependency. It can be executed at any point after Phase 1 (constants needed for `constants.js` extraction) or even in parallel if there is a separate contributor.

---

### Risk Profile by Phase

```
Phase 1  ██░░░░░░░░  Negligible — documentation and constants only
Phase 2  ███░░░░░░░  Low       — pure removal, pre-flight grep required
Phase 3  ████░░░░░░  Low-Med   — behavioral verification of norm() required
Phase 4  ██████░░░░  Medium    — config seeding must not overwrite existing values
Phase 5  ██████░░░░  Medium    — notification path end-to-end verification required
Phase 6  ███████░░░  Medium    — update/revert path critical; no Flask in executor
Phase 7  █████████░  High      — React hooks order; CardMenu fix; large surface
```

---

### Expected Outcomes

After all phases are complete:

| Metric | Before (v2.3) | After (v2.6) |
|--------|--------------|--------------|
| `scheduler.py` size | 877 lines | ~100 lines |
| `routes/hosts.py` size | 760 lines | ~350 lines |
| `App.jsx` size | 4,515 lines | ~150 lines |
| Total frontend files | 3 | ~29 |
| Dead functions | 10 | 0 |
| Duplicate logic groups | 7 | 0 |
| Config drift scenarios | 3 | 0 |
| `App()` useState count | 87 | ~8 |
| Services modules | 0 | 3 |
| Dead package dependencies | 1 | 0 |
| `Host.token_hash` writes | 2 (per create/regen) | 0 |

---

### Pre-Implementation Checklist

Before beginning Phase 1, confirm:

- [ ] Current codebase is at clean v2.3 HEAD (no uncommitted changes)
- [ ] Docker build succeeds from scratch: `docker compose up -d --build`
- [ ] Login works in a running instance
- [ ] At least one app and one host are configured in the test instance for verification
- [ ] A test Telegram bot is configured for Phase 5 notification testing
- [ ] A test agent is reachable for Phase 6 update execution testing
- [ ] DB backup exists before Phase 4 (schema migration)

---

### Implementation Session Structure

**Session 1 — Phases 1, 2, 3 (v2.4 backend cleanup)**
- Estimated duration: 1–2 hours
- No behavior changes; verification is fast
- Commit each phase separately; do not combine phases into one commit
- Ship as v2.4 after Phase 4

**Session 2 — Phase 4 (v2.4 config fix)**
- Estimated duration: 1 hour
- Includes migration v19
- Requires careful seeding logic testing before commit
- Ship v2.4 after this session

**Session 3 — Phases 5, 6 (v2.5 decomposition)**
- Estimated duration: 3–4 hours
- Largest backend change
- Requires full notification + update path verification
- Ship v2.5 after verification passes

**Session 4+ — Phase 7 (v2.6 frontend)**
- Estimated duration: multiple sessions
- 11 extraction steps, one commit each
- Ship v2.6 after all 11 steps are complete and smoke-tested
