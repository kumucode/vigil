#!/usr/bin/env bash
# Vigil Agent Installer
# Usage: curl -s https://raw.githubusercontent.com/youruser/vigil/main/agent/install.sh | bash
# Or:    bash install.sh

set -euo pipefail

AGENT_USER="vigil-agent"
AGENT_DIR="/opt/vigil-agent"
CONFIG_DIR="/etc/vigil-agent"
SERVICE_NAME="vigil-agent"
AGENT_PORT=7777

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*" >&2; exit 1; }

echo ""
echo "  ██╗   ██╗██╗ ██████╗ ██╗██╗      █████╗  ██████╗ ███████╗███╗   ██╗████████╗"
echo "  ██║   ██║██║██╔════╝ ██║██║     ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝"
echo "  ██║   ██║██║██║  ███╗██║██║     ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   "
echo "  ╚██╗ ██╔╝██║██║   ██║██║██║     ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   "
echo "   ╚████╔╝ ██║╚██████╔╝██║███████╗██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   "
echo "    ╚═══╝  ╚═╝ ╚═════╝ ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   "
echo "  Remote Agent Installer v1.2"
echo ""

# ── Root check ────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    error "Please run as root: sudo bash install.sh"
fi

# ── Detect OS ─────────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    info "Installing Python 3..."
    apt-get update -qq && apt-get install -y -qq python3 python3-pip || \
    yum install -y python3 python3-pip || \
    error "Could not install Python 3. Please install it manually."
fi

if ! command -v docker &>/dev/null; then
    warn "Docker not found on this host. The agent can still install but won't be able to restart services."
fi

# ── Collect config from user ──────────────────────────────────────────────────
echo ""
echo "  Please answer the following questions to configure the agent."
echo "  Press Enter to accept the default value shown in [brackets]."
echo ""

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
    warn "That doesn't look like a valid Vigil token. It should start with 'vigil-' followed by 64 hex characters. Please copy it again from Vigil."
  else
    break
  fi
done

echo ""
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
    warn "Path must start with /  (e.g. /home, /opt, /srv). Try again."
  else
    break
  fi
done

echo ""
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
    AGENT_PORT="$PORT_INPUT"
    break
  fi
done

echo ""

# ── Install files ─────────────────────────────────────────────────────────────
info "Installing agent to ${AGENT_DIR}..."
mkdir -p "$AGENT_DIR" "$CONFIG_DIR"

# Download agent script
if command -v curl &>/dev/null; then
    curl -fsSL "https://raw.githubusercontent.com/youruser/vigil/main/agent/vigil-agent.py" \
         -o "${AGENT_DIR}/vigil-agent.py" 2>/dev/null || \
    cp "$(dirname "$0")/vigil-agent.py" "${AGENT_DIR}/vigil-agent.py" 2>/dev/null || \
    error "Could not download vigil-agent.py"
else
    cp "$(dirname "$0")/vigil-agent.py" "${AGENT_DIR}/vigil-agent.py" 2>/dev/null || \
    error "Could not copy vigil-agent.py — run from the agent directory."
fi

chmod +x "${AGENT_DIR}/vigil-agent.py"

# Install PyYAML if available (agent works without it but YAML validation is better with it)
python3 -m pip install --quiet pyyaml 2>/dev/null || warn "PyYAML not installed — basic YAML parsing will be used."

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
success "Config written (token is secret — file is readable only by root)"

# ── Create systemd service ────────────────────────────────────────────────────
info "Creating systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=Vigil Remote Agent
After=network.target

[Service]
Type=simple
ExecStart=python3 ${AGENT_DIR}/vigil-agent.py
Environment=VIGIL_CONFIG=${CONFIG_DIR}/config.yml
Restart=always
RestartSec=5
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
    warn "Agent may not have started. Check: journalctl -u ${SERVICE_NAME} -n 20"
fi

# ── Firewall (best-effort) ────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    info "Opening port ${AGENT_PORT} in UFW..."
    ufw allow "$AGENT_PORT/tcp" --comment "Vigil Agent" >/dev/null 2>&1 && \
    success "UFW rule added for port ${AGENT_PORT}" || \
    warn "Could not add UFW rule automatically. Run manually: ufw allow ${AGENT_PORT}/tcp"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Vigil Agent installed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Listening on : ${BIND_ADDR}:${AGENT_PORT}"
echo "  Allowed path : ${ALLOWED_BASE}"
echo "  Config       : ${CONFIG_DIR}/config.yml"
echo "  Logs         : journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "  Next: click 'Test connection' in Vigil to verify."
echo ""
