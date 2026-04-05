"""
models.py — SQLAlchemy database models for Docker Tracker.
"""

from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


# ── Schema version ─────────────────────────────────────────────────────────────

class SchemaVersion(db.Model):
    __tablename__ = "schema_version"
    id      = db.Column(db.Integer, primary_key=True)
    version = db.Column(db.Integer, nullable=False, default=0)


# ── User (single admin account) ───────────────────────────────────────────────

class User(db.Model):
    __tablename__ = "users"

    id              = db.Column(db.Integer,     primary_key=True)
    username        = db.Column(db.String(80),  nullable=False, unique=True)
    password_hash   = db.Column(db.String(200), nullable=False)
    must_change_pw  = db.Column(db.Boolean,     nullable=False, default=True)
    created_at      = db.Column(db.DateTime,    default=lambda: datetime.now(timezone.utc))
    totp_secret     = db.Column(db.String(64),  nullable=True)   # base32; NULL = not configured
    totp_enabled    = db.Column(db.Boolean,     nullable=False, default=False)
    totp_backup_codes = db.Column(db.Text, nullable=True)  # JSON list of hashed codes

    def check_password(self, password: str) -> bool:
        import bcrypt
        return bcrypt.checkpw(password.encode(), self.password_hash.encode())

    @staticmethod
    def hash_password(password: str) -> str:
        import bcrypt
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    def to_dict(self):
        return {
            "id":            self.id,
            "username":      self.username,
            "must_change_pw":self.must_change_pw,
            "totp_enabled":  self.totp_enabled,
            "has_backup_codes": bool(self.totp_backup_codes),
        }


# ── Category (user-editable, default set seeded on first run) ─────────────────

class Category(db.Model):
    __tablename__ = "categories"

    id        = db.Column(db.Integer,     primary_key=True)
    key       = db.Column(db.String(50),  nullable=False, unique=True)  # slug used in app.category
    label     = db.Column(db.String(80),  nullable=False)
    color     = db.Column(db.String(20),  nullable=False, default="#6b6b8a")
    keywords  = db.Column(db.Text,        nullable=False, default="")   # comma-separated
    is_default= db.Column(db.Boolean,     nullable=False, default=False) # seeded defaults
    sort_order= db.Column(db.Integer,     nullable=False, default=100)

    def to_dict(self):
        return {
            "id":         self.id,
            "key":        self.key,
            "label":      self.label,
            "color":      self.color,
            "keywords":   [k.strip() for k in self.keywords.split(",") if k.strip()],
            "is_default": self.is_default,
            "sort_order": self.sort_order,
        }


# ── Tracked app ────────────────────────────────────────────────────────────────

class TrackedApp(db.Model):
    __tablename__ = "tracked_apps"

    id                    = db.Column(db.Integer,    primary_key=True)
    image                 = db.Column(db.String(300),nullable=False, unique=True)
    name                  = db.Column(db.String(100),nullable=False)
    version               = db.Column(db.String(100),nullable=False, default="latest")
    latest_version        = db.Column(db.String(100),nullable=True)
    category              = db.Column(db.String(50), nullable=False, default="uncategorized")
    category_locked       = db.Column(db.Boolean, nullable=False, default=False)  # True = user manually set, skip auto
    custom_icon           = db.Column(db.String(500),nullable=True)
    icon_data             = db.Column(db.Text,       nullable=True)    # base64 data-URI
    detection_channel     = db.Column(db.String(30), nullable=True)
    version_source_url    = db.Column(db.String(500),nullable=True)
    status                = db.Column(db.String(20), nullable=False, default="unknown")
    last_error            = db.Column(db.Text,       nullable=True)
    last_checked_at       = db.Column(db.String(40), nullable=True)
    last_successful_check = db.Column(db.String(40), nullable=True)
    created_at            = db.Column(db.DateTime,   default=lambda: datetime.now(timezone.utc))
    notify_policy         = db.Column(db.String(20), nullable=False, default="always")
    ignored_version       = db.Column(db.String(100),nullable=True)
    snoozed_until         = db.Column(db.String(40), nullable=True)
    version_history       = db.Column(db.Text,       nullable=True, default="[]")
    notes                 = db.Column(db.Text,       nullable=True)
    install_path          = db.Column(db.String(500), nullable=True)
    container_id          = db.Column(db.String(100), nullable=True)  # e.g. "LXC 101" or "VM 105"
    app_url               = db.Column(db.String(500), nullable=True)  # e.g. "https://jellyfin.local"
    host_id               = db.Column(db.Integer,     db.ForeignKey("hosts.id", ondelete="SET NULL"), nullable=True)
    service_name          = db.Column(db.String(100), nullable=True)   # service name inside compose file
    auto_update           = db.Column(db.String(20),  nullable=False, default="off")  # off/ask/auto/silent

    def to_dict(self):
        return {
            "id":                    self.id,
            "image":                 self.image,
            "name":                  self.name,
            "version":               self.version,
            "latest_version":        self.latest_version
                                     or (self.version if self.version and self.version not in
                                     {"latest","stable","nightly","edge","beta","develop","main","master","release","snapshot","test","debug"}
                                     else None),
            "category":              self.category,
            "category_locked":       bool(self.category_locked),
            "custom_icon":           self.custom_icon,
            "icon_data":             self.icon_data,
            "detection_channel":     self.detection_channel,
            "version_source_url":    self.version_source_url,
            "status":                self.status,
            "last_error":            self.last_error,
            "last_checked_at":       self.last_checked_at,
            "last_successful_check": self.last_successful_check,
            "created_at":            self.created_at.isoformat() if self.created_at else None,
            "notify_policy":         self.notify_policy,
            "ignored_version":       self.ignored_version,
            "snoozed_until":         self.snoozed_until,
            "version_history":       self.version_history or "[]",
            "notes":                 self.notes or "",
            "install_path":          self.install_path or "",
            "container_id":          self.container_id or "",
            "app_url":               self.app_url or "",
            "host_id":               self.host_id,
            "service_name":          self.service_name or "",
            "auto_update":           self.auto_update or "off",
        }


# ── Remote host (agent) ────────────────────────────────────────────────────────

class Host(db.Model):
    __tablename__ = "hosts"

    id           = db.Column(db.Integer,     primary_key=True)
    name         = db.Column(db.String(100), nullable=False)
    ip           = db.Column(db.String(100), nullable=False)
    port         = db.Column(db.Integer,     nullable=False, default=7777)
    token_hash   = db.Column(db.String(200), nullable=False)   # bcrypt hash, never plaintext
    allowed_base = db.Column(db.String(500), nullable=False, default="/home")
    last_seen    = db.Column(db.String(40),  nullable=True)
    status       = db.Column(db.String(20),  nullable=False, default="unknown")  # connected/unreachable/unknown
    created_at   = db.Column(db.DateTime,    default=lambda: datetime.now(timezone.utc))

    def check_token(self, token: str) -> bool:
        import bcrypt
        try:
            return bcrypt.checkpw(token.encode(), self.token_hash.encode())
        except Exception:
            return False

    def to_dict(self, include_token_hint=False):
        return {
            "id":           self.id,
            "name":         self.name,
            "ip":           self.ip,
            "port":         self.port,
            "allowed_base": self.allowed_base,
            "last_seen":    self.last_seen,
            "status":       self.status,
            "created_at":   self.created_at.isoformat() if self.created_at else None,
        }


# ── Update log ─────────────────────────────────────────────────────────────────

class UpdateLog(db.Model):
    __tablename__ = "update_log"

    id             = db.Column(db.Integer,     primary_key=True)
    app_id         = db.Column(db.Integer,     db.ForeignKey("tracked_apps.id", ondelete="CASCADE"), nullable=False)
    timestamp      = db.Column(db.String(40),  nullable=False)
    action         = db.Column(db.String(20),  nullable=False, default="update")  # update/revert
    from_version   = db.Column(db.String(100), nullable=True)
    to_version     = db.Column(db.String(100), nullable=True)
    status         = db.Column(db.String(20),  nullable=False, default="success")  # success/failed/reverted
    backup_path    = db.Column(db.String(500), nullable=True)
    triggered_by   = db.Column(db.String(50),  nullable=False, default="user")  # user/schedule/telegram
    error_message  = db.Column(db.Text,        nullable=True)

    def to_dict(self):
        return {
            "id":           self.id,
            "app_id":       self.app_id,
            "timestamp":    self.timestamp,
            "action":       self.action,
            "from_version": self.from_version,
            "to_version":   self.to_version,
            "status":       self.status,
            "backup_path":  self.backup_path,
            "triggered_by": self.triggered_by,
            "error_message":self.error_message,
        }


# ── Settings KV ────────────────────────────────────────────────────────────────

class Settings(db.Model):
    __tablename__ = "settings"
    key   = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.Text,        nullable=True)

    @classmethod
    def get(cls, key, default=None):
        row = db.session.get(cls, key)
        return row.value if row else default

    @classmethod
    def set(cls, key, value):
        row = db.session.get(cls, key)
        if row:
            row.value = value
        else:
            db.session.add(cls(key=key, value=value))
        db.session.commit()
