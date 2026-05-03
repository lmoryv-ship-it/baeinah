#!/usr/bin/env bash
# ============================================================
# بَيِّنة — إعداد السيرفر من الصفر (Ubuntu 22.04 LTS)
# الاستخدام: sudo bash setup.sh
# ============================================================
set -euo pipefail

DOMAIN="baeinah.sa"
APP_USER="deploy"
APP_DIR="/var/www/baeinah"

log() { echo -e "\n\033[1;36m▶ $1\033[0m"; }

# ── 1. تحديث النظام ──────────────────────────────────────
log "تحديث النظام"
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. تثبيت المتطلبات ───────────────────────────────────���
log "تثبيت Docker و Nginx و Certbot"
apt-get install -y -qq curl git nginx certbot python3-certbot-nginx ufw

# Docker
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker --now
fi

# Docker Compose v2
if ! docker compose version &>/dev/null; then
    apt-get install -y -qq docker-compose-plugin
fi

# Node.js 20 (للـ PM2 إذا لزم)
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
npm install -g pm2 &>/dev/null

# ── 3. مستخدم النشر ──────────────────────────────────────
log "إنشاء مستخدم النشر: $APP_USER"
if ! id "$APP_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$APP_USER"
    usermod -aG docker "$APP_USER"
fi

# ── 4. جدار الحماية ──────────────────────────────────────
log "ضبط UFW"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment "SSH"
ufw allow 80/tcp   comment "HTTP"
ufw allow 443/tcp  comment "HTTPS"
ufw --force enable

# ── 5. Nginx ──────────────────────────────────────────────
log "ضبط Nginx"
mkdir -p "$APP_DIR"
cp "$(dirname "$0")/../nginx/baeinah.conf" /etc/nginx/sites-available/baeinah
cp "$(dirname "$0")/../nginx/rate-limit.conf" /etc/nginx/conf.d/

ln -sf /etc/nginx/sites-available/baeinah /etc/nginx/sites-enabled/baeinah
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx

# ── 6. شهادة SSL ─────────────────────────────────────────
log "إصدار شهادة Let's Encrypt لـ $DOMAIN"
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
    --non-interactive --agree-tos --email "admin@$DOMAIN" \
    --redirect || echo "⚠️  تحقق من DNS أولاً ثم أعد تشغيل Certbot"

# تجديد تلقائي
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -

# ── 7. تهيئة مجلد التطبيق ────────────────────────────────
log "تهيئة مجلد التطبيق"
mkdir -p "$APP_DIR"/{data,uploads,logs}
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

log "✅ الإعداد مكتمل!"
echo ""
echo "الخطوات التالية:"
echo "  1. انسخ ملف .env إلى $APP_DIR/.env"
echo "  2. cd $APP_DIR && docker compose up -d"
echo "  3. تأكد من الموقع: https://$DOMAIN"
