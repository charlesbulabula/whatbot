#!/usr/bin/env bash
#
# Deploys whatbot to the VPS, next to the sites already running there.
#
#   ./deploy/deploy.sh                       from the repository root
#   DOMAIN=bot.example.com ./deploy/deploy.sh
#
# ADDITIVE ONLY: writes to /opt/whatbot, one systemd service (whatbot), one
# nginx vhost (whatbot). It never touches other sites, never enables a
# firewall, and refuses to run if the port or folder already belong to
# something else. Safe to re-run: .env and the database are never overwritten.
#
# The SSH connection is shared, so the root password is asked only once.

set -euo pipefail

VPS="${VPS:-root@72.62.238.174}"
DOMAIN="${DOMAIN:-bot.ll-aca.site}"
EMAIL="${EMAIL:-hello@ll-aca.site}"   # Let's Encrypt expiry notices
PORT="${PORT:-3023}"
REMOTE_DIR="/opt/whatbot"
SERVICE="whatbot"

[[ -f src/bot/engine.js ]] || { echo "Run from the repository root (src/bot/engine.js not found)"; exit 1; }

mkdir -p "$HOME/.ssh"
SSH_OPTS=(-o ControlMaster=auto -o "ControlPath=$HOME/.ssh/whatbot-%r@%h:%p" -o ControlPersist=10m -o StrictHostKeyChecking=accept-new)
remote() { ssh "${SSH_OPTS[@]}" "$VPS" "$@"; }
trap 'ssh "${SSH_OPTS[@]}" -O exit "$VPS" 2>/dev/null || true' EXIT

echo "==> Connecting to $VPS"
remote true

echo "==> Server guardrails"
remote bash -s <<REMOTE
set -euo pipefail
if [ -d "$REMOTE_DIR" ] && [ -n "\$(ls -A "$REMOTE_DIR" 2>/dev/null)" ] && [ ! -f "$REMOTE_DIR/src/bot/engine.js" ]; then
  echo "ERROR: $REMOTE_DIR exists and is not this project. Aborting."; exit 1
fi
if ss -ltn 2>/dev/null | grep -q "127.0.0.1:$PORT " && ! systemctl is-active --quiet $SERVICE; then
  echo "ERROR: port $PORT is already used by another service. Re-run with PORT=<free port>. Aborting."; exit 1
fi
if [ -f /etc/nginx/sites-enabled/$SERVICE ] && ! grep -q "server_name $DOMAIN;" /etc/nginx/sites-enabled/$SERVICE; then
  echo "NOTE: the existing whatbot vhost uses another domain; it will be replaced by $DOMAIN."
fi
REMOTE

echo "==> Server packages (Node 22, nginx, certbot) — installed only if missing"
remote bash -s <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
need=()
command -v nginx   >/dev/null || need+=(nginx)
command -v certbot >/dev/null || need+=(certbot python3-certbot-nginx)
command -v rsync   >/dev/null || need+=(rsync)
command -v make    >/dev/null || need+=(build-essential python3)   # fallback build of better-sqlite3
if [ ${#need[@]} -gt 0 ]; then apt-get update -qq && apt-get install -y -qq "${need[@]}"; fi
major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$major" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
id -u whatbot >/dev/null 2>&1 || useradd --system --home-dir /opt/whatbot --shell /usr/sbin/nologin whatbot
echo "node $(node -v)"
REMOTE

echo "==> Uploading sources"
# --delete only applies inside $REMOTE_DIR; excluded paths (.env, data) are never deleted.
remote "mkdir -p $REMOTE_DIR/data"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules --exclude .npm --exclude .git --exclude .env --exclude 'data/' --exclude logs \
  ./ "$VPS:$REMOTE_DIR/"

echo "==> Configuration (.env is created once, then left alone)"
remote bash -s <<REMOTE
set -euo pipefail
cd $REMOTE_DIR
if [ ! -f .env ]; then
  cp .env.example .env
  rand() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "\$1"; }
  sed -i "s|^PORT=.*|PORT=$PORT|" .env
  sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://$DOMAIN|" .env
  sed -i "s|^WA_VERIFY_TOKEN=.*|WA_VERIFY_TOKEN=\$(rand 32)|" .env
  sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=\$(rand 20)|" .env
  echo "Created $REMOTE_DIR/.env with a random admin password and webhook verify token."
fi
chown -R whatbot:whatbot $REMOTE_DIR
chmod 600 .env
REMOTE

echo "==> Installing dependencies"
remote "cd $REMOTE_DIR && runuser -u whatbot -- env HOME=$REMOTE_DIR npm ci --omit=dev --no-audit --no-fund"

echo "==> Service"
remote bash -s <<REMOTE
set -euo pipefail
install -m 644 $REMOTE_DIR/deploy/whatbot.service /etc/systemd/system/$SERVICE.service
install -m 644 $REMOTE_DIR/deploy/whatbot.cron /etc/cron.d/$SERVICE
systemctl daemon-reload
systemctl enable --quiet $SERVICE
systemctl restart $SERVICE
sleep 3
systemctl is-active --quiet $SERVICE || { journalctl -u $SERVICE -n 40 --no-pager; exit 1; }
curl -sf -o /dev/null -w 'local health : %{http_code}\n' http://127.0.0.1:$PORT/healthz
REMOTE

echo "==> Nginx vhost for $DOMAIN"
remote bash -s <<REMOTE
set -euo pipefail
conf=/etc/nginx/sites-available/$SERVICE
if [ ! -f "\$conf" ] || ! grep -q "server_name $DOMAIN;" "\$conf"; then
  sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$PORT/g" $REMOTE_DIR/deploy/whatbot.nginx > "\$conf"
  ln -sf "\$conf" /etc/nginx/sites-enabled/$SERVICE
  nginx -t
  systemctl reload nginx
fi
REMOTE

echo "==> HTTPS certificate"
remote bash -s <<REMOTE
set -euo pipefail
server_ip=\$(curl -4 -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print \$1}')
dns_ip=\$(getent ahostsv4 $DOMAIN | awk 'NR==1{print \$1}')
if [ "\$dns_ip" != "\$server_ip" ]; then
  echo "SKIPPED: $DOMAIN resolves to '\${dns_ip:-nothing}', not \$server_ip."
  echo "         Create the DNS A record, wait a few minutes, then re-run this script."
  exit 0
fi
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect --keep-until-expiring
REMOTE

echo "==> Public check"
curl -sf -o /dev/null -w "public health: %{http_code}\n" "https://$DOMAIN/healthz" \
  || echo "public health: not reachable yet (DNS or certificate pending, see above)"

echo
echo "==> Values to paste into Meta (developers.facebook.com > WhatsApp > Configuration)"
remote "cd $REMOTE_DIR && echo \"  Callback URL : https://$DOMAIN/webhook\" && grep -E '^(WA_VERIFY_TOKEN)=' .env | sed 's/^WA_VERIFY_TOKEN=/  Verify token : /'"
echo
echo "==> Dashboard: https://$DOMAIN/admin  (user: admin)"
remote "grep -E '^ADMIN_PASSWORD=' $REMOTE_DIR/.env | sed 's/^ADMIN_PASSWORD=/    password : /'"
remote "grep -qE '^WA_TOKEN=.+' $REMOTE_DIR/.env" \
  || echo "    ⚠ WhatsApp credentials are still empty: edit $REMOTE_DIR/.env (see README), then: ssh $VPS systemctl restart $SERVICE"
