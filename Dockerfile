# ── مرحلة البناء ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# ── مرحلة التشغيل ─────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Riyadh /etc/localtime && \
    echo "Asia/Riyadh" > /etc/timezone && \
    apk del tzdata

# مستخدم غير جذر للأمان
RUN addgroup -S baeinah && adduser -S baeinah -G baeinah

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

# مجلدات وقت التشغيل
RUN mkdir -p data uploads && \
    chown -R baeinah:baeinah /app

USER baeinah

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/server.js"]
