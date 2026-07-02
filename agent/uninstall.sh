#!/usr/bin/env bash
# Vigil Agent Uninstaller
# Usage: sudo bash uninstall.sh
#
# Removes the systemd service, agent files, config directory, helper binary,
# and system user. Guarantees all listening processes are terminated and
# ports 7777/7778/7779 are free before exiting so that reinstall works
# immediately without "port already in use" errors.

# -u  : treat undefined variables as errors
# -o pipefail : a pipeline fails if any command in it fails
# Intentionally NO -e: uninstall must continue even when individual
# cleanup steps fail (already-removed files, already-stopped services, etc.)
set -uo pipefail

SERVICE_NAME="vigil-agent"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
AGENT_DIR="/opt/vigil-agent"
CONFIG_DIR="/etc/vigil-agent"
AGENT_PORTS=(7777 7778 7779)
STOP_TIMEOUT=10    # seconds to wait for graceful systemd shutdown

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()     { echo -e "${RED}[ERR]${NC}  $*"; }

echo ""
echo -e "${BOLD}  Vigil Agent Uninstaller${NC}"
echo ""

if [[ $EUID -ne 0 ]]; then
    err "Please run as root: sudo bash uninstall.sh"
    exit 1
fi

echo "  This will remove:"
echo "    • systemd service   (${SERVICE_NAME})"
echo "    • agent files       (${AGENT_DIR})"
echo "    • config + certs    (${CONFIG_DIR})"
echo "    • system user       (vigil-agent, if it exists)"
echo ""
read -rp "  Continue? [y/N]: " CONFIRM
[[ "${CONFIRM:-N}" =~ ^[Yy]$ ]] || { echo "  Cancelled."; exit 0; }
echo ""

# ── STEP 1: Stop, disable, and remove the systemd service ────────────────────
#
# FIX: Use a direct unit-file check instead of `list-units | grep`.
#      list-units only shows units that are currently loaded — if the service
#      failed hard at boot, systemd may not report it at all.
#      Checking for the .service file is always reliable.
#
if [[ -f "$SERVICE_FILE" ]]; then
    info "Found service unit: ${SERVICE_FILE}"
    info "Stopping service (timeout: ${STOP_TIMEOUT}s)..."

    # Request a graceful stop; ignore errors — service may already be stopped
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true

    # FIX: Wait for the unit to actually become inactive rather than assuming
    #      that systemctl stop returning means the process is gone.
    WAITED=0
    while systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; do
        if [[ $WAITED -ge $STOP_TIMEOUT ]]; then
            warn "Service did not stop within ${STOP_TIMEOUT}s — proceeding with force termination below"
            break
        fi
        sleep 1
        WAITED=$((WAITED + 1))
    done

    # Prevent the service from restarting on next boot
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true

    # Remove the unit file — systemd will forget about the service after daemon-reload
    rm -f "$SERVICE_FILE"

    # FIX: Tell systemd to rescan unit files so the removed unit is no longer known
    systemctl daemon-reload 2>/dev/null || true

    # FIX: Clear any failed/error state stored for this unit name.
    #      Without this, `systemctl reset-failed` is needed before a reinstall
    #      can register a new unit with the same name cleanly on some distros.
    systemctl reset-failed "$SERVICE_NAME" 2>/dev/null || true

    success "Service stopped, disabled, unit file removed, and systemd state cleared"
else
    info "Service unit not found at ${SERVICE_FILE} — skipping service removal"
    # Still clear any stale systemd state from a partial previous uninstall
    systemctl daemon-reload 2>/dev/null || true
    systemctl reset-failed "$SERVICE_NAME" 2>/dev/null || true
fi

# ── STEP 2: Kill any lingering vigil-agent processes ─────────────────────────
#
# FIX: systemctl stop does not guarantee all child processes are gone,
#      especially if the Python process spawned threads or subprocesses that
#      outlive the main PID tracked by systemd.
#      Scan by name and terminate explicitly.
#
PIDS=$(pgrep -f "vigil-agent" 2>/dev/null || true)
if [[ -n "$PIDS" ]]; then
    warn "Lingering vigil-agent process(es) found (PIDs: ${PIDS//$'\n'/, }) — sending SIGTERM..."
    echo "$PIDS" | xargs -r kill -TERM 2>/dev/null || true
    sleep 3

    # Re-check; escalate to SIGKILL if any process survived SIGTERM
    REMAINING=$(pgrep -f "vigil-agent" 2>/dev/null || true)
    if [[ -n "$REMAINING" ]]; then
        warn "Process(es) still alive after SIGTERM (PIDs: ${REMAINING//$'\n'/, }) — sending SIGKILL..."
        echo "$REMAINING" | xargs -r kill -KILL 2>/dev/null || true
        sleep 1
    fi

    # Final check — just report, don't abort; port verification below will catch it
    STILL_ALIVE=$(pgrep -f "vigil-agent" 2>/dev/null || true)
    if [[ -n "$STILL_ALIVE" ]]; then
        err "Could not terminate PIDs: ${STILL_ALIVE//$'\n'/, } — manual intervention may be required"
    else
        success "All vigil-agent processes terminated"
    fi
else
    success "No lingering vigil-agent processes found"
fi

# ── STEP 3: Verify ports are free — kill anything still listening ─────────────
#
# FIX: This is the root cause of the reinstall failure.
#      UFW rule deletion only modifies the firewall — it has zero effect on
#      whether a process is listening on a port locally.
#      We must actively verify each port is free and kill any holder if not.
#
# Helper: returns the PID listening on a TCP port, or empty string
_pid_on_port() {
    local port="$1"
    local pid=""
    if command -v ss &>/dev/null; then
        # ss output: ...  users:(("prog",pid=NNN,fd=M))
        pid=$(ss -tlpn 2>/dev/null \
              | awk -v p=":${port}" '$4 ~ p || $5 ~ p' \
              | grep -o 'pid=[0-9]*' \
              | cut -d= -f2 \
              | head -1 || true)
    elif command -v lsof &>/dev/null; then
        pid=$(lsof -iTCP:"${port}" -sTCP:LISTEN -n -P 2>/dev/null \
              | awk 'NR==2{print $2}' || true)
    fi
    echo "${pid:-}"
}

# Helper: returns non-empty string if port is still bound
_port_bound() {
    local port="$1"
    if command -v ss &>/dev/null; then
        ss -tlpn 2>/dev/null | awk -v p=":${port}" '$4 ~ p || $5 ~ p' | grep -q '.' 2>/dev/null && echo "bound" || true
    elif command -v lsof &>/dev/null; then
        lsof -iTCP:"${port}" -sTCP:LISTEN -n -P 2>/dev/null | grep -q '.' && echo "bound" || true
    fi
}

info "Verifying agent ports are free..."
PORT_FAIL=0

for PORT in "${AGENT_PORTS[@]}"; do
    if [[ -n "$(_port_bound "$PORT")" ]]; then
        warn "Port ${PORT} is still bound"
        PORT_PID=$(_pid_on_port "$PORT")

        if [[ -n "$PORT_PID" ]]; then
            PROC_NAME=$(ps -p "$PORT_PID" -o comm= 2>/dev/null || echo "unknown")
            warn "  PID ${PORT_PID} (${PROC_NAME}) is holding port ${PORT} — sending SIGTERM..."
            kill -TERM "$PORT_PID" 2>/dev/null || true
            sleep 2

            if [[ -n "$(_port_bound "$PORT")" ]]; then
                warn "  Port ${PORT} still bound after SIGTERM — sending SIGKILL to PID ${PORT_PID}..."
                kill -KILL "$PORT_PID" 2>/dev/null || true
                sleep 1
            fi
        else
            warn "  Could not identify PID for port ${PORT} (no ss/lsof or process already exiting)"
        fi

        # Final verdict for this port
        if [[ -n "$(_port_bound "$PORT")" ]]; then
            err "Port ${PORT} is STILL in use — reinstall may fail. Run: ss -tlpn | grep :${PORT}"
            PORT_FAIL=$((PORT_FAIL + 1))
        else
            success "Port ${PORT} is now free"
        fi
    else
        success "Port ${PORT} is free"
    fi
done

if [[ $PORT_FAIL -gt 0 ]]; then
    warn "${PORT_FAIL} port(s) could not be freed — you may need to reboot or investigate manually"
fi

# ── STEP 4: Remove application and config directories ────────────────────────
if [[ -d "$AGENT_DIR" ]]; then
    rm -rf "$AGENT_DIR"
    success "Removed ${AGENT_DIR}"
else
    info "${AGENT_DIR} not found — skipping"
fi

if [[ -d "$CONFIG_DIR" ]]; then
    rm -rf "$CONFIG_DIR"
    success "Removed ${CONFIG_DIR} (including certificates and token)"
else
    info "${CONFIG_DIR} not found — skipping"
fi

# ── STEP 5: Remove helper binary ─────────────────────────────────────────────
if [[ -f /usr/local/bin/vigil-setup ]]; then
    rm -f /usr/local/bin/vigil-setup
    success "Removed vigil-setup helper"
fi

# ── STEP 6: Remove system user ───────────────────────────────────────────────
if id "vigil-agent" &>/dev/null; then
    userdel vigil-agent 2>/dev/null || true
    success "Removed system user 'vigil-agent'"
fi

# ── STEP 7: Firewall cleanup (cosmetic only — does not free ports) ────────────
#
# NOTE: UFW rules control external packet filtering.
#       Removing them does NOT stop a process from listening locally.
#       This step is intentionally last and clearly labelled as cosmetic.
#
if command -v ufw &>/dev/null; then
    info "Cleaning up UFW rules (firewall only — ports already freed above)..."
    for PORT in "${AGENT_PORTS[@]}"; do
        ufw delete allow "${PORT}/tcp" 2>/dev/null && \
            success "Removed UFW rule for port ${PORT}" || true
    done
fi

# ── Done ──────────────────────────────────────────────────────────────────────
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
