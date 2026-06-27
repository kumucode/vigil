#!/usr/bin/env bash
# Vigil Agent Uninstaller
# Usage: sudo bash uninstall.sh
# Removes all agent files, the systemd service, and frees the port.

set -euo pipefail

SERVICE_NAME="vigil-agent"
AGENT_DIR="/opt/vigil-agent"
CONFIG_DIR="/etc/vigil-agent"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }

echo ""
echo "  Vigil Agent Uninstaller"
echo ""

if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}[ERR]${NC}  Please run as root: sudo bash uninstall.sh"
    exit 1
fi

echo "  This will remove:"
echo "    • systemd service   (vigil-agent)"
echo "    • agent files       ($AGENT_DIR)"
echo "    • config + certs    ($CONFIG_DIR)"
echo "    • system user       (vigil-agent, if it exists)"
echo ""
read -rp "  Continue? [y/N]: " CONFIRM
[[ "${CONFIRM:-N}" =~ ^[Yy]$ ]] || { echo "  Cancelled."; exit 0; }
echo ""

# ── Stop and disable service ───────────────────────────────────────────────────
if systemctl list-units --full -all 2>/dev/null | grep -q "${SERVICE_NAME}.service"; then
    info "Stopping and disabling service..."
    systemctl stop  "$SERVICE_NAME" 2>/dev/null || true
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    systemctl daemon-reload
    success "Service removed"
else
    info "Service not found — skipping"
fi

# ── Remove files ───────────────────────────────────────────────────────────────
if [[ -d "$AGENT_DIR" ]]; then
    rm -rf "$AGENT_DIR"
    success "Removed $AGENT_DIR"
fi

if [[ -d "$CONFIG_DIR" ]]; then
    rm -rf "$CONFIG_DIR"
    success "Removed $CONFIG_DIR (including certificates and token)"
fi

# ── Remove helper ──────────────────────────────────────────────────────────────
if [[ -f /usr/local/bin/vigil-setup ]]; then
    rm -f /usr/local/bin/vigil-setup
    success "Removed vigil-setup helper"
fi

# ── Remove system user ─────────────────────────────────────────────────────────
if id "vigil-agent" &>/dev/null; then
    userdel vigil-agent 2>/dev/null || true
    success "Removed system user 'vigil-agent'"
fi

# ── Remove UFW rule (best-effort) ──────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    # Try to remove rules for common ports — user may have changed the default
    for port in 7777 7778 7779; do
        ufw delete allow "$port/tcp" 2>/dev/null && \
            success "Removed UFW rule for port $port" || true
    done
fi

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Vigil Agent uninstalled successfully.${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Next steps in Vigil (optional):"
echo "    Settings → Agents → find this host → Remove"
echo "    This clears the stored token from Vigil's database."
echo ""
echo "  To reinstall on port 7777:"
echo "    bash install.sh"
echo ""
