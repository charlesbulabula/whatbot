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
# In CI, the password comes from $SSHPASS (GitHub secret) through sshpass.
#
# Settings: any WHATBOT_<KEY> environment variable is written into the
# server's .env as <KEY> (e.g. WHATBOT_WA_TOKEN -> WA_TOKEN). Values are
# sent over SSH stdin and never printed: CI logs of this public repo are public.

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

IN_CI="${GITHUB_ACTIONS:-false}"

echo "==> Connecting to $VPS"
if [[ -n "${SSHPASS:-}" ]]; then
  sshpass -e ssh "${SSH_OPTS[@]}" -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no "$VPS" true
else
  remote true
fi

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
if [ ${#need[@]} -gt 0 ]; then
  # A single broken third-party repository must not block the install: ignore update errors,
  # then check that what we need is really there.
  apt-get update -qq || echo "WARNING: apt-get update reported errors (a third-party repository?), continuing"
  apt-get install -y -qq "${need[@]}"
fi
for bin in nginx certbot rsync; do
  command -v "$bin" >/dev/null || { echo "ERROR: $bin could not be installed. Aborting."; exit 1; }
done
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
REMOTE

# Settings from WHATBOT_* variables (GitHub secrets in CI), applied without echoing values.
# Domain and port always follow this script's parameters.
export WHATBOT_PUBLIC_URL="https://$DOMAIN" WHATBOT_PORT="$PORT"
overrides=$(env | grep -E '^WHATBOT_[A-Z0-9_]+=.' | sed 's/^WHATBOT_//' || true)
if [[ -n "$overrides" ]]; then
  printf '%s\n' "$overrides" | remote "cd $REMOTE_DIR && node deploy/merge-env.js .env"
fi
remote "chown -R whatbot:whatbot $REMOTE_DIR && chmod 600 $REMOTE_DIR/.env"

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
curl -sf --max-time 10 -o /dev/null -w 'local health : %{http_code}\n' http://127.0.0.1:$PORT/healthz
REMOTE

echo "==> Nginx vhost for $DOMAIN"
remote bash -s <<REMOTE
set -euo pipefail
conf=/etc/nginx/sites-available/$SERVICE
link=/etc/nginx/sites-enabled/$SERVICE
if [ -f "\$conf" ] && grep -q "server_name $DOMAIN;" "\$conf" && [ -L "\$link" ] && nginx -t 2>/dev/null; then
  echo "vhost already in place"
  exit 0   # keep it as is: certbot added the HTTPS part to this file
fi
# Other sites live on this nginx: never leave it in a state that fails to reload.
# First check that nginx is healthy without our vhost (a failed earlier attempt may have left it broken).
was_linked=false
if [ -L "\$link" ]; then was_linked=true; rm -f "\$link"; fi
if ! nginx -t 2>/dev/null; then
  \$was_linked && ln -sf "\$conf" "\$link"
  echo "ERROR: the nginx configuration of other sites is invalid; not touching it."
  nginx -t || true
  exit 1
fi
backup=""
if [ -f "\$conf" ]; then backup=\$(mktemp); cp "\$conf" "\$backup"; fi
sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$PORT/g" $REMOTE_DIR/deploy/whatbot.nginx > "\$conf"
[ -f /proc/net/if_inet6 ] || sed -i '/listen \[::\]/d' "\$conf"   # host without IPv6
ln -sf "\$conf" "\$link"
if ! nginx -t; then
  echo "ERROR: nginx rejected the whatbot vhost; restoring the previous state."
  if [ -n "\$backup" ]; then cp "\$backup" "\$conf"; else rm -f "\$link" "\$conf"; fi
  nginx -t
  exit 1
fi
systemctl reload nginx
REMOTE

echo "==> HTTPS certificate"
remote bash -s <<REMOTE
set -euo pipefail
server_ip=\$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print \$1}' || true)
dns_ip=\$(getent ahostsv4 $DOMAIN | awk 'NR==1{print \$1}' || true)   # empty until the DNS record exists
if [ "\$dns_ip" != "\$server_ip" ]; then
  echo "SKIPPED: $DOMAIN resolves to '\${dns_ip:-nothing}', not \$server_ip."
  echo "         Create the DNS A record, wait a few minutes, then re-run this script."
  exit 0
fi
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect --keep-until-expiring
REMOTE

echo "==> Public check"
curl -sf --max-time 15 -o /dev/null -w "public health: %{http_code}\n" "https://$DOMAIN/healthz" \
  || echo "public health: not reachable yet (DNS or certificate pending, see above)"

echo
echo "==> Configuration status (names only)"
remote "cd $REMOTE_DIR && node deploy/config-status.js .env"

# A deploy rewrites .env from the secrets, so a stale WA_TOKEN secret silently
# replaces a working token. Say so loudly instead of letting orders fail.
echo
echo "==> WhatsApp token"
remote bash -s <<'REMOTE'
cd /opt/whatbot
set -a; . ./.env 2>/dev/null; set +a
if [ -z "${WA_TOKEN:-}" ] || [ -z "${WA_PHONE_NUMBER_ID:-}" ]; then
  echo "    not configured"
  exit 0
fi
body=$(curl -s -m 15 -H "Authorization: Bearer $WA_TOKEN" \
  "https://graph.facebook.com/${WA_GRAPH_VERSION:-v21.0}/$WA_PHONE_NUMBER_ID?fields=display_phone_number,quality_rating")
case "$body" in
  *'"error"'*)
    echo "    !! REFUSED BY META — the bot receives messages but cannot answer."
    echo "    !! Update the WA_TOKEN secret: a deploy always restores it from there."
    ;;
  *) echo "    accepted by Meta" ;;
esac
REMOTE

echo
echo "==> Meta webhook  : https://$DOMAIN/webhook  (verify token = WA_VERIFY_TOKEN)"
echo "==> Dashboard     : https://$DOMAIN/admin    (user: admin, password = ADMIN_PASSWORD)"
if [[ "$IN_CI" != "true" ]]; then
  # Local run only: show the generated secrets so they can be pasted into Meta / a password manager.
  remote "grep -E '^(WA_VERIFY_TOKEN|ADMIN_PASSWORD)=' $REMOTE_DIR/.env | sed 's/^/    /'"
fi
