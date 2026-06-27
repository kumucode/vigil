"""
services/version_checker.py — Registry fetching and version comparison for Vigil.

Owns:
  - Registry fetchers       (fetch_dockerhub_latest, fetch_github_*, fetch_gitlab_*,
                              fetch_gitea_latest, fetch_quay_latest)
  - Tag routing             (resolve_latest_version)
  - Version comparison      (_semver_key, _smart_gte, _version_bump_type)
  - Tag classification      (_is_version_tag, _extract_tag_prefix, etc.)
  - Per-app check worker    (check_one)  ← renamed from _check_one; now public

Extracted from scheduler.py in v2.5.

Bug fixed in this extraction:
  _FLOAT_WORDS was previously defined as a local variable inside _semver_key
  and referenced by _smart_gte. This caused a NameError on every version
  comparison where current != latest, silently caught as 'Worker error' in
  run_version_checks. Promoted to module level here to fix it.
"""

import json
import logging
import os
import re
from datetime import datetime, timezone

import requests
from config import SKIP_TAGS

log = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

DOCKERHUB_API = "https://hub.docker.com/v2/repositories"
GITHUB_API    = "https://api.github.com"
QUAY_API      = "https://quay.io/api/v1/repository"

MAX_WORKERS = 10
MAX_HISTORY = 20

# Module-level alias used throughout this module
_SKIP_TAGS = SKIP_TAGS

# _FLOAT_WORDS: the same set as _SKIP_TAGS.
# Previously defined as a local variable inside _semver_key, which caused
# _smart_gte to throw NameError when it referenced this name. Promoted here.
_FLOAT_WORDS = SKIP_TAGS

_VERSION_RE = re.compile(r"^\d+[\.\\d]*")

# Matches OS/distro suffixes in compound tags like "latest-ubuntu18.04", "1.2.3-alpine3.18"
_OS_SUFFIX_RE = re.compile(
    r"[.-](ubuntu[\d.]*|debian[\d.]*|alpine[\d.]*|centos[\d.]*|fedora[\d.]*"
    r"|rhel[\d.]*|buster|bullseye|bookworm|focal|jammy|noble|bionic|xenial"
    r"|slim|fpm|cli|apache|nginx|arm64|amd64|arm32|armhf|armv7|windows)$",
    re.IGNORECASE,
)

# Common suffixes that ghcr.io image names have that the actual GitHub repo doesn't
_GHCR_REPO_SUFFIXES = [
    "-server", "-web", "-worker", "-microservices", "-machine-learning",
    "-proxy", "-api", "-backend", "-frontend", "-app", "-cli", "-agent",
    "-daemon", "-service", "-hub", "-core", "-base", "-node", "-client",
]


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _gh_headers() -> dict:
    t = os.getenv("GITHUB_TOKEN", "")
    return {"Authorization": f"token {t}"} if t else {}


def _gl_headers() -> dict:
    t = os.getenv("GITLAB_TOKEN", "")
    return {"PRIVATE-TOKEN": t} if t else {}


# ── Version comparison ────────────────────────────────────────────────────────

def _semver_key(tag: str) -> tuple:
    """
    Parse a tag into a tuple of ints for semver comparison.
    Strips leading 'v' and handles:
      - Plain semver:             "v2.5.6"       → (2, 5, 6)
      - Trailing floating suffix: "13.0-latest"  → (13, 0)
      - Channel-versioned tags:   "nightly-0.8.9.15" → (0, 8, 9, 15)
    """
    t = tag.lstrip("v").lower()
    # Strip leading channel keyword prefix (e.g. "nightly-0.8.9.15" → "0.8.9.15")
    for kw in _FLOAT_WORDS:
        m = re.match(r"^" + re.escape(kw) + r"[.\-_](\d.*)$", t)
        if m:
            t = m.group(1)
            break
    # Strip trailing floating suffix (e.g. "13.0-latest" → "13.0")
    m2 = re.match(r"^([\d.]+)[.-]([a-zA-Z]+)$", t)
    if m2 and m2.group(2) in _FLOAT_WORDS:
        t = m2.group(1)
    try:
        return tuple(int(x) for x in re.split(r"[.\-_]", t) if x.isdigit())
    except Exception:
        return (0,)


def _smart_gte(cur: str, lat: str):
    """
    Returns True if cur >= lat (up-to-date), False if cur < lat (outdated).
    Handles:
      - Plain semver:              "1.25.5" vs "1.26.0"
      - Channel-versioned tags:    "nightly-0.8.9.46" vs "nightly-0.9.0.7"
      - Channel-build short codes: "pr-4990" vs "pr-5218"
    Returns None when formats are truly incompatible (e.g. "pr-4990" vs "0.60.3").
    """
    if not cur or not lat:
        return True
    _n      = lambda s: s.lstrip("v")
    nc, nl  = _n(cur), _n(lat)
    if nc == nl:
        return True

    # Detect whether each side has a channel prefix (nightly-X, beta-X, etc.)
    # _FLOAT_WORDS is now module-level — no more NameError
    def _has_channel(s: str) -> bool:
        return any(
            re.match(r"^" + re.escape(kw) + r"[.\-_]\d", s.lower())
            for kw in _FLOAT_WORDS
        )

    cur_has_channel = _has_channel(nc)
    lat_has_channel = _has_channel(nl)

    # Both channel-versioned with same channel prefix → use _semver_key
    if cur_has_channel and lat_has_channel:
        return _semver_key(nc) >= _semver_key(nl)

    # Both plain semver (no channel prefix) → use _semver_key
    if not cur_has_channel and not lat_has_channel:
        try:
            kc = tuple(int(x) for x in nc.split("."))
            kl = tuple(int(x) for x in nl.split("."))
            return kc >= kl
        except ValueError:
            pass
        # Channel-build short codes with same prefix: "pr-4990" vs "pr-5218"
        mc = re.match(r"^(.*[a-zA-Z][.-]?)([0-9]+)$", nc)
        ml = re.match(r"^(.*[a-zA-Z][.-]?)([0-9]+)$", nl)
        if mc and ml and mc.group(1) == ml.group(1):
            return int(mc.group(2)) >= int(ml.group(2))

    # Mixed formats (one has channel prefix, other doesn't) → incompatible
    return None


def _version_bump_type(old: str, new: str) -> str:
    try:
        o = tuple(int(x) for x in old.lstrip("v").split("."))
        n = tuple(int(x) for x in new.lstrip("v").split("."))
        if n[0] > o[0]:
            return "major"
        if len(n) > 1 and len(o) > 1 and n[1] > o[1]:
            return "minor"
        return "patch"
    except Exception:
        return "unknown"


# ── Tag classification helpers ────────────────────────────────────────────────

def _is_version_tag(tag: str) -> bool:
    """
    Returns True if the tag looks like a specific version number.

    Rules:
      - Bare floating keywords (nightly, latest, stable…) → False
      - Compound tags ENDING in a floating keyword (1.2-nightly, 13.0-latest) → False
      - Plain semver / date-version starting with a digit → True
      - Channel-versioned tags: floating keyword FOLLOWED BY a version number
        e.g. "nightly-0.8.9.15", "beta-1.2.3", "edge-20240101" → True
      - Channel-build short codes (pr-5229, rc1, v2-s6) → True
    """
    if not tag:
        return False

    t_lower = tag.lower()

    # Bare floating keyword
    if t_lower in _SKIP_TAGS:
        return False

    # Compound tag ENDING in a floating keyword → floating
    for kw in _SKIP_TAGS:
        if re.search(r"[.\-_]" + re.escape(kw) + r"$", t_lower):
            return False

    # Channel-versioned tag: starts with a floating keyword + separator + version digits
    for kw in _SKIP_TAGS:
        m = re.match(r"^" + re.escape(kw) + r"[.\-_](\d[\d.\-_a-zA-Z]*)$", t_lower)
        if m and re.search(r"\d", m.group(1)):
            return True

    t = tag.lstrip("v")
    # Plain semver or date-version: starts with digit
    if re.match(r"^\d", t):
        return True
    # Channel-build short codes: letter-prefix + digits (e.g. pr-5229, rc1)
    if re.match(r"^.*[a-zA-Z][.-]?\d+$", t) and re.search(r"\d", t):
        return True
    return False


def _extract_tag_prefix(image: str):
    """
    Return the floating keyword if the stored tag is a compound floating tag,
    in either direction:
      - keyword-first:  "nightly-0.8.9.15" → "nightly"
      - version-first:  "13.0-latest"       → "latest"
    Returns None for plain versions or bare floating words.
    """
    if ":" not in image:
        return None
    tag = image.split(":", 1)[1]
    for keyword in _SKIP_TAGS:
        if re.match(r"^" + re.escape(keyword) + r"[.-](\d[\d.]*)$", tag):
            return keyword          # keyword-first: "nightly-0.8.9.15"
        if re.match(r"^(\d[\d.]*)[.-]" + re.escape(keyword) + r"$", tag):
            return keyword          # version-first: "13.0-latest"
    return None


def _extract_version_series(image: str):
    """
    For version-first compound tags like "13.0-latest", extract the version
    series prefix ("13.0") so we can find the newest tag in that series.
    Returns None for keyword-first or plain tags.
    """
    if ":" not in image:
        return None
    tag = image.split(":", 1)[1]
    for keyword in _SKIP_TAGS:
        m = re.match(r"^(\d[\d.]*)[.-]" + re.escape(keyword) + r"$", tag)
        if m:
            return m.group(1)       # e.g. "13.0"
    return None


def _extract_channel_prefix(tag: str):
    """
    Detect channel-build style tags like "v2-s6", "v2-s12", "2.1-ls45", "pr-4990".
    Returns (prefix, build_num) e.g. ("v2-s", 6) for "v2-s6".
    Returns (None, None) for plain versions, semver, or bare floating words.
    """
    if tag in _SKIP_TAGS:
        return None, None
    m = re.match(r"^(.*[a-zA-Z][.-]?)([0-9]+)$", tag)
    if m:
        prefix, num = m.group(1), int(m.group(2))
        if len(prefix) >= 2 and re.search(r"[a-zA-Z]", prefix):
            return prefix, num
    return None, None


# ── Registry fetchers ─────────────────────────────────────────────────────────

def fetch_dockerhub_latest(
    image: str,
    tag_prefix=None,
    channel_tag=None,
    version_series=None,
):
    """
    Fetch the latest tag from Docker Hub.

    tag_prefix:     if set (e.g. "nightly"), only consider tags starting with
                    "nightly-" and return the one with the highest version suffix.
    channel_tag:    full tag string for OS-suffix and channel-build detection.
    version_series: for version-first compound tags, the version series prefix.
    """
    parts  = image.split("/")
    ns, repo = ("library", parts[0]) if len(parts) == 1 else (parts[0], "/".join(parts[1:]))

    def _fetch_all_tags(page_size=100, ordering="name"):
        url = f"{DOCKERHUB_API}/{ns}/{repo}/tags/?page_size={page_size}&ordering={ordering}"
        r   = requests.get(url, timeout=12)
        r.raise_for_status()
        return [t["name"] for t in r.json().get("results", [])]

    if tag_prefix:
        all_tags   = _fetch_all_tags(100)
        prefix_re  = re.compile(r"^" + re.escape(tag_prefix) + r"[.-](\d[\d.]*)$")
        matched    = [(t, m.group(1)) for t in all_tags if (m := prefix_re.match(t))]
        if matched:
            matched.sort(key=lambda x: _semver_key(x[1]), reverse=True)
            return matched[0][0], "dockerhub"
        if tag_prefix in all_tags:
            return tag_prefix, "dockerhub"
        all_tags_plain = [t for t in all_tags if t not in _SKIP_TAGS and _VERSION_RE.match(t)]
        ver = sorted(all_tags_plain, key=_semver_key, reverse=True)[0] if all_tags_plain else None
        return ver, "dockerhub"

    # OS/distro-suffix compound tags (e.g. "latest-ubuntu18.04", "1.2-alpine")
    if channel_tag:
        os_m = _OS_SUFFIX_RE.search(channel_tag)
        if os_m:
            os_suffix   = os_m.group(0)
            all_tags    = _fetch_all_tags(100)
            suffix_tags = [t for t in all_tags if t.endswith(os_suffix)]
            versioned   = []
            for t in suffix_tags:
                prefix = t[:-len(os_suffix)]
                if _VERSION_RE.match(prefix):
                    versioned.append((t, prefix))
            if versioned:
                versioned.sort(key=lambda x: _semver_key(x[1]), reverse=True)
                return versioned[0][0], "dockerhub"
            if channel_tag in all_tags:
                return channel_tag, "dockerhub"

    # Version-series tags (e.g. "13.0-latest" → find newest "13.0.x")
    if version_series:
        all_tags    = _fetch_all_tags(100)
        series_re   = re.compile(r"^" + re.escape(version_series) + r"\.([0-9][0-9.]*)$")
        series_matched = [(t, m.group(1)) for t in all_tags if (m := series_re.match(t))]
        if series_matched:
            series_matched.sort(key=lambda x: _semver_key(x[1]), reverse=True)
            return series_matched[0][0], "dockerhub"
        if channel_tag and channel_tag in all_tags:
            return channel_tag, "dockerhub"

    # Channel-build tag detection (e.g. "v2-s6", "2.1-ls45")
    if channel_tag:
        ch_prefix, _ = _extract_channel_prefix(channel_tag)
        if ch_prefix:
            all_tags = _fetch_all_tags(100, ordering="last_updated")
            ch_re    = re.compile(r"^" + re.escape(ch_prefix) + r"([0-9]+)$")
            ch_matched = [(t, int(m.group(1))) for t in all_tags if (m := ch_re.match(t))]
            if not ch_matched:
                all_tags2  = _fetch_all_tags(100, ordering="name")
                ch_matched = [(t, int(m.group(1))) for t in all_tags2 if (m := ch_re.match(t))]
            if ch_matched:
                ch_matched.sort(key=lambda x: x[1], reverse=True)
                return ch_matched[0][0], "dockerhub"
            if channel_tag in all_tags:
                return channel_tag, "dockerhub"

    # Default: semver-sort recently-pushed tags
    tags  = _fetch_all_tags(50, ordering="last_updated")
    vtags = [t for t in tags if t not in _SKIP_TAGS and _VERSION_RE.match(t)]
    ver   = sorted(vtags, key=_semver_key, reverse=True)[0] if vtags else None
    return ver, "dockerhub"


def fetch_github_latest(owner: str, repo: str):
    url = f"{GITHUB_API}/repos/{owner}/{repo}/releases/latest"
    r   = requests.get(url, headers=_gh_headers(), timeout=12)
    r.raise_for_status()
    ver = r.json().get("tag_name", "").lstrip("v") or None
    return ver, "github"


def fetch_github_latest_smart(owner: str, repo_image: str):
    """
    Try to find the GitHub release for a ghcr.io image.
    The image repo name (e.g. 'immich-server') often differs from the
    actual GitHub repo name (e.g. 'immich'). Tries multiple candidates.
    """
    candidates = [repo_image]
    for suffix in _GHCR_REPO_SUFFIXES:
        if repo_image.endswith(suffix):
            base = repo_image[:-len(suffix)]
            if base and base not in candidates:
                candidates.append(base)
    owner_as_repo = owner.removesuffix("-app").removesuffix("-org").removesuffix("-project")
    if owner_as_repo not in candidates:
        candidates.append(owner_as_repo)
    if owner not in candidates:
        candidates.append(owner)

    last_exc = None
    for candidate in candidates:
        try:
            ver, ch = fetch_github_latest(owner, candidate)
            if ver:
                return ver, ch
        except Exception as e:
            last_exc = e
            continue
    if last_exc:
        raise last_exc
    return None, "github"


def fetch_gitlab_latest(host: str, namespace: str, project: str):
    encoded = f"{namespace}%2F{project}"
    url     = f"https://{host}/api/v4/projects/{encoded}/releases?per_page=1"
    r       = requests.get(url, headers=_gl_headers(), timeout=12)
    r.raise_for_status()
    releases = r.json()
    if releases:
        ver = releases[0].get("tag_name", "").lstrip("v") or None
        return ver, "gitlab"
    return None, "gitlab"


def fetch_gitea_latest(host: str, owner: str, repo: str):
    """Query Gitea/Forgejo Releases API. Works with gitea.com, codeberg.org, any self-hosted."""
    url     = f"https://{host}/api/v1/repos/{owner}/{repo}/releases?limit=1&pre-release=false"
    token   = os.getenv("GITEA_TOKEN", "")
    headers = {"Authorization": f"token {token}"} if token else {}
    r       = requests.get(url, headers=headers, timeout=12)
    r.raise_for_status()
    releases = r.json()
    if releases:
        ver = releases[0].get("tag_name", "").lstrip("v") or None
        return ver, "gitea"
    return None, "gitea"


def fetch_quay_latest(namespace: str, repo: str, tag_prefix=None):
    """Query Quay.io tag list, with optional tag_prefix support."""
    url  = f"{QUAY_API}/{namespace}/{repo}/tag/?limit=100&onlyActiveTags=true"
    r    = requests.get(url, timeout=12)
    r.raise_for_status()
    tags = [t["name"] for t in r.json().get("tags", [])]
    if tag_prefix:
        prefix_re = re.compile(r"^" + re.escape(tag_prefix) + r"[-.](\d[\d.]*)$")
        matched   = [(t, m.group(1)) for t in tags if (m := prefix_re.match(t))]
        if matched:
            matched.sort(key=lambda x: _semver_key(x[1]), reverse=True)
            return matched[0][0], "quay"
        return None, "quay"
    vtags = [t for t in tags if t not in _SKIP_TAGS and _VERSION_RE.match(t)]
    ver   = sorted(vtags, key=_semver_key, reverse=True)[0] if vtags else None
    return ver, "quay"


# ── Registry router ───────────────────────────────────────────────────────────

def resolve_latest_version(image: str, version_hint=None):
    """
    Route to the right registry channel based on the image prefix.
    Returns (version | None, channel_string).
    """
    plain          = image.split(":")[0]
    tag_prefix     = _extract_tag_prefix(image)
    version_series = _extract_version_series(image)
    if not tag_prefix and version_hint:
        _img_with_tag  = plain + ":" + version_hint
        tag_prefix     = _extract_tag_prefix(_img_with_tag)
        version_series = _extract_version_series(_img_with_tag)

    # GitHub Container Registry
    if plain.startswith("ghcr.io/"):
        path  = plain.removeprefix("ghcr.io/")
        parts = path.split("/")
        if len(parts) >= 2:
            try:
                ver, ch = fetch_github_latest_smart(parts[0], parts[1])
                if ver:
                    return ver, ch
            except Exception:
                pass
        try:
            return fetch_dockerhub_latest(path, tag_prefix=tag_prefix, channel_tag=version_hint)
        except Exception:
            return None, "unknown"

    # LinuxServer (lscr.io)
    if plain.startswith("lscr.io/"):
        path = plain.removeprefix("lscr.io/")
        try:
            ver, _ = fetch_dockerhub_latest(
                path, tag_prefix=tag_prefix,
                channel_tag=version_hint, version_series=version_series,
            )
            return ver, "lscr"
        except Exception:
            return None, "unknown"

    # GitLab Container Registry
    if plain.startswith("registry.gitlab.com/"):
        path  = plain.removeprefix("registry.gitlab.com/")
        parts = path.split("/")
        if len(parts) >= 2:
            try:
                return fetch_gitlab_latest("gitlab.com", parts[0], parts[1])
            except Exception:
                pass
        return None, "unknown"

    # Quay.io
    if plain.startswith("quay.io/"):
        path  = plain.removeprefix("quay.io/")
        parts = path.split("/")
        if len(parts) >= 2:
            try:
                return fetch_quay_latest(parts[0], parts[1], tag_prefix=tag_prefix)
            except Exception:
                return None, "unknown"

    # Gitea / Forgejo / Codeberg
    parts = plain.split("/")
    if len(parts) >= 3:
        host = parts[0]
        if any(h in host for h in ("gitea", "forgejo", "codeberg")):
            try:
                return fetch_gitea_latest(host, parts[1], parts[2])
            except Exception:
                return None, "unknown"

    # Default: Docker Hub
    try:
        return fetch_dockerhub_latest(
            plain,
            tag_prefix=tag_prefix,
            channel_tag=version_hint,
            version_series=version_series,
        )
    except Exception:
        return None, "unknown"


# ── Per-app check worker ──────────────────────────────────────────────────────

def check_one(app_id: int, flask_app) -> dict | None:
    """
    Check a single app for version updates.

    Previously _check_one() in scheduler.py (private). Now public so routes/apps.py
    can call it directly without importing a private scheduler function.

    Returns a result dict:
      {"id": int, "ok": bool, "notify": bool, ...}  on success
      {"id": int, "ok": False}                        on registry error
      None                                            if app_id not found
    """
    from models import TrackedApp, db
    from services.notifications import should_notify

    with flask_app.app_context():
        entry = db.session.get(TrackedApp, app_id)
        if not entry:
            return None

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

        try:
            latest, channel = resolve_latest_version(entry.image, version_hint=entry.version)
        except Exception as exc:
            entry.status            = "error"
            entry.last_error        = str(exc)
            entry.last_checked_at   = now_str
            entry.detection_channel = "unknown"
            db.session.commit()
            log.warning("Check failed for %s: %s", entry.image, exc)
            return {"id": app_id, "ok": False}

        prev_status = entry.status
        prev_latest = entry.latest_version
        bump        = _version_bump_type(entry.version, latest) if latest else "unknown"

        entry.last_checked_at   = now_str
        entry.last_error        = None
        entry.detection_channel = channel

        _norm     = lambda s: s.lstrip("v") if s else s
        _ver_norm = _norm(entry.version) if entry.version else ""

        _is_floating = not _is_version_tag(_ver_norm)

        if _is_floating:
            entry.status = "pinned"
            if not latest:
                latest = entry.version
            entry.latest_version        = latest
            entry.last_successful_check = now_str

        elif latest or (entry.version and entry.version not in _SKIP_TAGS):
            if not latest:
                latest = entry.version
            entry.latest_version        = latest
            entry.last_successful_check = now_str
            if _norm(entry.version) == _norm(latest):
                entry.status = "up-to-date"
            else:
                cmp = _smart_gte(_norm(entry.version), _norm(latest))
                if cmp is None:
                    entry.status = "unknown"
                elif cmp:
                    entry.status = "up-to-date"
                else:
                    entry.status = "outdated"
        else:
            entry.status = "unknown"

        if latest and latest != prev_latest:
            try:
                history = json.loads(entry.version_history or "[]")
            except Exception:
                history = []
            history.insert(0, {"version": latest, "detected_at": now_str, "bump_type": bump})
            entry.version_history = json.dumps(history[:MAX_HISTORY])

        db.session.commit()

        return {
            "id":          app_id,
            "ok":          True,
            "name":        entry.name,
            "image":       entry.image,
            "version":     entry.version,
            "latest":      latest,
            "prev_status": prev_status,
            "new_status":  entry.status,
            "bump_type":   bump,
            "channel":     channel,
            "notify": (
                entry.status == "outdated"
                and prev_status != "outdated"
                and should_notify(entry, bump)
            ),
        }
