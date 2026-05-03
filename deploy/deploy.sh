#!/usr/bin/env bash
# ============================================================
# بَيِّنة — نشر تحديث جديد
# الاستخدام: bash deploy.sh [branch]
# ============================================================
set -euo pipefail

BRANCH="${1:-main}"
APP_DIR="/var/www/baeinah"
IMAGE="baeinah_app"

log()  { echo -e "\n\033[1;36m▶ $1\033[0m"; }
ok()   { echo -e "\033[1;32m✓ $1\033[0m"; }
fail() { echo -e "\033[1;31m✗ $1\033[0m"; exit 1; }

cd "$APP_DIR" || fail "المجلد $APP_DIR غير موجود"

# ── سحب آخر تحديث ────────────────────────────────────────
log "سحب الكود من الفرع: $BRANCH"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"
ok "تم تحديث الكود"

# ── بناء الصورة ──────────────────────────────────────────
log "بناء Docker image"
docker compose build --no-cache app
ok "تم بناء الصورة"

# ── نسخة احتياطية من قاعدة البيانات ─────────────────────
log "نسخة احتياطية"
BACKUP_DIR="$APP_DIR/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
if [ -f "$APP_DIR/data/baeinah.db" ]; then
    cp "$APP_DIR/data/baeinah.db" "$BACKUP_DIR/baeinah_$TIMESTAMP.db"
    # احتفظ بآخر 10 نسخ فقط
    ls -t "$BACKUP_DIR"/*.db 2>/dev/null | tail -n +11 | xargs -r rm
    ok "تم حفظ النسخة الاحتياطية"
fi

# ── إعادة تشغيل الحاوية ──────────────────────────────────
log "إعادة تشغيل التطبيق (zero-downtime)"
docker compose up -d --no-deps --remove-orphans app
ok "تم إعادة التشغيل"

# ── التحقق من الصحة ──────────────────────────────────────
log "التحقق من صحة التطبيق"
sleep 5
MAX_TRIES=10
for i in $(seq 1 $MAX_TRIES); do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health || echo "000")
    if [ "$STATUS" = "200" ]; then
        ok "التطبيق يعمل بشكل صحيح (HTTP $STATUS)"
        break
    fi
    echo "  محاولة $i/$MAX_TRIES... ($STATUS)"
    sleep 3
    if [ "$i" = "$MAX_TRIES" ]; then
        fail "التطبيق لم يستجب — تحقق من: docker compose logs app"
    fi
done

# ── تنظيف صور قديمة ──────────────────────────────────────
docker image prune -f --filter "until=72h" &>/dev/null || true

log "✅ تم النشر بنجاح!"
echo "  الموقع: https://baeinah.sa"
echo "  السجلات: docker compose logs -f app"
