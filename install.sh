#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Vigil — installer / updater
#  Designed for zip-based distribution (no git required)
#
#  Usage:
#    1. Unzip the release into any folder
#    2. cd into that folder
#    3. bash install.sh
#
#  Or for a clean reinstall:
#    bash install.sh --reinstall
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

INSTALL_DIR="/opt/vigil"
DATA_DIR="/opt/vigil/data"
PORT="${PORT:-3000}"
REINSTALL=false

for arg in "$@"; do
  [[ "$arg" == "--reinstall" ]] && REINSTALL=true
done

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERR]${RESET}   $*" >&2; exit 1; }

# ── Banner ─────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ██╗   ██╗██╗ ██████╗ ██╗██╗     "
echo "  ██║   ██║██║██╔════╝ ██║██║     "
echo "  ██║   ██║██║██║  ███╗██║██║     "
echo "  ╚██╗ ██╔╝██║██║   ██║██║██║     "
echo "   ╚████╔╝ ██║╚██████╔╝██║███████╗"
echo "    ╚═══╝  ╚═╝ ╚═════╝ ╚═╝╚══════╝"
echo -e "${CYAN}  Vigil — Self-Hosted Installer${RESET}"
echo ""

# ── Must run from the unzipped source folder ───────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -f "$SCRIPT_DIR/docker-compose.yml" ]]; then
  error "Run this script from inside the unzipped Vigil folder."
fi

# ── Check OS ───────────────────────────────────────────────────────────────────
if [[ ! -f /etc/debian_version ]]; then
  warn "This installer targets Debian/Ubuntu. Other distros may work but are untested."
fi

# ── Install dependencies ───────────────────────────────────────────────────────
info "Updating package lists…"
apt-get update -qq

for pkg in curl rsync; do
  if ! command -v "$pkg" &>/dev/null; then
    info "Installing $pkg…"
    apt-get install -y -qq "$pkg"
  fi
done

# ── Docker ─────────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Docker not found — installing via get.docker.com…"
  curl -fsSL https://get.docker.com | sh
  success "Docker installed."
else
  success "Docker already installed ($(docker --version))."
fi

if ! docker compose version &>/dev/null; then
  info "Installing Docker Compose plugin…"
  apt-get install -y -qq docker-compose-plugin
fi
success "Docker Compose ready ($(docker compose version --short))."

# ── Handle reinstall ────────────────────────────────────────────────────────────
if [[ "$REINSTALL" == "true" ]]; then
  warn "Reinstall flag set."
  if [[ -d "$INSTALL_DIR" ]]; then
    warn "Stopping containers and removing $INSTALL_DIR (data will be lost)…"
    cd "$INSTALL_DIR" && docker compose down -v 2>/dev/null || true
    # Remove all images built by this project
    docker image rm vigil-backend vigil-frontend 2>/dev/null || true
    cd /
    rm -rf "$INSTALL_DIR"
    success "Old installation removed."
  fi
fi

# ── Copy files into INSTALL_DIR ────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR" ]]; then
  info "Existing installation found at $INSTALL_DIR — updating files (data preserved)…"
  # Stop containers before updating
  if docker compose -f "$INSTALL_DIR/docker-compose.yml" ps -q 2>/dev/null | grep -q .; then
    info "Stopping running containers…"
    docker compose -f "$INSTALL_DIR/docker-compose.yml" down
  fi
else
  info "Creating $INSTALL_DIR…"
  mkdir -p "$INSTALL_DIR"
fi

# Sync source files, preserving data/ and .env
info "Copying application files…"
rsync -a --exclude='data/' --exclude='.env' "$SCRIPT_DIR/" "$INSTALL_DIR/"
success "Files copied to $INSTALL_DIR."

cd "$INSTALL_DIR"
mkdir -p data

# ── Create .env if missing ─────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  cp .env.example .env
  success ".env created from template."
  # Write PORT into .env
  sed -i "s|^PORT=.*|PORT=${PORT}|" .env
else
  info ".env already exists — your settings are preserved."
fi

# ── Optional Telegram setup ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Telegram notifications (optional — press Enter to skip both)${RESET}"
read -rp "  Telegram Bot Token : " TG_TOKEN  || true
read -rp "  Telegram Chat ID   : " TG_CHAT_ID || true

[[ -n "${TG_TOKEN:-}"   ]] && sed -i "s|^TELEGRAM_TOKEN=.*|TELEGRAM_TOKEN=${TG_TOKEN}|"       .env
[[ -n "${TG_CHAT_ID:-}" ]] && sed -i "s|^TELEGRAM_CHAT_ID=.*|TELEGRAM_CHAT_ID=${TG_CHAT_ID}|" .env

# ── Build and start ────────────────────────────────────────────────────────────
echo ""
info "Building containers (first build takes a few minutes)…"
docker compose build --no-cache
docker compose up -d
success "Containers started."

# ── Health check ──────────────────────────────────────────────────────────────
echo ""
info "Waiting for services to become healthy…"
HEALTHY=false
for i in $(seq 1 40); do
  if curl -sf "http://localhost:${PORT}/api/health" &>/dev/null; then
    HEALTHY=true
    success "Backend is healthy."
    break
  fi
  # Show container status every 10 attempts to help debug
  if (( i % 10 == 0 )); then
    info "Still waiting… container status:"
    docker compose ps
  fi
  sleep 3
done

if [[ "$HEALTHY" != "true" ]]; then
  echo ""
  warn "Backend did not become healthy in time. Showing container logs:"
  echo ""
  echo -e "${YELLOW}─── Frontend logs ───────────────────────────────${RESET}"
  docker compose logs --tail=30 frontend
  echo ""
  echo -e "${YELLOW}─── Backend logs ────────────────────────────────${RESET}"
  docker compose logs --tail=30 backend
  echo ""
  echo -e "${YELLOW}─── Nginx logs ──────────────────────────────────${RESET}"
  docker compose logs --tail=20 nginx
  echo ""
  error "Installation failed. Check the logs above for details.\nRe-run with: bash install.sh --reinstall"
fi

# ── Self-test ─────────────────────────────────────────────────────────────────
echo ""
info "Running self-test…"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
  success "Frontend reachable locally (HTTP ${HTTP_CODE}) ✓"
else
  warn "Frontend returned HTTP ${HTTP_CODE} on localhost — may still be starting."
  warn "Wait 30s then check: cd ${INSTALL_DIR} && docker compose logs"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   ✅  Vigil is up and running!                  ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  🌐  Open in your browser (on another machine):"
echo -e "      ${CYAN}http://${IP}:${PORT}${RESET}"
echo ""
echo -e "  ${YELLOW}⚠️  Do NOT open this URL on the server itself.${RESET}"
echo -e "  ${YELLOW}   Use a browser on your laptop or desktop instead.${RESET}"
echo ""
echo -e "  🔑  Default login: ${YELLOW}admin${RESET} / ${YELLOW}admin${RESET}"
echo ""
echo -e "  📋  Commands:"
echo -e "      ${YELLOW}cd ${INSTALL_DIR} && docker compose logs -f${RESET}    # live logs"
echo -e "      ${YELLOW}cd ${INSTALL_DIR} && docker compose ps${RESET}         # status"
echo -e "      ${YELLOW}cd ${INSTALL_DIR} && docker compose down${RESET}       # stop"
echo -e "      ${YELLOW}cd ${INSTALL_DIR} && docker compose up -d${RESET}      # start"
echo ""
echo -e "  🔄  To update Vigil:"
echo -e "      ${YELLOW}cd ${INSTALL_DIR} && docker compose build --no-cache backend frontend && docker compose up -d${RESET}"
echo ""
echo -e "  📄  Config: ${INSTALL_DIR}/.env"
echo ""
