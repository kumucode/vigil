"""
scheduler.py — Concurrent version checking with 6 detection channels.

Channels:
  dockerhub  — Docker Hub tag list  (hub.docker.com)
  github     — GitHub Releases API  (ghcr.io/* and github.com-hosted images)
  gitlab     — GitLab Releases API  (registry.gitlab.com/*)
  gitea      — Gitea/Forgejo API    (any gitea.* or forgejo.* host)
  quay       — Quay.io tag list     (quay.io/*)
  unknown    — fallback / error
"""

import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta

import requests
from apscheduler.schedulers.background import BackgroundScheduler

log = logging.getLogger(__name__)

# Available template variables: {name} {image} {version} {latest} {bump_type} {channel}
DEFAULT_NOTIFY_TEMPLATE = (
    "🐳 *Update: {name}*\n"
    "Current: `{version}`  →  Latest: `{latest}`\n"
    "Bump: `{bump_type}` · Source: {channel}\n"
    "`{image}`"
)

def _render_template(tmpl, r):
    """Substitute template variables. Falls back gracefully on KeyError."""
    CH_LABELS = {"dockerhub":"Docker Hub","github":"GitHub Releases",
                 "gitlab":"GitLab","gitea":"Gitea/Forgejo","quay":"Quay.io","lscr":"LinuxServer (lscr.io)"}
    try:
        return tmpl.format(
            name=r.get('name',''),
            image=r.get('image',''),
            version=r.get('version',''),
            latest=r.get('latest',''),
            bump_type=r.get('bump_type',''),
            channel=CH_LABELS.get(r.get('channel',''),'Registry'),
        )
    except (KeyError, ValueError):
        return DEFAULT_NOTIFY_TEMPLATE.format(
            name=r.get('name',''), image=r.get('image',''),
            version=r.get('version',''), latest=r.get('latest',''),
            bump_type=r.get('bump_type',''),
            channel=CH_LABELS.get(r.get('channel',''),'Registry'),
        )


_scheduler   = None
_last_run_at = None
_last_run_ok = None
_last_run_finished_at = None  # set at END of run, used by frontend polling

DOCKERHUB_API = "https://hub.docker.com/v2/repositories"
GITHUB_API    = "https://api.github.com"
QUAY_API      = "https://quay.io/api/v1/repository"

MAX_WORKERS = 10
MAX_HISTORY = 20

_SKIP_TAGS  = {"latest","stable","nightly","edge","beta","develop","main",
               "master","release","snapshot","test","debug","custom",
               "lts","current","production","prod","next","preview",
               "canary","experimental","dev","trunk","head"}
_VERSION_RE = re.compile(r"^\d+[\.\d]*")
# Matches OS/distro suffixes in compound tags like "latest-ubuntu18.04", "1.2.3-alpine3.18"
# Captures the suffix so we can search for other tags with the same suffix
_OS_SUFFIX_RE = re.compile(
    r"[.-](ubuntu[\d.]*|debian[\d.]*|alpine[\d.]*|centos[\d.]*|fedora[\d.]*"
    r"|rhel[\d.]*|buster|bullseye|bookworm|focal|jammy|noble|bionic|xenial"
    r"|slim|fpm|cli|apache|nginx|arm64|amd64|arm32|armhf|armv7|windows)$",
    re.IGNORECASE
)


def _semver_key(tag):
    """
    Parse a tag into a tuple of ints for semver comparison.
    Strips leading "v" and trailing floating suffixes like "-latest", "-stable".
    e.g. "13.0-latest" → "13.0" → (13, 0)
         "v2.5.6"      → "2.5.6" → (2, 5, 6)
    """
    _FLOAT_WORDS = {"latest","stable","nightly","edge","beta","develop","main",
                    "master","release","snapshot","test","debug","custom"}
    t = tag.lstrip("v")
    # Strip trailing "-word" or ".word" floating suffix
    m = re.match(r"^([\d.]+)[.-]([a-zA-Z]+)$", t)
    if m and m.group(2).lower() in _FLOAT_WORDS:
        t = m.group(1)
    try:    return tuple(int(x) for x in t.split(".") if x)
    except: return (0,)


def _smart_gte(cur, lat):
    """
    Returns True if cur >= lat (up-to-date), False if cur < lat (outdated).
    Handles plain semver AND channel-build tags like "pr-4990" vs "pr-5218".
    Returns None when the two versions are in incompatible formats (e.g. "pr-4990"
    vs "0.60.3") — caller should treat as unknown rather than up-to-date.
    """
    if not cur or not lat: return True
    _n = lambda s: s.lstrip("v")
    nc, nl = _n(cur), _n(lat)
    if nc == nl: return True
    # Plain semver
    try:
        kc = tuple(int(x) for x in nc.split("."))
        kl = tuple(int(x) for x in nl.split("."))
        return kc >= kl
    except ValueError:
        pass
    # Channel-build: same prefix, compare trailing build number (e.g. "pr-4990" vs "pr-5218")
    mc = re.match(r"^(.*[a-zA-Z][.-]?)([0-9]+)$", nc)
    ml = re.match(r"^(.*[a-zA-Z][.-]?)([0-9]+)$", nl)
    if mc and ml and mc.group(1) == ml.group(1):
        return int(mc.group(2)) >= int(ml.group(2))
    # Incompatible formats (e.g. "pr-4990" vs "0.60.3") — cannot compare meaningfully
    return None

def _version_bump_type(old, new):
    try:
        o = tuple(int(x) for x in old.lstrip("v").split("."))
        n = tuple(int(x) for x in new.lstrip("v").split("."))
        if n[0] > o[0]: return "major"
        if len(n)>1 and len(o)>1 and n[1]>o[1]: return "minor"
        return "patch"
    except: return "unknown"

def _gh_headers():
    t = os.getenv("GITHUB_TOKEN", "")
    return {"Authorization": f"token {t}"} if t else {}

def _gl_headers():
    t = os.getenv("GITLAB_TOKEN", "")
    return {"PRIVATE-TOKEN": t} if t else {}


# ── Registry lookups ───────────────────────────────────────────────────────────

def fetch_dockerhub_latest(image, tag_prefix=None, channel_tag=None, version_series=None):
    """
    Fetch the latest tag from Docker Hub.
    tag_prefix: if set (e.g. "nightly"), only consider tags starting with
                "nightly-" or "nightly." and return the one with the highest
                version suffix. This lets us correctly track nightly-0.8.9.15.
    """
    parts = image.split("/")
    ns, repo = ("library", parts[0]) if len(parts) == 1 else (parts[0], "/".join(parts[1:]))

    def _fetch_all_tags(page_size=100, ordering="name"):
        """
        Fetch Docker Hub tags.
        ordering="name"         — alphabetical, best for prefix/series/channel searches
        ordering="-name"        — reverse alphabetical
        ordering="last_updated" — most recently pushed first, best for default semver search
        """
        url = f"{DOCKERHUB_API}/{ns}/{repo}/tags/?page_size={page_size}&ordering={ordering}"
        r = requests.get(url, timeout=12); r.raise_for_status()
        return [t["name"] for t in r.json().get("results", [])]

    if tag_prefix:
        all_tags = _fetch_all_tags(100)
        # Match "nightly-1.2.3" or "nightly.1.2.3" — prefix + separator + version digits
        prefix_re = re.compile(
            r"^" + re.escape(tag_prefix) + r"[.-](\d[\d.]*)$"
        )
        matched = [(t, m.group(1)) for t in all_tags if (m := prefix_re.match(t))]
        if matched:
            matched.sort(key=lambda x: _semver_key(x[1]), reverse=True)
            return matched[0][0], "dockerhub"
        # Fallback: bare prefix tag (e.g. "nightly") exists → pinned to it
        if tag_prefix in all_tags:
            return tag_prefix, "dockerhub"
        # Last resort: fall through to plain semver so channel is still "dockerhub"
        all_tags_plain = [t for t in all_tags if t not in _SKIP_TAGS and _VERSION_RE.match(t)]
        ver = sorted(all_tags_plain, key=_semver_key, reverse=True)[0] if all_tags_plain else None
        return ver, "dockerhub"

    # ── OS/distro-suffix compound tags (e.g. "latest-ubuntu18.04", "1.2-alpine") ─
    # Detect tags like "latest-ubuntu18.04" where the suffix is an OS/distro name.
    # Strategy: find all tags ending with the same OS suffix, pick highest version prefix.
    if channel_tag:
        os_m = _OS_SUFFIX_RE.search(channel_tag)
        if os_m:
            os_suffix = os_m.group(0)  # e.g. "-ubuntu18.04"
            all_tags = _fetch_all_tags(100)
            # Tags ending with this exact OS suffix
            suffix_tags = [t for t in all_tags if t.endswith(os_suffix)]
            # Among those, find ones where the prefix is a version or a skip-keyword
            versioned = []
            for t in suffix_tags:
                prefix = t[:-len(os_suffix)]
                if _VERSION_RE.match(prefix):
                    versioned.append((t, prefix))
            if versioned:
                versioned.sort(key=lambda x: _semver_key(x[1]), reverse=True)
                return versioned[0][0], "dockerhub"
            # Fallback: return the tag itself if it exists (pinned)
            if channel_tag in all_tags:
                return channel_tag, "dockerhub"

    # ── Version-series tags (e.g. "13.0-latest" -> find newest "13.0.x") ────
    if version_series:
        all_tags = _fetch_all_tags(100)
        series_re = re.compile(r"^" + re.escape(version_series) + r"\.([0-9][0-9.]*)$")
        series_matched = [(t, m.group(1)) for t in all_tags if (m := series_re.match(t))]
        if series_matched:
            series_matched.sort(key=lambda x: _semver_key(x[1]), reverse=True)
            return series_matched[0][0], "dockerhub"
        # Fallback: return compound tag itself if it exists on Docker Hub
        if channel_tag and channel_tag in all_tags:
            return channel_tag, "dockerhub"

        # ── Channel-build tag detection (e.g. "v2-s6", "2.1-ls45") ──────────────
    # If version is a channel-build tag, find the latest build in that channel
    if channel_tag:
        ch_prefix, _ = _extract_channel_prefix(channel_tag)
        if ch_prefix:
            # Use last_updated ordering + larger page to catch recent PR/build tags
            all_tags = _fetch_all_tags(100, ordering="last_updated")
            ch_re = re.compile(r"^" + re.escape(ch_prefix) + r"([0-9]+)$")
            ch_matched = [(t, int(m.group(1))) for t in all_tags if (m := ch_re.match(t))]
            if not ch_matched:
                # Try alphabetical ordering as fallback (catches older/lower-numbered tags)
                all_tags2 = _fetch_all_tags(100, ordering="name")
                ch_matched = [(t, int(m.group(1))) for t in all_tags2 if (m := ch_re.match(t))]
            if ch_matched:
                ch_matched.sort(key=lambda x: x[1], reverse=True)
                return ch_matched[0][0], "dockerhub"
            # Tag exists verbatim but no channel family → return it as-is
            if channel_tag in all_tags:
                return channel_tag, "dockerhub"

    # Default behaviour: fetch recently-pushed tags, then semver-sort to find true max.
    # ordering=last_updated ensures we get the most recently published tags (usually
    # the latest releases) rather than alphabetically-first tags which can miss newer
    # versions like "2.14.0" being shadowed by older "2.9.x" in name-ordered results.
    tags  = _fetch_all_tags(50, ordering="last_updated")
    vtags = [t for t in tags if t not in _SKIP_TAGS and _VERSION_RE.match(t)]
    ver   = sorted(vtags, key=_semver_key, reverse=True)[0] if vtags else None
    return ver, "dockerhub"


def fetch_github_latest(owner, repo):
    url = f"{GITHUB_API}/repos/{owner}/{repo}/releases/latest"
    r = requests.get(url, headers=_gh_headers(), timeout=12); r.raise_for_status()
    ver = r.json().get("tag_name", "").lstrip("v") or None
    return ver, "github"


# Common suffixes that ghcr.io image names have that the actual GitHub repo doesn't
_GHCR_REPO_SUFFIXES = [
    "-server", "-web", "-worker", "-microservices", "-machine-learning",
    "-proxy", "-api", "-backend", "-frontend", "-app", "-cli", "-agent",
    "-daemon", "-service", "-hub", "-core", "-base", "-node", "-client",
]

def fetch_github_latest_smart(owner, repo_image):
    """
    Try to find the GitHub release for a ghcr.io image.
    The image repo name (e.g. 'immich-server') often differs from the
    actual GitHub repo name (e.g. 'immich'). We try:
      1. Exact repo name as given
      2. Repo name with known suffixes stripped
      3. The owner name itself as repo (e.g. immich-app/immich)
    Returns (version, "github") or raises on total failure.
    """
    candidates = [repo_image]
    # Try stripping known suffixes
    for suffix in _GHCR_REPO_SUFFIXES:
        if repo_image.endswith(suffix):
            base = repo_image[:-len(suffix)]
            if base and base not in candidates:
                candidates.append(base)
    # Try owner name as repo (e.g. immich-app → immich)
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


def fetch_gitlab_latest(host, namespace, project):
    """
    Query GitLab Releases API.
    host      — e.g. "gitlab.com" or a self-hosted domain
    namespace — e.g. "inkscape"
    project   — e.g. "inkscape"
    """
    encoded = f"{namespace}%2F{project}"
    url = f"https://{host}/api/v4/projects/{encoded}/releases?per_page=1"
    r = requests.get(url, headers=_gl_headers(), timeout=12); r.raise_for_status()
    releases = r.json()
    if releases:
        ver = releases[0].get("tag_name", "").lstrip("v") or None
        return ver, "gitlab"
    return None, "gitlab"


def fetch_gitea_latest(host, owner, repo):
    """
    Query Gitea/Forgejo Releases API.
    Works with gitea.com, codeberg.org, any self-hosted Gitea/Forgejo.
    """
    url = f"https://{host}/api/v1/repos/{owner}/{repo}/releases?limit=1&pre-release=false"
    token = os.getenv("GITEA_TOKEN", "")
    headers = {"Authorization": f"token {token}"} if token else {}
    r = requests.get(url, headers=headers, timeout=12); r.raise_for_status()
    releases = r.json()
    if releases:
        ver = releases[0].get("tag_name", "").lstrip("v") or None
        return ver, "gitea"
    return None, "gitea"


def fetch_quay_latest(namespace, repo, tag_prefix=None):
    """Query Quay.io tag list, with optional tag_prefix support."""
    url = f"{QUAY_API}/{namespace}/{repo}/tag/?limit=100&onlyActiveTags=true"
    r = requests.get(url, timeout=12); r.raise_for_status()
    tags = [t["name"] for t in r.json().get("tags", [])]
    if tag_prefix:
        prefix_re = re.compile(r"^" + re.escape(tag_prefix) + r"[-.](\d[\d.]*)$")
        matched = [(t, m.group(1)) for t in tags if (m := prefix_re.match(t))]
        if matched:
            matched.sort(key=lambda x: _semver_key(x[1]), reverse=True)
            return matched[0][0], "quay"
        return None, "quay"
    vtags = [t for t in tags if t not in _SKIP_TAGS and _VERSION_RE.match(t)]
    ver   = sorted(vtags, key=_semver_key, reverse=True)[0] if vtags else None
    return ver, "quay"


def _extract_tag_prefix(image):
    """
    Return the floating keyword if the stored tag is a compound floating tag,
    in either direction:
      - keyword-first:  "nightly-0.8.9.15" -> "nightly"
      - version-first:  "13.0-latest"       -> "latest"
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


def _extract_version_series(image):
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


def _extract_channel_prefix(tag):
    """
    Detect channel-build style tags like "v2-s6", "v2-s12", "2.1-ls45", "pr-4990".
    Returns (prefix, build_num) e.g. ("v2-s", 6) for "v2-s6", ("pr-", 4990) for "pr-4990".
    Returns (None, None) for plain versions, semver, or bare floating words.
    """
    if tag in _SKIP_TAGS:
        return None, None
    # Allow prefix ending with letter OR with letter-then-separator (e.g. "pr-", "rc-")
    # This covers: "v2-s6" (letter end), "pr-4990" (separator end), "2.1-ls45" (letter end)
    # Excludes plain semver like "2.32.0" (ends with digit, no letter before digits)
    m = re.match(r"^(.*[a-zA-Z][.-]?)([0-9]+)$", tag)
    if m:
        prefix, num = m.group(1), int(m.group(2))
        # Require prefix has >=2 chars and contains at least one letter
        if len(prefix) >= 2 and re.search(r"[a-zA-Z]", prefix):
            return prefix, num
    return None, None


def resolve_latest_version(image, version_hint=None):
    """
    Route to the right registry channel based on the image prefix.
    Returns (version | None, channel_string).
    """
    plain          = image.split(":")[0]   # strip tag
    tag_prefix     = _extract_tag_prefix(image)     # e.g. "nightly" or None
    version_series = _extract_version_series(image) # e.g. "13.0" for "13.0-latest"
    # For version-first tags, build a reconstructed image with tag for prefix extraction
    if not tag_prefix and version_hint:
        _img_with_tag = plain + ":" + version_hint
        tag_prefix     = _extract_tag_prefix(_img_with_tag)
        version_series = _extract_version_series(_img_with_tag)

    # ── GitHub Container Registry ─────────────────────────────────────────────
    if plain.startswith("ghcr.io/"):
        path  = plain.removeprefix("ghcr.io/")
        parts = path.split("/")
        if len(parts) >= 2:
            try:
                ver, ch = fetch_github_latest_smart(parts[0], parts[1])
                if ver: return ver, ch
            except Exception: pass
        try:    return fetch_dockerhub_latest(path, tag_prefix=tag_prefix, channel_tag=version_hint)
        except: return None, "unknown"

    # ── LinuxServer (lscr.io) ────────────────────────────────────────────────
    if plain.startswith("lscr.io/"):
        path = plain.removeprefix("lscr.io/")
        try:
            ver, _ = fetch_dockerhub_latest(path, tag_prefix=tag_prefix, channel_tag=version_hint, version_series=version_series)
            return ver, "lscr"
        except: return None, "unknown"

    # ── GitLab Container Registry ─────────────────────────────────────────────
    if plain.startswith("registry.gitlab.com/"):
        path  = plain.removeprefix("registry.gitlab.com/")
        parts = path.split("/")
        if len(parts) >= 2:
            try:    return fetch_gitlab_latest("gitlab.com", parts[0], parts[1])
            except: pass
        return None, "unknown"

    # ── Quay.io ───────────────────────────────────────────────────────────────
    if plain.startswith("quay.io/"):
        path  = plain.removeprefix("quay.io/")
        parts = path.split("/")
        if len(parts) >= 2:
            try:    return fetch_quay_latest(parts[0], parts[1], tag_prefix=tag_prefix)
            except: return None, "unknown"

    # ── Gitea / Forgejo / Codeberg ────────────────────────────────────────────
    # Pattern: <gitea-host>/<owner>/<repo>  where host contains "gitea", "forgejo", or "codeberg"
    parts = plain.split("/")
    if len(parts) >= 3:
        host = parts[0]
        if any(h in host for h in ("gitea", "forgejo", "codeberg")):
            try:    return fetch_gitea_latest(host, parts[1], parts[2])
            except: return None, "unknown"

    # ── Default: Docker Hub ───────────────────────────────────────────────────
    try:    return fetch_dockerhub_latest(plain, tag_prefix=tag_prefix, channel_tag=version_hint, version_series=version_series)
    except: return None, "unknown"


# ── Notification helpers ───────────────────────────────────────────────────────

def _should_notify(entry, bump_type):
    policy = entry.notify_policy or "always"
    if entry.ignored_version and entry.latest_version == entry.ignored_version:
        return False
    if entry.snoozed_until:
        try:
            if datetime.now(timezone.utc) < datetime.fromisoformat(entry.snoozed_until):
                return False
        except: pass
    if policy == "never":      return False
    if policy == "major_only" and bump_type != "major": return False
    return True


def send_telegram(token, chat_id, text):
    r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                      json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
                      timeout=10)
    r.raise_for_status()


def _send_webhook(url, payload):
    requests.post(url, json=payload, timeout=10)


def _should_send_digest(mode):
    """
    Evaluate whether a digest notification should fire right now.
    Modes:
      daily        — once per day, at digest_time in digest_timezone
      weekly       — once per week, on digest_day(s) at digest_time in digest_timezone
      interval     — every digest_interval_hours hours
    """
    from models import Settings
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    if mode not in ("daily", "weekly", "interval"): return False

    now_utc = datetime.now(timezone.utc)
    last_str = Settings.get("last_digest_sent", "")

    def _last_dt():
        if not last_str: return None
        try:    return datetime.fromisoformat(last_str)
        except: return None

    if mode == "interval":
        try:   hours = max(1, int(Settings.get("digest_interval_hours", "6")))
        except: hours = 6
        last = _last_dt()
        if not last: return True
        return (now_utc - last) >= timedelta(hours=hours)

    # Resolve user timezone — fall back to UTC if invalid/missing
    tz_name = Settings.get("digest_timezone", "UTC") or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, Exception):
        tz = timezone.utc
    now = now_utc.astimezone(tz)

    # Parse target time in user's timezone
    try:
        raw_time = Settings.get("digest_time", "09:00") or "09:00"
        th, tm = map(int, raw_time.split(":"))
        th = max(0, min(23, th)); tm = max(0, min(59, tm))
    except:
        th, tm = 9, 0

    # Not yet time today (in user's timezone)
    if now.hour < th or (now.hour == th and now.minute < tm):
        return False

    if mode == "daily":
        last = _last_dt()
        if not last: return True
        # Already sent today in user's timezone?
        last_local = last.astimezone(tz)
        return last_local.date() < now.date()

    if mode == "weekly":
        try:
            raw = Settings.get("digest_day", "") or ""
            target_days = {int(d.strip()) for d in raw.split(",") if d.strip().isdigit()}
        except:
            target_days = set()
        if not target_days: return False
        # Check weekday in user's timezone
        if now.weekday() not in target_days: return False
        last = _last_dt()
        if not last: return True
        last_local = last.astimezone(tz)
        return last_local.date() < now.date()

    return False


DEFAULT_DIGEST_TEMPLATE = (
    "🐿️ *Vigil — {count} update(s) available*\n\n"
    "{list}\n\n"
    "_{date}_"
)

def _build_digest(apps, template=None):
    tmpl = (template or "").strip() or DEFAULT_DIGEST_TEMPLATE
    lines = []
    name_lines = []
    for a in apps:
        lines.append(f"• *{a.name}*: `{a.version}` → `{a.latest_version}`")
        name_lines.append(f"• {a.name}")
    list_str  = "\n".join(lines)
    names_str = "\n".join(name_lines)
    date_str  = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        return tmpl.format(count=len(apps), list=list_str, names=names_str, date=date_str)
    except (KeyError, ValueError):
        return DEFAULT_DIGEST_TEMPLATE.format(count=len(apps), list=list_str, names=names_str, date=date_str)


# ── Per-app worker ────────────────────────────────────────────────────────────

def _check_one(app_id, flask_app):
    from models import TrackedApp, db
    with flask_app.app_context():
        entry   = db.session.get(TrackedApp, app_id)
        if not entry: return None
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
        _ver_norm   = _norm(entry.version) if entry.version else ""

        def _is_version_tag(tag):
            """
            Returns True if the tag looks like a specific version number.
            A version tag must start with a digit (after stripping leading 'v'),
            OR be a channel-build tag like 'pr-5229' or 'v2-s6'.
            Anything that is purely alphabetic words (lts, latest, nightly, myTag)
            is NOT a version — no blocklist needed.
            Compound tags like '13.0-latest' or '1.2-stable' that end in a
            floating keyword are treated as floating/pinned, not version tags.
            """
            if not tag: return False
            # Compound tag ending in a floating keyword → floating
            for kw in _SKIP_TAGS:
                if tag.lower() == kw: return False          # bare keyword
                if re.search(r"[.\-_]" + re.escape(kw) + r"$", tag.lower()):
                    return False                             # e.g. "13.0-latest", "1.2-stable"
            t = tag.lstrip("v")
            # Plain semver or date-version: starts with digit
            if re.match(r"^\d", t): return True
            # Channel-build: letter-prefix + digits (e.g. pr-5229, v2-s6, rc1)
            if re.match(r"^.*[a-zA-Z][.-]?\d+$", t) and re.search(r"\d", t):
                return True
            return False

        _is_floating = not _is_version_tag(_ver_norm)

        # Floating/pinned versions (including "custom") are handled immediately —
        # they don't need a registry response to know the status.
        if _is_floating:
            entry.status = "pinned"
            # For bare floating words, latest = the word itself; for compound tags
            # prefer the registry result if we got one, else fall back to stored version.
            if not latest:
                latest = entry.version
            entry.latest_version        = latest
            entry.last_successful_check = now_str

        # For non-floating versions: use registry result, or fall back to stored version
        # so the Latest field is never blank.
        elif latest or (entry.version and entry.version not in _SKIP_TAGS):
            if not latest:
                latest = entry.version   # best-effort: show what they're running
            entry.latest_version        = latest
            entry.last_successful_check = now_str
            if _norm(entry.version) == _norm(latest):
                entry.status = "up-to-date"
            else:
                cmp = _smart_gte(_norm(entry.version), _norm(latest))
                if cmp is None:
                    # Incompatible formats — can't compare (e.g. pr-4990 vs 0.60.3)
                    # Show the latest found but mark unknown so user knows something's off
                    entry.status = "unknown"
                elif cmp:
                    entry.status = "up-to-date"
                else:
                    entry.status = "outdated"
        else:
            entry.status = "unknown"

        if latest and latest != prev_latest:
            try:    history = json.loads(entry.version_history or "[]")
            except: history = []
            history.insert(0, {"version": latest, "detected_at": now_str, "bump_type": bump})
            entry.version_history = json.dumps(history[:MAX_HISTORY])

        db.session.commit()
        return {
            "id": app_id, "ok": True,
            "name": entry.name, "image": entry.image,
            "version": entry.version, "latest": latest,
            "prev_status": prev_status, "new_status": entry.status,
            "bump_type": bump, "channel": channel,
            "notify": (
                entry.status == "outdated"
                and prev_status != "outdated"
                and _should_notify(entry, bump)
            ),
        }


# ── Main check job ────────────────────────────────────────────────────────────

def run_version_checks(flask_app, app_ids=None):
    global _last_run_at, _last_run_ok, _last_run_finished_at
    _last_run_at = datetime.now(timezone.utc).isoformat()
    log.info("Version check started…")

    from models import TrackedApp, Settings
    with flask_app.app_context():
        if app_ids:
            all_ids = app_ids
        else:
            all_ids = [a.id for a in TrackedApp.query.all()]

    if not all_ids:
        _last_run_ok = True; _last_run_finished_at = datetime.now(timezone.utc).isoformat(); return

    errors = 0; notify_list = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(_check_one, aid, flask_app): aid for aid in all_ids}
        for future in as_completed(futures):
            try:
                r = future.result()
                if r:
                    if not r["ok"]:       errors += 1
                    elif r.get("notify"): notify_list.append(r)
            except Exception as exc:
                errors += 1; log.error("Worker error: %s", exc)

    with flask_app.app_context():
        token  = Settings.get("telegram_token", "")
        chatid = Settings.get("telegram_chat_id", "")
        hook   = Settings.get("webhook_url", "")
        digest = Settings.get("digest_mode", "immediate")

        CH_LABELS = {"dockerhub":"Docker Hub","github":"GitHub Releases",
                     "gitlab":"GitLab","gitea":"Gitea/Forgejo","quay":"Quay.io","lscr":"LinuxServer (lscr.io)"}

        if digest == "immediate":
            tmpl = Settings.get("notify_template", "")
            for r in notify_list:
                if tmpl:
                    msg = _render_template(tmpl, r)
                else:
                    msg = (f"🐳 *Update: {r['name']}*\n"
                           f"Current: `{r['version']}`  →  Latest: `{r['latest']}`\n"
                           f"Bump: `{r['bump_type']}` · Source: {CH_LABELS.get(r['channel'],'Registry')}\n"
                           f"`{r['image']}`")
                if token and chatid:
                    try:    send_telegram(token, chatid, msg)
                    except Exception as e: log.warning("Telegram: %s", e)
                if hook:
                    try:    _send_webhook(hook, r)
                    except Exception as e: log.warning("Webhook: %s", e)
        else:
            if _should_send_digest(digest):
                outdated = [a for a in TrackedApp.query.all()
                            if a.status == "outdated"
                            and not (a.ignored_version and a.latest_version == a.ignored_version)]
                if outdated:
                    digest_tmpl = Settings.get("digest_template", "")
                    msg = _build_digest(outdated, template=digest_tmpl)
                    if token and chatid:
                        try:    send_telegram(token, chatid, msg)
                        except Exception as e: log.warning("Telegram: %s", e)
                    if hook:
                        try:    _send_webhook(hook, {"digest": [a.to_dict() for a in outdated]})
                        except Exception as e: log.warning("Webhook: %s", e)
                    Settings.set("last_digest_sent", datetime.now(timezone.utc).isoformat())

    _last_run_ok = errors == 0
    _last_run_finished_at = datetime.now(timezone.utc).isoformat()
    log.info("Check done — %d apps, %d errors.", len(all_ids), errors)

    # ── Scan summary notification ─────────────────────────────────────────────
    with flask_app.app_context():
        if Settings.get("scan_summary_notify", "off") == "on":
            token   = Settings.get("telegram_token",  "")
            chat_id = Settings.get("telegram_chat_id", "")
            if token and chat_id:
                from models import TrackedApp as _TA
                all_apps  = _TA.query.all()
                outdated  = [a for a in all_apps if a.status == "outdated"]
                err_apps  = [a for a in all_apps if a.status == "error"]
                lines = [f"📊 *Vigil scan complete* — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"]
                if outdated:
                    lines.append(f"🔴 {len(outdated)} outdated: " + ", ".join(a.name for a in outdated[:10]))
                if err_apps:
                    lines.append(f"⚠️ {len(err_apps)} errors: " + ", ".join(a.name for a in err_apps[:5]))
                if not outdated and not err_apps:
                    lines.append("✅ All apps are up to date.")
                try:
                    send_telegram(token, chat_id, "\n".join(lines))
                    log.info("Scan summary sent to Telegram.")
                except Exception as exc:
                    log.warning("Scan summary telegram error: %s", exc)


# ── Scheduler setup ───────────────────────────────────────────────────────────

def start_scheduler(flask_app):
    global _scheduler
    hours = int(os.getenv("CHECK_INTERVAL_HOURS", "6"))
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(run_version_checks, args=[flask_app], trigger="interval",
                       hours=hours, id="version_check", replace_existing=True)
    _scheduler.start()
    log.info("Scheduler started — every %d hour(s).", hours)
    return _scheduler


def get_scheduler_status():
    running = _scheduler is not None and _scheduler.running
    next_run = None
    if _scheduler and running:
        job = _scheduler.get_job("version_check")
        if job and job.next_run_time:
            next_run = job.next_run_time.isoformat()
    return {"running": running, "last_run_at": _last_run_at,
            "last_run_ok": _last_run_ok, "next_run_at": next_run,
            "last_run_finished_at": _last_run_finished_at}


def reschedule_interval(hours: int):
    """Update the check interval live — no restart required."""
    if _scheduler and _scheduler.running:
        _scheduler.reschedule_job("version_check", trigger="interval", hours=hours)
        log.info("Scheduler rescheduled — now every %d hour(s).", hours)
