#!/usr/bin/env bash
# Vigil Agent Installer v2.0
# Usage: curl -s https://raw.githubusercontent.com/youruser/vigil/main/agent/install.sh | bash
# Or:    bash install.sh

set -euo pipefail

AGENT_USER="vigil-agent"       # default, can be changed by user
AGENT_DIR="/opt/vigil-agent"
CONFIG_DIR="/etc/vigil-agent"
SERVICE_NAME="vigil-agent"
AGENT_PORT=7777
RUN_AS_ROOT=false
DOCKER_GROUP_CREATED=false

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*" >&2; exit 1; }
title()   { echo -e "${BOLD}$*${NC}"; }

echo ""
echo "  ██╗   ██╗██╗ ██████╗ ██╗██╗      █████╗  ██████╗ ███████╗███╗   ██╗████████╗"
echo "  ██║   ██║██║██╔════╝ ██║██║     ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝"
echo "  ██║   ██║██║██║  ███╗██║██║     ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   "
echo "  ╚██╗ ██╔╝██║██║   ██║██║██║     ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   "
echo "   ╚████╔╝ ██║╚██████╔╝██║███████╗██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   "
echo "    ╚═══╝  ╚═╝ ╚═════╝ ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   "
echo "  Remote Agent Installer v2.0"
echo ""

# ── Root check ────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    error "Please run as root: sudo bash install.sh"
fi

# ══════════════════════════════════════════════════════════════════════════════
# PREFLIGHT CHECKS
# ══════════════════════════════════════════════════════════════════════════════
echo ""
title "  Checking system requirements..."
echo ""

PREFLIGHT_OK=true

# ── Python 3 ──────────────────────────────────────────────────────────────────
if command -v python3 &>/dev/null; then
    PY_VER=$(python3 --version 2>&1)
    success "Python 3 found ($PY_VER)"
else
    warn "Python 3 not found — attempting to install..."
    if command -v apt-get &>/dev/null; then
        apt-get update -qq && apt-get install -y -qq python3 python3-pip && \
            success "Python 3 installed" || { warn "Could not install Python 3. Install it manually and re-run."; PREFLIGHT_OK=false; }
    elif command -v yum &>/dev/null; then
        yum install -y python3 python3-pip && \
            success "Python 3 installed" || { warn "Could not install Python 3. Install it manually and re-run."; PREFLIGHT_OK=false; }
    else
        warn "Could not install Python 3 automatically. Install it manually and re-run."
        PREFLIGHT_OK=false
    fi
fi

# ── Docker ────────────────────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
    DOCKER_VER=$(docker --version 2>&1 | cut -d' ' -f3 | tr -d ',')
    success "Docker found (v${DOCKER_VER})"
else
    warn "Docker not found on this host."
    warn "The agent will install but cannot restart containers until Docker is available."
    warn "Install Docker first: https://docs.docker.com/engine/install/"
    PREFLIGHT_OK=false
fi

# ── Docker group ──────────────────────────────────────────────────────────────
DOCKER_GROUP_OK=false
if getent group docker &>/dev/null; then
    success "Docker group exists"
    DOCKER_GROUP_OK=true
else
    echo ""
    echo -e "  ${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    warn "Docker group not found."
    echo ""
    echo "  This usually means Docker was installed via Snap or a non-standard"
    echo "  method. The dedicated user mode needs the docker group to restart"
    echo "  containers without root access."
    echo ""
    echo "  Options:"
    echo "    A) Let the installer create the docker group now (recommended)"
    echo "    B) Skip — you can create it later or use root mode instead"
    echo ""
    echo -e "  ${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    read -rp "  Create the docker group now? [Y/n]: " CREATE_GROUP
    CREATE_GROUP="${CREATE_GROUP:-Y}"
    if [[ "$CREATE_GROUP" =~ ^[Yy]$ ]]; then
        groupadd docker
        # Fix the socket permissions if Docker is installed
        if [[ -S /var/run/docker.sock ]]; then
            chown root:docker /var/run/docker.sock
            chmod 660 /var/run/docker.sock
            success "Docker group created and socket permissions fixed"
        else
            success "Docker group created (socket not found yet — will be fixed when Docker starts)"
        fi
        DOCKER_GROUP_CREATED=true
        DOCKER_GROUP_OK=true
    else
        warn "Skipping docker group creation. You may need root mode or manual setup."
    fi
fi

# ── Docker socket accessibility ───────────────────────────────────────────────
if [[ -S /var/run/docker.sock ]]; then
    SOCK_PERMS=$(stat -c "%a" /var/run/docker.sock 2>/dev/null || echo "unknown")
    SOCK_GROUP=$(stat -c "%G" /var/run/docker.sock 2>/dev/null || echo "unknown")
    if [[ "$SOCK_GROUP" == "docker" ]]; then
        success "Docker socket is accessible (group: docker, perms: ${SOCK_PERMS})"
    else
        warn "Docker socket group is '${SOCK_GROUP}' — expected 'docker'."
        warn "Fix with: chown root:docker /var/run/docker.sock && chmod 660 /var/run/docker.sock"
    fi
else
    info "Docker socket not found at /var/run/docker.sock — will be checked at runtime."
fi

# ── Port availability ─────────────────────────────────────────────────────────
if command -v ss &>/dev/null; then
    if ss -tlnp 2>/dev/null | grep -q ":${AGENT_PORT} "; then
        warn "Port ${AGENT_PORT} is already in use. You will be asked to choose a different port."
    else
        success "Port ${AGENT_PORT} is available"
    fi
elif command -v netstat &>/dev/null; then
    if netstat -tlnp 2>/dev/null | grep -q ":${AGENT_PORT} "; then
        warn "Port ${AGENT_PORT} is already in use. You will be asked to choose a different port."
    else
        success "Port ${AGENT_PORT} is available"
    fi
fi

echo ""
if [[ "$PREFLIGHT_OK" == "false" ]]; then
    warn "Some preflight checks failed. Review the warnings above before continuing."
    read -rp "  Continue anyway? [y/N]: " CONT
    CONT="${CONT:-N}"
    [[ "$CONT" =~ ^[Yy]$ ]] || error "Installation cancelled."
fi

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════
echo ""
title "  Configuration"
echo "  Press Enter to accept the default value shown in [brackets]."
echo ""

# ── Run mode ──────────────────────────────────────────────────────────────────
echo "  ┌─────────────────────────────────────────────────────────────────┐"
echo "  │ RUN MODE — HOW THE AGENT ACCESSES DOCKER                       │"
echo "  │                                                                 │"
echo "  │  [1] Dedicated user (recommended)                              │"
echo "  │      Creates a system user with no password, no shell, and no  │"
echo "  │      home directory. It joins the docker group so it can        │"
echo "  │      restart containers without needing root access.           │"
echo "  │      You can choose the username or keep the default.          │"
echo "  │                                                                 │"
echo "  │  [2] Root ⚠                                                    │"
echo "  │      The agent runs with full system privileges. If the token  │"
echo "  │      were ever stolen, an attacker would have unrestricted     │"
echo "  │      access to this entire host — not just the compose files.  │"
echo "  │      Only choose this if option 1 fails on your system.        │"
echo "  │                                                                 │"
echo "  │  Both options need docker group access to restart containers.  │"
echo "  │  This is a Docker requirement, not specific to Vigil.          │"
echo "  └─────────────────────────────────────────────────────────────────┘"
while true; do
    read -rp "  Choose run mode [1]: " MODE_INPUT
    MODE_INPUT="${MODE_INPUT:-1}"
    if [[ "$MODE_INPUT" == "1" ]]; then
        RUN_AS_ROOT=false
        if [[ "$DOCKER_GROUP_OK" == "false" ]]; then
            warn "Docker group is not available. Dedicated user mode may not work."
            warn "Consider fixing the docker group first or choose root mode."
            read -rp "  Continue with dedicated user anyway? [y/N]: " CONT_USER
            [[ "${CONT_USER:-N}" =~ ^[Yy]$ ]] || continue
        fi
        success "Using dedicated system user (recommended)"
        break
    elif [[ "$MODE_INPUT" == "2" ]]; then
        echo ""
        echo -e "  ${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "  ${RED}  ⚠  ROOT MODE — PLEASE READ${NC}"
        echo -e "  ${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo "  Running the agent as root means:"
        echo ""
        echo "  • The agent process has unrestricted access to this entire host"
        echo "  • If someone steals the Vigil token, they could send arbitrary"
        echo "    commands to the agent and compromise this machine completely"
        echo "  • There is no containment — a compromised agent = a compromised host"
        echo ""
        echo "  This risk is LOW if your Vigil instance is:"
        echo "    ✓ Only accessible on your local network"
        echo "    ✓ Behind a strong password and 2FA"
        echo "    ✓ Not exposed to the internet"
        echo ""
        echo "  This risk is HIGHER if Vigil is internet-facing."
        echo ""
        echo -e "  ${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        read -rp "  I understand the risks. Use root mode anyway? [y/N]: " ROOT_CONFIRM
        ROOT_CONFIRM="${ROOT_CONFIRM:-N}"
        if [[ "$ROOT_CONFIRM" =~ ^[Yy]$ ]]; then
            RUN_AS_ROOT=true
            warn "Running as root. Keep your Vigil instance secure and your token private."
            break
        else
            echo "  Going back to mode selection..."
            echo ""
        fi
    else
        warn "Please enter 1 or 2."
    fi
done

echo ""

# ── Agent username (mode 1 only) ──────────────────────────────────────────────
if [[ "$RUN_AS_ROOT" == "false" ]]; then
    echo "  ┌─────────────────────────────────────────────────────────────────┐"
    echo "  │ AGENT USERNAME                                                  │"
    echo "  │ The system user that will run the agent process.                │"
    echo "  │ This user will have no password, no shell, and no home          │"
    echo "  │ directory — it exists only to run the Vigil agent.             │"
    echo "  │ Use your own naming convention or press Enter for the default.  │"
    echo "  └─────────────────────────────────────────────────────────────────┘"
    while true; do
        read -rp "  Agent username [vigil-agent]: " USER_INPUT
        USER_INPUT="${USER_INPUT:-vigil-agent}"
        # Linux username: lowercase letters, numbers, hyphens, underscores, must start with letter
        if [[ ! "$USER_INPUT" =~ ^[a-z][a-z0-9_-]{0,30}$ ]]; then
            warn "Invalid username. Use only lowercase letters, numbers, hyphens, and underscores. Must start with a letter."
        elif id "$USER_INPUT" &>/dev/null; then
            echo ""
            warn "User '$USER_INPUT' already exists on this system."
            echo "  Options:"
            echo "    [1] Reuse it (add to docker group if needed)"
            echo "    [2] Choose a different name"
            echo ""
            read -rp "  Choice [1]: " REUSE_CHOICE
            REUSE_CHOICE="${REUSE_CHOICE:-1}"
            if [[ "$REUSE_CHOICE" == "1" ]]; then
                AGENT_USER="$USER_INPUT"
                info "Reusing existing user '$AGENT_USER'"
                break
            fi
            # else loop and ask again
        else
            AGENT_USER="$USER_INPUT"
            break
        fi
    done
    echo ""
fi

# ── Vigil URL ─────────────────────────────────────────────────────────────────
echo "  ┌─────────────────────────────────────────────────────────────────┐"
echo "  │ VIGIL URL                                                       │"
echo "  │ The address where your Vigil is running.                        │"
echo "  │   LAN example:  http://192.168.1.15:3000                       │"
echo "  │   Domain:       https://vigil.yourdomain.com                   │"
echo "  └─────────────────────────────────────────────────────────────────┘"
while true; do
    read -rp "  Vigil URL: " VIGIL_URL
    VIGIL_URL="${VIGIL_URL%/}"
    if [[ -z "$VIGIL_URL" ]]; then
        warn "Vigil URL is required."
    elif [[ ! "$VIGIL_URL" =~ ^https?:// ]]; then
        warn "URL must start with http:// or https://"
    else
        break
    fi
done

echo ""

# ── 1. Install token ──────────────────────────────────────────────────────────
echo "  ┌─────────────────────────────────────────────────────────────────┐"
echo "  │ [1] INSTALL TOKEN                                               │"
echo "  │ In Vigil → Settings → Agents → Add host → Step 2               │"
echo "  │ copy value 1 (install token). It expires in 5 minutes.         │"
echo "  └─────────────────────────────────────────────────────────────────┘"
while true; do
    read -rp "  Install token: " INSTALL_TOKEN
    if [[ -z "$INSTALL_TOKEN" ]]; then
        warn "Required."
    elif [[ ! "$INSTALL_TOKEN" =~ ^install-[a-f0-9]{32}$ ]]; then
        warn "Invalid format. Should start with 'install-' followed by 32 characters."
    else
        break
    fi
done

echo ""

# ── 2. Decryption key ─────────────────────────────────────────────────────────
echo "  ┌─────────────────────────────────────────────────────────────────┐"
echo "  │ [2] DECRYPTION KEY                                              │"
echo "  │ Copy value 2 (decryption key) from the same Vigil screen.      │"
echo "  │ This protects your certificates — it never leaves your machine. │"
echo "  └─────────────────────────────────────────────────────────────────┘"
while true; do
    read -rp "  Decryption key: " DEC_KEY
    if [[ -z "$DEC_KEY" ]]; then
        warn "Required."
    elif [[ ! "$DEC_KEY" =~ ^[a-f0-9]{32}$ ]]; then
        warn "Invalid format. Should be 32 hex characters."
    else
        break
    fi
done

echo ""

# ── 3. Agent token ────────────────────────────────────────────────────────────
echo "  ┌─────────────────────────────────────────────────────────────────┐"
echo "  │ [3] AGENT TOKEN                                                 │"
echo "  │ Copy value 3 (agent token) from the same Vigil screen.         │"
echo "  │ This authorises every future request. Starts with 'vigil-'.    │"
echo "  └─────────────────────────────────────────────────────────────────┘"
while true; do
    read -rp "  Agent token: " TOKEN
    if [[ -z "$TOKEN" ]]; then
        warn "Required."
    elif [[ ! "$TOKEN" =~ ^vigil-[a-f0-9]{64}$ ]]; then
        warn "Invalid format. Should start with 'vigil-' followed by 64 characters."
    else
        break
    fi
done

echo ""

# ── Allowed base path ─────────────────────────────────────────────────────────
echo "  ┌─────────────────────────────────────────────────────────────────┐"
echo "  │ ALLOWED BASE PATH                                               │"
echo "  │ The agent can ONLY read and write files inside this folder.     │"
echo "  │ Set this to the parent directory where your docker-compose      │"
echo "  │ files live. Example: if your apps are at /home/jellyfin/,       │"
echo "  │ /home/nextcloud/ etc — set this to /home                        │"
echo "  └─────────────────────────────────────────────────────────────────┘"
while true; do
    read -rp "  Allowed base path [/home]: " ALLOWED_BASE
    ALLOWED_BASE="${ALLOWED_BASE:-/home}"
    ALLOWED_BASE="${ALLOWED_BASE%/}"
    if [[ ! "$ALLOWED_BASE" =~ ^/ ]]; then
        warn "Path must start with / (e.g. /home, /opt, /srv). Try again."
    elif [[ ! -d "$ALLOWED_BASE" ]]; then
        warn "Directory '$ALLOWED_BASE' does not exist."
        read -rp "  Create it now? [Y/n]: " CREATE_DIR
        CREATE_DIR="${CREATE_DIR:-Y}"
        if [[ "$CREATE_DIR" =~ ^[Yy]$ ]]; then
            mkdir -p "$ALLOWED_BASE"
            success "Created $ALLOWED_BASE"
            break
        fi
    else
        break
    fi
done

echo ""

# ── Bind address ──────────────────────────────────────────────────────────────
echo "  ┌─────────────────────────────────────────────────────────────────┐"
echo "  │ BIND ADDRESS                                                    │"
echo "  │ Just press Enter to accept the default (0.0.0.0).               │"
echo "  │ This makes the agent reachable from other machines on your LAN. │"
echo "  │ Using a specific IP here will cause HTTP 401 errors in Vigil.  │"
echo "  │ Only change this if you know exactly what you are doing.        │"
echo "  └─────────────────────────────────────────────────────────────────┘"
while true; do
    read -rp "  Bind address [0.0.0.0]: " BIND_ADDR
    BIND_ADDR="${BIND_ADDR:-0.0.0.0}"
    if [[ ! "$BIND_ADDR" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        warn "Please enter a valid IP address like 0.0.0.0 or 192.168.1.102, or just press Enter for the default."
        BIND_ADDR=""
    else
        break
    fi
done

echo ""

# ── Port ──────────────────────────────────────────────────────────────────────
echo "  ┌─────────────────────────────────────────────────────────────────┐"
echo "  │ PORT                                                            │"
echo "  │ The port the agent listens on. Vigil will connect to this port. │"
echo "  │ Default 7777 is fine unless something else is already using it. │"
echo "  └─────────────────────────────────────────────────────────────────┘"
while true; do
    read -rp "  Port [${AGENT_PORT}]: " PORT_INPUT
    PORT_INPUT="${PORT_INPUT:-$AGENT_PORT}"
    if [[ ! "$PORT_INPUT" =~ ^[0-9]+$ ]] || [[ "$PORT_INPUT" -lt 1024 ]] || [[ "$PORT_INPUT" -gt 65535 ]]; then
        warn "Port must be a number between 1024 and 65535. Press Enter to use 7777."
        PORT_INPUT=""
    else
        # Check if chosen port is in use
        if command -v ss &>/dev/null && ss -tlnp 2>/dev/null | grep -q ":${PORT_INPUT} "; then
            warn "Port ${PORT_INPUT} is already in use. Please choose a different port."
        else
            AGENT_PORT="$PORT_INPUT"
            break
        fi
    fi
done

echo ""

# ══════════════════════════════════════════════════════════════════════════════
# INSTALLATION
# ══════════════════════════════════════════════════════════════════════════════
title "  Installing..."
echo ""

# ── Create dedicated user (mode 1 only) ───────────────────────────────────────
if [[ "$RUN_AS_ROOT" == "false" ]]; then
    if ! id "$AGENT_USER" &>/dev/null; then
        info "Creating system user '${AGENT_USER}'..."
        useradd \
            --system \
            --no-create-home \
            --shell /usr/sbin/nologin \
            --comment "Vigil Agent — no login, docker group only" \
            "$AGENT_USER"
        success "User '${AGENT_USER}' created (no password, no shell, no home directory)"
    else
        info "User '${AGENT_USER}' already exists — skipping creation"
    fi

    if getent group docker &>/dev/null; then
        usermod -aG docker "$AGENT_USER"
        success "Added '${AGENT_USER}' to docker group"
    else
        warn "Docker group still not found. Run manually when Docker is installed:"
        warn "  groupadd docker && usermod -aG docker ${AGENT_USER}"
    fi
fi

# ── Install agent script ──────────────────────────────────────────────────────
info "Installing agent to ${AGENT_DIR}..."
mkdir -p "$AGENT_DIR" "$CONFIG_DIR"

info "Downloading vigil-agent.py from Vigil..."
if curl -fsSL "${VIGIL_URL}/agent/vigil-agent.py" \
        -o "${AGENT_DIR}/vigil-agent.py" 2>/dev/null; then
    success "Agent script downloaded from ${VIGIL_URL}"
else
    error "Could not download vigil-agent.py from ${VIGIL_URL}/agent/vigil-agent.py — is Vigil reachable?"
fi

chmod +x "${AGENT_DIR}/vigil-agent.py"
success "Agent script installed"

# Install PyYAML (required for YAML validation before writes)
python3 -m pip install --quiet pyyaml cryptography 2>/dev/null && \
    success "PyYAML and cryptography installed" || \
    warn "Could not install Python packages — run: pip install pyyaml cryptography"

# ── Download and decrypt TLS certificates ────────────────────────────────────
info "Contacting Vigil to download certificates..."

PROVISION_RESPONSE=$(curl -s -X POST "${VIGIL_URL}/api/agent-provision" \
    -H "Content-Type: application/json" \
    -d "{\"install_token\": \"${INSTALL_TOKEN}\", \"dec_key\": \"${DEC_KEY}\"}" \
    2>/dev/null)

if [[ -z "$PROVISION_RESPONSE" ]]; then
    error "Could not reach Vigil at ${VIGIL_URL}. Check the URL and try again."
fi

# Check for error in response
PROVISION_ERROR=$(echo "$PROVISION_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('error',''))
" 2>/dev/null)

if [[ -n "$PROVISION_ERROR" ]]; then
    error "Vigil rejected the request: ${PROVISION_ERROR}"
fi

success "Encrypted certificate package received"

# Decrypt the package and write cert files using Python
info "Decrypting certificate package..."
python3 << PYEOF
import sys, json, base64, os
from pathlib import Path

response = json.loads('''${PROVISION_RESPONSE}''')
blob    = response['encrypted_package']
dec_key = '${DEC_KEY}'
config_dir = '${CONFIG_DIR}'

# PBKDF2 + AES-256-GCM decryption (mirrors ca.py decrypt_cert_package)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

raw   = base64.b64decode(blob)
salt  = raw[:16];  nonce = raw[16:28];  ct = raw[28:]
kdf   = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
key   = kdf.derive(dec_key.encode())
payload = json.loads(AESGCM(key).decrypt(nonce, ct, None))

# Write cert files with strict permissions
Path(config_dir).mkdir(parents=True, exist_ok=True)

ca_path    = Path(config_dir) / 'vigil-ca.crt'
cert_path  = Path(config_dir) / 'agent.crt'
key_path   = Path(config_dir) / 'agent.key'

ca_path.write_text(payload['ca_cert'])
ca_path.chmod(0o644)

cert_path.write_text(payload['agent_cert'])
cert_path.chmod(0o644)

key_path.write_text(payload['agent_key'])
key_path.chmod(0o600)

print(response.get('fingerprint',''))
PYEOF

AGENT_FINGERPRINT=$(python3 -c "
import json
r = json.loads('''${PROVISION_RESPONSE}''')
print(r.get('fingerprint',''))
" 2>/dev/null)

success "Certificates written to ${CONFIG_DIR}"
success "  vigil-ca.crt — Vigil CA certificate (644)"
success "  agent.crt    — Agent certificate (644)"
success "  agent.key    — Agent private key (600 — owner read only)"

# ── Write config ──────────────────────────────────────────────────────────────
info "Writing config to ${CONFIG_DIR}/config.yml..."
cat > "${CONFIG_DIR}/config.yml" << EOF
# Vigil Agent Configuration
# Generated by install.sh — do not share this file

token:        ${TOKEN}
allowed_base: ${ALLOWED_BASE}
bind_address: ${BIND_ADDR}
port:         ${AGENT_PORT}
EOF

chmod 600 "${CONFIG_DIR}/config.yml"

if [[ "$RUN_AS_ROOT" == "false" ]]; then
    chown -R "${AGENT_USER}:${AGENT_USER}" "${AGENT_DIR}" "${CONFIG_DIR}"
    # cert files: key stays 600 owner-only, certs readable
    chmod 644 "${CONFIG_DIR}/vigil-ca.crt" "${CONFIG_DIR}/agent.crt" 2>/dev/null || true
    chmod 600 "${CONFIG_DIR}/agent.key" 2>/dev/null || true
fi

success "Config written (permissions: 600 — token is protected)"

# ── Set up backup directory permissions ───────────────────────────────────────
# vigil-agent needs to create .vigil-backups/ inside each app directory.
# Pre-create it for each top-level subdirectory of ALLOWED_BASE so the user
# doesn't hit a PermissionError on first update.
if [[ "$RUN_AS_ROOT" == "false" ]]; then
    info "Setting up file permissions under ${ALLOWED_BASE}..."
    SETUP_COUNT=0
    for APP_DIR in "${ALLOWED_BASE}"/*/; do
        [[ -d "$APP_DIR" ]] || continue

        # Create and own the backup directory
        BACKUP_PATH="${APP_DIR}.vigil-backups"
        mkdir -p "$BACKUP_PATH" 2>/dev/null || true
        chown "${AGENT_USER}:${AGENT_USER}" "$BACKUP_PATH" 2>/dev/null || true

        # Give vigil-agent ownership of the compose file so it can read and write it
        for CF in "${APP_DIR}docker-compose.yml" "${APP_DIR}docker-compose.yaml"; do
            if [[ -f "$CF" ]]; then
                chown "${AGENT_USER}:${AGENT_USER}" "$CF" 2>/dev/null && \
                    SETUP_COUNT=$((SETUP_COUNT + 1)) || \
                    warn "Could not chown ${CF} — you may need to run: sudo chown ${AGENT_USER}:${AGENT_USER} ${CF}"
            fi
        done
    done

    if [[ $SETUP_COUNT -gt 0 ]]; then
        success "Permissions set for ${SETUP_COUNT} compose file(s) under ${ALLOWED_BASE}"
    else
        warn "No compose files found yet under ${ALLOWED_BASE}."
        warn "After adding new app directories, run:"
        warn "  sudo chown ${AGENT_USER}:${AGENT_USER} /path/to/app/docker-compose.yml"
        warn "  sudo mkdir -p /path/to/app/.vigil-backups && sudo chown ${AGENT_USER}:${AGENT_USER} /path/to/app/.vigil-backups"
    fi
fi

# ── Create systemd service ────────────────────────────────────────────────────
info "Creating systemd service..."

if [[ "$RUN_AS_ROOT" == "false" ]]; then
    USER_SECTION="User=${AGENT_USER}
Group=${AGENT_USER}
SupplementaryGroups=docker"
else
    USER_SECTION="User=root"
fi

cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=Vigil Remote Agent
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
${USER_SECTION}
ExecStart=python3 ${AGENT_DIR}/vigil-agent.py
Environment=VIGIL_CONFIG=${CONFIG_DIR}/config.yml
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${ALLOWED_BASE} ${AGENT_DIR} ${CONFIG_DIR}
PrivateTmp=true
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" --quiet
systemctl restart "$SERVICE_NAME"

sleep 2

if systemctl is-active --quiet "$SERVICE_NAME"; then
    success "Agent is running (systemd service: ${SERVICE_NAME})"
else
    echo ""
    warn "Agent may not have started. Checking logs..."
    journalctl -u "$SERVICE_NAME" -n 10 --no-pager 2>/dev/null || true
    warn "Fix any errors above, then run: systemctl restart ${SERVICE_NAME}"
fi

# ── Firewall (best-effort) ────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    info "Opening port ${AGENT_PORT} in UFW..."
    ufw allow "$AGENT_PORT/tcp" --comment "Vigil Agent" >/dev/null 2>&1 && \
    success "UFW rule added for port ${AGENT_PORT}" || \
    warn "Could not add UFW rule automatically. Run manually: ufw allow ${AGENT_PORT}/tcp"
fi

# ══════════════════════════════════════════════════════════════════════════════
# DONE
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Vigil Agent installed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
if [[ "$RUN_AS_ROOT" == "false" ]]; then
    echo "  Running as   : ${AGENT_USER} (docker group — not root)"
else
    echo "  Running as   : root"
fi
echo "  Listening on : ${BIND_ADDR}:${AGENT_PORT}"
echo "  Allowed path : ${ALLOWED_BASE}"
echo "  TLS          : enabled — mutual TLS active"
echo "  Config       : ${CONFIG_DIR}/config.yml"
echo "  Logs         : journalctl -u ${SERVICE_NAME} -f"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Your agent fingerprint — paste this in Vigil step 3:${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${YELLOW}SHA256:${AGENT_FINGERPRINT}${NC}"
echo ""
echo "  In Vigil → Settings → Agents → Add host → step 3:"
echo "  Paste the fingerprint above when prompted and click Compare."
echo "  If it matches what Vigil shows, click 'Save host'."
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Firewall tip: to restrict access to Vigil only, run:"
echo "    ufw allow from <your-vigil-ip> to any port ${AGENT_PORT}"
echo "    ufw deny ${AGENT_PORT}"
echo ""
echo "  When you add a new app to this host later, run once:"
echo "    sudo vigil-setup /path/to/app"
echo ""

# ── Install vigil-setup helper ────────────────────────────────────────────────
cat > /usr/local/bin/vigil-setup << HELPER
#!/bin/bash
# vigil-setup <app-directory>
# Grants vigil-agent read/write access to a docker-compose file and creates
# the backup directory. Run this after adding a new app to this host.
set -e
APP_DIR="\${1%/}"
if [[ -z "\$APP_DIR" ]] || [[ ! -d "\$APP_DIR" ]]; then
    echo "Usage: sudo vigil-setup /path/to/app"
    echo "  e.g. sudo vigil-setup /home/jellyfin"
    exit 1
fi
AGENT_USER="${AGENT_USER}"
echo "Setting up \$APP_DIR for vigil-agent..."
mkdir -p "\${APP_DIR}/.vigil-backups"
chown "\${AGENT_USER}:\${AGENT_USER}" "\${APP_DIR}/.vigil-backups"
for CF in "\${APP_DIR}/docker-compose.yml" "\${APP_DIR}/docker-compose.yaml"; do
    if [[ -f "\$CF" ]]; then
        chown "\${AGENT_USER}:\${AGENT_USER}" "\$CF"
        echo "  [OK] \$CF"
    fi
done
echo "Done. vigil-agent can now read/write compose files in \$APP_DIR"
HELPER
chmod +x /usr/local/bin/vigil-setup
success "Installed vigil-setup helper to /usr/local/bin/vigil-setup"
