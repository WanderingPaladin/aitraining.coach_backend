#!/usr/bin/env bash
# Install nginx TLS for AI Trainers API (PM2 on 127.0.0.1:4000).
#
# Does not overwrite the SpeedUp vhost. Marks SpeedUp as default_server so
# unknown Host headers keep hitting sslip.io.
#
# Port 80 is SSH — HTTP-01 cannot be used. Certificates are issued with
# TLS-ALPN-01 on 443 (nginx is stopped briefly).
#
# DNS: api.aitrainers.coach must already resolve to this VPS public IPv4.
#
# Usage:
#   sudo bash deploy/setup-nginx-letsencrypt.sh
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo:  sudo bash $0"
  exit 1
fi

DOMAIN="${DOMAIN:-api.aitrainers.coach}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_SRC="$ROOT/deploy/nginx-aitraining.conf"
SITE_AVAIL=/etc/nginx/sites-available/aitraining-api
SITE_EN=/etc/nginx/sites-enabled/aitraining-api
SPEEDUP_SITE=/etc/nginx/sites-available/speedup-backend
PUBLIC_IP="$(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | head -1)"
RESOLVED="$(
  { dig @8.8.8.8 +short "$DOMAIN" A 2>/dev/null || true; } | grep -E '^[0-9.]+$' | tail -n1
)"
if [[ -z "$RESOLVED" ]]; then
  RESOLVED="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}')"
fi

echo "Public IPv4: $PUBLIC_IP"
echo "Certificate name: $DOMAIN"
echo "DNS A record: ${RESOLVED:-none}"

if [[ ! -f "$NGINX_SRC" ]]; then
  echo "Missing $NGINX_SRC"
  exit 1
fi

if [[ -z "$RESOLVED" || "$RESOLVED" != "$PUBLIC_IP" ]]; then
  echo "Refusing to issue a cert: $DOMAIN must A-record to $PUBLIC_IP (got '${RESOLVED:-none}')."
  echo "In GoDaddy, add: Type A, Name api, Value $PUBLIC_IP"
  exit 1
fi

if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow 443/tcp comment 'https' || true
fi

export HOME=/root
if [[ ! -x /root/.acme.sh/acme.sh ]]; then
  curl -sSf https://raw.githubusercontent.com/acmesh-official/acme.sh/master/acme.sh \
    | sh -s -- --install-online -m "admin@${DOMAIN}" --home /root/.acme.sh --nocron
fi
ACME=/root/.acme.sh/acme.sh
"$ACME" --set-default-ca --server letsencrypt
"$ACME" --register-account -m "admin@${DOMAIN}" --server letsencrypt || true

echo "Stopping nginx so ACME TLS-ALPN can bind :443"
systemctl stop nginx || true

"$ACME" --issue --alpn -d "$DOMAIN" --server letsencrypt

CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
mkdir -p "$CERT_DIR"
"$ACME" --install-cert -d "$DOMAIN" \
  --key-file "$CERT_DIR/privkey.pem" \
  --fullchain-file "$CERT_DIR/fullchain.pem" \
  --reloadcmd "systemctl reload nginx || true"

install -m 0644 "$NGINX_SRC" "$SITE_AVAIL"
ln -sfn "$SITE_AVAIL" "$SITE_EN"

if [[ -f "$SPEEDUP_SITE" ]] && ! grep -q 'default_server' "$SPEEDUP_SITE"; then
  sed -i 's/listen 443 ssl http2;/listen 443 ssl http2 default_server;/' "$SPEEDUP_SITE"
  sed -i 's/listen \[::\]:443 ssl http2;/listen [::]:443 ssl http2 default_server;/' "$SPEEDUP_SITE"
  echo "Marked SpeedUp vhost as default_server"
fi

nginx -t
systemctl enable nginx
systemctl start nginx

CRON_ACME='0 3 * * * /root/.acme.sh/acme.sh --cron --home /root/.acme.sh --pre-hook "systemctl stop nginx || true" --post-hook "systemctl start nginx || true" > /dev/null'
(crontab -l 2>/dev/null | grep -v 'acme.sh --cron' || true; echo "$CRON_ACME") | crontab -

echo
echo "nginx is proxying https://${DOMAIN} → 127.0.0.1:4000"
echo "SpeedUp vhost is unchanged (sslip.io → 127.0.0.1:5000)."
echo "Restart the API on loopback if needed:"
echo "  sudo -u crush pm2 restart aitraining-api --update-env"
