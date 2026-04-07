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

# ── Token ─────────────────────────────────────────────────────────────────────
echo "  ┌─────────────────────────────────────────────────────────────────┐"
echo "  │ TOKEN                                                           │"
echo "  │ Go to Vigil → Settings → Agents → Add host.                    │"
echo "  │ Vigil will generate a token for you. Paste it here.            │"
echo "  │ It should look like: vigil-a3f9bc12d4e7...  (70 chars)         │"
echo "  └─────────────────────────────────────────────────────────────────┘"
while true; do
    read -rp "  Token (from Vigil UI): " TOKEN
    if [[ -z "$TOKEN" ]]; then
        warn "Token is required."
    elif [[ ! "$TOKEN" =~ ^vigil-[a-f0-9]{64}$ ]]; then
        warn "That doesn't look like a valid Vigil token."
        warn "It should start with 'vigil-' followed by 64 hex characters."
        warn "Please copy it again from Vigil → Settings → Agents → Add host."
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

if command -v curl &>/dev/null; then
    curl -fsSL "https://raw.githubusercontent.com/youruser/vigil/main/agent/vigil-agent.py" \
         -o "${AGENT_DIR}/vigil-agent.py" 2>/dev/null || \
    cp "$(dirname "$0")/vigil-agent.py" "${AGENT_DIR}/vigil-agent.py" 2>/dev/null || \
    error "Could not download vigil-agent.py. Run from the agent directory or check your internet connection."
else
    cp "$(dirname "$0")/vigil-agent.py" "${AGENT_DIR}/vigil-agent.py" 2>/dev/null || \
    error "Could not copy vigil-agent.py — run from the agent directory."
fi

chmod +x "${AGENT_DIR}/vigil-agent.py"
success "Agent script installed"

# Install PyYAML (best-effort)
python3 -m pip install --quiet pyyaml 2>/dev/null && \
    success "PyYAML installed (better YAML validation)" || \
    info "PyYAML not installed — basic YAML parsing will be used."

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
fi

success "Config written (permissions: 600 — token is protected)"

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
echo "  Config       : ${CONFIG_DIR}/config.yml"
echo "  Logs         : journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "  Next: click 'Test connection' in Vigil to verify."
echo ""
