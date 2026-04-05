"""
migrations.py — Forward-only versioned schema migrations.
"""

import logging
import sqlalchemy as sa

log = logging.getLogger(__name__)

DEFAULT_CATEGORIES = [
    ("media",        "Media",          "#e05c5c", "jellyfin,plex,emby,radarr,sonarr,bazarr,overseerr,tautulli,prowlarr,lidarr,readarr,jellyseerr,unmanic,tdarr,tubesync,pinchflat,metube,requestrr,recyclarr,whisparr,mylar", 10),
    ("music",        "Music",          "#e08c3c", "navidrome,beets,mopidy,airsonic,gonic,koel,ampache,funkwhale,lms,music-assistant",                                                                                             20),
    ("books",        "Books",          "#c47c2e", "audiobookshelf,kavita,komga,calibre,ubooquity,readarr,lazylibrarian,cops,booksonic",                                                                                           25),
    ("productivity", "Productivity",   "#3c8ce0", "onlyoffice,collabora,libreoffice,cryptpad,bookstack,wikijs,wiki,outline,hedgedoc,nextcloud,vikunja,plane,wekan,planka,excalidraw,drawio,affine,appflowy,notesnook,joplin,silverbullet,flatnotes,stirling,paperless", 30),
    ("networking",   "Networking",     "#3ce08c", "nginx,traefik,caddy,haproxy,pihole,adguard,wireguard,unbound,coredns,tailscale,cloudflared,ddclient,duckdns,swag,letsencrypt,certbot,frp,zerotier,nginx-proxy-manager,nginxproxymanager,technitium,blocky", 40),
    ("monitoring",   "Monitoring",     "#b03ce0", "grafana,prometheus,alertmanager,loki,tempo,influxdb,uptime-kuma,uptime,zabbix,checkmk,netdata,gatus,healthchecks,scrutiny,ntopng,librenms,zoneminder,frigate,shinobi,motioneye,double-take,deepstack,smokeping", 50),
    ("database",     "Database",       "#e0c43c", "postgres,postgresql,mysql,mariadb,mongodb,redis,sqlite,elasticsearch,opensearch,cassandra,neo4j,clickhouse,pgadmin,adminer,phpmyadmin,couchdb,questdb,surrealdb",              60),
    ("storage",      "Storage",        "#3ce0d8", "minio,seafile,syncthing,filebrowser,sftpgo,immich,photoprism,mealie,tandoor,grocy,freshrss,miniflux,nzbget,sabnzbd,nzbhydra,jackett,deluge,qbittorrent,transmission,rtorrent,flaresolverr", 70),
    ("security",     "Security",       "#e03c6c", "vaultwarden,bitwarden,authelia,authentik,keycloak,crowdsec,fail2ban,vault,openvpn,wazuh,portainer,wg-easy,passbolt,infisical,step-ca,semaphore",                              80),
    ("development",  "Development",    "#8ce03c", "gitea,gitlab,gogs,drone,woodpecker,concourse,harbor,nexus,argocd,flux,tekton,sonarqube,verdaccio,forgejo,jenkins,act,earthly",                                                90),
    ("automation",   "Automation",     "#c43ce0", "n8n,node-red,nodered,activepieces,huginn,automatisch,changedetection,apprise,ntfy,homer,dasherr,heimdall,flame,homarr",                                                       100),
    ("ai",           "AI & ML",        "#e03c8c", "ollama,open-webui,openwebui,stable-diffusion,automatic1111,comfyui,localai,text-generation,koboldai,tabbyapi,whisper,faster-whisper,invokeai,lobe-chat,anything-llm,anythingllm", 110),
    ("gaming",       "Gaming",         "#3c5ce0", "minecraft,pterodactyl,panel,wings,gameserver,romm,playnite,emulatorjs,retroarcher",                                                                                            120),
    ("communication","Communication",  "#3cb8e0", "matrix,synapse,element,mattermost,rocketchat,rocket.chat,jitsi,mumble,teamspeak,ntfy,gotify,apprise,signal,memos",                                                             130),
    ("smart-home",   "Smart Home",     "#e0a03c", "home-assistant,homeassistant,node-red,nodered,mosquitto,zigbee2mqtt,zwavejs,esphome,scrypted,ring-mqtt",                                                                       140),
]


def _col_exists(insp, table, col):
    return col in {c["name"] for c in insp.get_columns(table)}

def _table_exists(insp, table):
    return table in insp.get_table_names()


def migration_1(conn, insp):
    if not _col_exists(insp, "tracked_apps", "custom_icon"):
        conn.execute(sa.text("ALTER TABLE tracked_apps ADD COLUMN custom_icon VARCHAR(500)"))
        log.info("  [v1] tracked_apps.custom_icon")

def migration_2(conn, insp):
    for col, t in [("last_error","TEXT"),("last_checked_at","VARCHAR(40)"),("last_successful_check","VARCHAR(40)")]:
        if not _col_exists(insp, "tracked_apps", col):
            conn.execute(sa.text(f"ALTER TABLE tracked_apps ADD COLUMN {col} {t}"))
            log.info("  [v2] tracked_apps.%s", col)

def migration_3(conn, insp):
    for col, t in [("notify_policy","VARCHAR(20) NOT NULL DEFAULT 'always'"),
                   ("ignored_version","VARCHAR(100)"),("snoozed_until","VARCHAR(40)"),
                   ("version_history","TEXT DEFAULT '[]'")]:
        if not _col_exists(insp, "tracked_apps", col):
            conn.execute(sa.text(f"ALTER TABLE tracked_apps ADD COLUMN {col} {t}"))
            log.info("  [v3] tracked_apps.%s", col)

def migration_4(conn, insp):
    for col, t in [("version_source_url","VARCHAR(500)"),
                   ("detection_channel","VARCHAR(30)"),("icon_data","TEXT")]:
        if not _col_exists(insp, "tracked_apps", col):
            conn.execute(sa.text(f"ALTER TABLE tracked_apps ADD COLUMN {col} {t}"))
            log.info("  [v4] tracked_apps.%s", col)

def migration_5(conn, insp):
    """Add users table, categories table, seed defaults."""
    # users — include all columns known to later migrations so fresh installs
    # never hit NOT NULL constraint errors when the seed INSERT runs
    if not _table_exists(insp, "users"):
        conn.execute(sa.text("""
            CREATE TABLE users (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                username         VARCHAR(80)  NOT NULL UNIQUE,
                password_hash    VARCHAR(200) NOT NULL,
                must_change_pw   BOOLEAN      NOT NULL DEFAULT 1,
                created_at       DATETIME,
                totp_secret      VARCHAR(64),
                totp_enabled     BOOLEAN      NOT NULL DEFAULT 0,
                totp_backup_codes TEXT
            )
        """))
        log.info("  [v5] created users table")

    # categories
    if not _table_exists(insp, "categories"):
        conn.execute(sa.text("""
            CREATE TABLE categories (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                key        VARCHAR(50) NOT NULL UNIQUE,
                label      VARCHAR(80) NOT NULL,
                color      VARCHAR(20) NOT NULL DEFAULT '#6b6b8a',
                keywords   TEXT        NOT NULL DEFAULT '',
                is_default BOOLEAN     NOT NULL DEFAULT 0,
                sort_order INTEGER     NOT NULL DEFAULT 100
            )
        """))
        log.info("  [v5] created categories table")

        # Seed defaults
        for key, label, color, kw, order in DEFAULT_CATEGORIES:
            conn.execute(sa.text(
                "INSERT INTO categories (key,label,color,keywords,is_default,sort_order) "
                "VALUES (:k,:l,:c,:kw,1,:o)"
            ), {"k": key, "l": label, "c": color, "kw": kw, "o": order})
        log.info("  [v5] seeded %d default categories", len(DEFAULT_CATEGORIES))

    # Seed admin user (password "admin", must change on first login)
    existing = conn.execute(sa.text("SELECT COUNT(*) FROM users")).fetchone()[0]
    if existing == 0:
        import bcrypt
        pw_hash = bcrypt.hashpw(b"admin", bcrypt.gensalt()).decode()
        # Refresh inspector so we see the current columns at seed time
        _insp = sa.inspect(conn)
        cols = {c["name"] for c in _insp.get_columns("users")}
        # Build INSERT dynamically so it works regardless of which migrations
        # have already run (handles re-runs and partial migration states)
        fields = {"username": "admin", "password_hash": pw_hash, "must_change_pw": 1}
        if "totp_enabled"     in cols: fields["totp_enabled"]     = 0
        if "totp_secret"      in cols: fields["totp_secret"]      = None
        if "totp_backup_codes" in cols: fields["totp_backup_codes"] = None
        keys   = ",".join(fields.keys())
        params = ",".join(f":{k}" for k in fields.keys())
        conn.execute(sa.text(f"INSERT INTO users ({keys}) VALUES ({params})"), fields)
        log.info("  [v5] seeded default admin user (password: admin)")



def migration_6(conn, insp):
    """Auto-categorize any apps still marked as 'uncategorized'."""
    # Load all categories and their keywords
    cats = conn.execute(sa.text(
        "SELECT key, keywords FROM categories WHERE keywords != '' ORDER BY sort_order"
    )).fetchall()
    if not cats:
        log.info("  [v6] no categories found, skipping auto-categorize")
        return

    # Build keyword -> category_key map
    kw_map = []
    for cat_key, kw_str in cats:
        for kw in (k.strip().lower() for k in kw_str.split(",") if k.strip()):
            kw_map.append((kw, cat_key))

    # Find uncategorized apps
    apps = conn.execute(sa.text(
        "SELECT id, image FROM tracked_apps WHERE category = 'uncategorized' OR category IS NULL OR category = ''"
    )).fetchall()

    if not apps:
        log.info("  [v6] no uncategorized apps found")
        return

    patched = 0
    for app_id, image in apps:
        img_lower = image.lower()
        matched = None
        for kw, cat_key in kw_map:
            if kw in img_lower:
                matched = cat_key
                break
        if matched:
            conn.execute(sa.text(
                "UPDATE tracked_apps SET category = :cat WHERE id = :id"
            ), {"cat": matched, "id": app_id})
            log.info("  [v6] %s → %s", image, matched)
            patched += 1

    log.info("  [v6] auto-categorized %d app(s)", patched)

def migration_7(conn, insp):
    """Add notes column to tracked_apps."""
    cols = {c["name"] for c in insp.get_columns("tracked_apps")}
    if "notes" not in cols:
        conn.execute(sa.text("ALTER TABLE tracked_apps ADD COLUMN notes TEXT"))
        log.info("  [v7] added notes column to tracked_apps")


def migration_8(conn, insp):
    """Add install_path column to tracked_apps."""
    cols = {c["name"] for c in insp.get_columns("tracked_apps")}
    if "install_path" not in cols:
        conn.execute(sa.text("ALTER TABLE tracked_apps ADD COLUMN install_path VARCHAR(500)"))
        log.info("  [v8] added install_path column to tracked_apps")


def migration_9(conn, insp):
    """
    Heal existing records where image was stored with an embedded tag
    (e.g. "filebrowser/filebrowser:v2-s6") instead of the correct split
    into image="filebrowser/filebrowser" + version="v2-s6".
    Also heals records where version="latest" but the image has a real tag.
    """
    rows = conn.execute(sa.text("SELECT id, image, version FROM tracked_apps")).fetchall()
    healed = 0
    for row in rows:
        app_id, image, version = row[0], row[1] or "", row[2] or ""
        ci = image.rfind(":")
        si = image.rfind("/")
        if ci > si and ci != -1:
            clean_image = image[:ci]
            tag         = image[ci+1:]
            # Update image to tag-stripped form; update version only if it
            # was the default "latest" (meaning the user never set it explicitly)
            # or if it matches the old full string (defensive)
            new_version = tag if (version in ("latest", "", image) or version == tag) else version
            conn.execute(sa.text(
                "UPDATE tracked_apps SET image=:img, version=:ver, "
                "latest_version=NULL, status='unknown', detection_channel=NULL "
                "WHERE id=:id"
            ), {"img": clean_image, "ver": new_version, "id": app_id})
            log.info("  [v9] healed app %d: image '%s' → '%s', version → '%s'",
                     app_id, image, clean_image, new_version)
            healed += 1
    if healed:
        log.info("  [v9] healed %d app record(s) with embedded image tags", healed)
    else:
        log.info("  [v9] no records needed healing")




def migration_10(conn, insp):
    """Add TOTP columns (totp_secret, totp_enabled) to the users table."""
    cols = {c["name"] for c in insp.get_columns("users")}
    if "totp_secret" not in cols:
        conn.execute(sa.text("ALTER TABLE users ADD COLUMN totp_secret VARCHAR(64)"))
    if "totp_enabled" not in cols:
        conn.execute(sa.text("ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT 0"))
    conn.commit()


def migration_11(conn, insp):
    """Add totp_backup_codes column to users table."""
    cols = [c["name"] for c in insp.get_columns("users")]
    if "totp_backup_codes" not in cols:
        conn.execute(sa.text("ALTER TABLE users ADD COLUMN totp_backup_codes TEXT"))


def migration_12(conn, insp):
    """Refresh default category keywords to match updated DEFAULT_CATEGORIES."""
    for key, _label, _color, keywords, _sort in DEFAULT_CATEGORIES:
        row = conn.execute(sa.text("SELECT id FROM categories WHERE key=:k"), {"k": key}).fetchone()
        if row:
            conn.execute(sa.text(
                "UPDATE categories SET keywords=:kw WHERE key=:k"
            ), {"kw": keywords, "k": key})
            log.info("  [v12] updated keywords for category '%s'", key)
        else:
            # Insert missing category (e.g. if user never had it)
            conn.execute(sa.text(
                "INSERT INTO categories (key, label, color, keywords, is_default, sort_order) "
                "VALUES (:k, :l, :c, :kw, 1, :s)"
            ), {"k": key, "l": _label, "c": _color, "kw": keywords, "s": _sort})
            log.info("  [v12] inserted missing category '%s'", key)
    conn.commit()


def migration_13(conn, insp):
    """Add category_locked column to tracked_apps."""
    if not _col_exists(insp, "tracked_apps", "category_locked"):
        conn.execute(sa.text(
            "ALTER TABLE tracked_apps ADD COLUMN category_locked BOOLEAN NOT NULL DEFAULT 0"
        ))
        log.info("  [v13] tracked_apps.category_locked")


def migration_14(conn, insp):
    """Add container_id column to tracked_apps."""
    if not _col_exists(insp, "tracked_apps", "container_id"):
        conn.execute(sa.text(
            "ALTER TABLE tracked_apps ADD COLUMN container_id VARCHAR(100)"
        ))
        log.info("  [v14] tracked_apps.container_id")


def migration_15(conn, insp):
    """Add app_url column to tracked_apps."""
    if not _col_exists(insp, "tracked_apps", "app_url"):
        conn.execute(sa.text(
            "ALTER TABLE tracked_apps ADD COLUMN app_url VARCHAR(500)"
        ))
        log.info("  [v15] tracked_apps.app_url")


MIGRATIONS     = {1:  migration_1,  2:  migration_2,  3:  migration_3,
                  4:  migration_4,  5:  migration_5,  6:  migration_6,
                  7:  migration_7,  8:  migration_8,  9:  migration_9,
                  10: migration_10, 11: migration_11, 12: migration_12,
                  13: migration_13, 14: migration_14, 15: migration_15}
LATEST_VERSION = max(MIGRATIONS.keys())


def run_migrations(engine):
    with engine.connect() as conn:
        insp = sa.inspect(engine)
        if not _table_exists(insp, "schema_version"):
            conn.execute(sa.text(
                "CREATE TABLE schema_version (id INTEGER PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0)"))
            conn.execute(sa.text("INSERT INTO schema_version (id,version) VALUES (1,0)"))
            conn.commit()

        row     = conn.execute(sa.text("SELECT version FROM schema_version WHERE id=1")).fetchone()
        current = row[0] if row else 0

        if current >= LATEST_VERSION:
            log.info("Schema up to date (v%d).", current)
            return

        log.info("Running migrations v%d → v%d", current, LATEST_VERSION)
        for v in sorted(MIGRATIONS):
            if v <= current:
                continue
            insp = sa.inspect(engine)
            MIGRATIONS[v](conn, insp)
            conn.execute(sa.text(f"UPDATE schema_version SET version={v} WHERE id=1"))
            conn.commit()
            log.info("Migration v%d done.", v)

        log.info("All migrations done — schema at v%d.", LATEST_VERSION)
