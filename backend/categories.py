"""
categories.py — Auto-categorisation logic and DB seeding.

Exports:
  auto_categorize(image)         → str
  ensure_default_categories()    → None
  recategorize_all()             → int
"""

import logging

from models import Category, Settings, TrackedApp, db

log = logging.getLogger(__name__)

# ── Built-in keyword map ───────────────────────────────────────────────────────
#
# Key   = category key stored in DB
# Value = list of lowercase substrings matched against the bare image name
#         (registry prefix and tag are stripped before matching)

BUILTIN_KEYWORDS = {
    "media":        ["jellyfin","plex","emby","radarr","sonarr","bazarr","overseerr",
                     "tautulli","prowlarr","lidarr","readarr","jellyseerr","unmanic","tdarr",
                     "tubesync","pinchflat","metube","requestrr","recyclarr","whisparr","mylar"],
    "music":        ["navidrome","beets","mopidy","airsonic","gonic","koel","ampache",
                     "funkwhale","lms","music-assistant"],
    "books":        ["audiobookshelf","kavita","komga","calibre","ubooquity",
                     "lazylibrarian","cops","booksonic"],
    "productivity": ["onlyoffice","collabora","libreoffice","cryptpad","bookstack",
                     "wikijs","wiki","outline","hedgedoc","nextcloud","vikunja","plane",
                     "wekan","planka","excalidraw","drawio","affine","appflowy",
                     "notesnook","joplin","silverbullet","flatnotes","stirling","paperless"],
    "networking":   ["nginx","traefik","caddy","haproxy","pihole","adguard","wireguard",
                     "unbound","coredns","tailscale","cloudflared","ddclient","duckdns",
                     "swag","letsencrypt","certbot","frp","zerotier",
                     "nginx-proxy-manager","nginxproxymanager","technitium","blocky"],
    "monitoring":   ["grafana","prometheus","alertmanager","loki","tempo","influxdb",
                     "uptime-kuma","zabbix","checkmk","netdata","gatus","healthchecks",
                     "scrutiny","ntopng","librenms","zoneminder","frigate","shinobi",
                     "motioneye","double-take","deepstack","smokeping"],
    "database":     ["postgres","postgresql","mysql","mariadb","mongodb","redis","sqlite",
                     "elasticsearch","opensearch","cassandra","neo4j","clickhouse",
                     "pgadmin","adminer","phpmyadmin","couchdb","questdb","surrealdb"],
    "storage":      ["minio","seafile","syncthing","filebrowser","sftpgo","immich",
                     "photoprism","mealie","tandoor","grocy","freshrss","miniflux",
                     "nzbget","sabnzbd","nzbhydra","jackett","deluge","qbittorrent",
                     "transmission","rtorrent","flaresolverr","bookstack"],
    "security":     ["vaultwarden","bitwarden","authelia","authentik","keycloak","crowdsec",
                     "fail2ban","vault","openvpn","wazuh","portainer","wg-easy","passbolt",
                     "infisical","step-ca","semaphore"],
    "development":  ["gitea","gitlab","gogs","drone","woodpecker","concourse","harbor",
                     "nexus","argocd","flux","tekton","sonarqube","verdaccio","forgejo",
                     "jenkins","act","earthly"],
    "automation":   ["n8n","node-red","nodered","activepieces","huginn","automatisch",
                     "changedetection","apprise","ntfy","homer","dasherr","heimdall",
                     "flame","homarr"],
    "ai":           ["ollama","open-webui","openwebui","stable-diffusion","automatic1111",
                     "comfyui","localai","text-generation","koboldai","tabbyapi","whisper",
                     "faster-whisper","invokeai","lobe-chat","anything-llm","anythingllm"],
    "gaming":       ["minecraft","pterodactyl","panel","wings","gameserver","romm",
                     "playnite","emulatorjs","retroarcher"],
    "communication":["matrix","synapse","element","mattermost","rocketchat","rocket.chat",
                     "jitsi","mumble","teamspeak","ntfy","gotify","apprise","signal","memos"],
    "smart-home":   ["home-assistant","homeassistant","node-red","nodered","mosquitto",
                     "zigbee2mqtt","zwavejs","esphome","scrypted","ring-mqtt"],
}

# Default visual categories seeded into the DB on first run
_DEFAULT_CATEGORIES = [
    ("media",      "Media",      "#e05c5c", 10),
    ("networking", "Networking", "#3c8ce0", 20),
    ("monitoring", "Monitoring", "#e0a83c", 30),
    ("storage",    "Storage",    "#3ce0a8", 40),
    ("security",   "Security",   "#a83ce0", 50),
    ("database",   "Database",   "#3ce05c", 60),
    ("devops",     "DevOps",     "#e03c8c", 70),
]


def auto_categorize(image: str) -> str:
    """
    Return the best-matching category key for an image string.

    1. DB categories (user-defined keywords) are checked first so that
       user customisations always win over the built-in list.
    2. Built-in keywords are used as a fallback.
    3. Returns 'uncategorized' if nothing matches.
    """
    name = image.lower().split("/")[-1].split(":")[0]

    for cat in Category.query.all():
        for kw in (cat.keywords or "").split(","):
            kw = kw.strip().lower()
            if kw and kw in name:
                return cat.key

    for cat_key, keywords in BUILTIN_KEYWORDS.items():
        if any(kw in name for kw in keywords):
            return cat_key

    return "uncategorized"


def ensure_default_categories() -> None:
    """Seed the built-in category rows if they do not already exist."""
    for key, label, color, order in _DEFAULT_CATEGORIES:
        if not Category.query.filter_by(key=key).first():
            db.session.add(Category(
                key=key, label=label, color=color,
                sort_order=order, is_default=True,
                keywords=",".join(BUILTIN_KEYWORDS.get(key, [])),
            ))

    # Seed default app logo (squirrel mascot) if not already set
    if not Settings.get("app_logo"):
        # Inline the default PNG logo (same as before — kept in one place)
        from _default_logo import DEFAULT_LOGO_B64
        Settings.set("app_logo", DEFAULT_LOGO_B64)

    db.session.commit()


def recategorize_all() -> int:
    """
    Re-run auto-categorisation on every app that hasn't been manually locked.

    Runs on ALL non-locked apps (not just uncategorized) so that keyword
    changes take effect immediately without needing to delete and re-add cards.
    """
    updated = 0
    for entry in TrackedApp.query.filter_by(category_locked=False).all():
        best = auto_categorize(entry.image)
        if best != entry.category:
            entry.category = best
            updated += 1
    if updated:
        db.session.commit()
    log.info("[recategorize] %d app(s) updated", updated)
    return updated
