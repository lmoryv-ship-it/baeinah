FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S bayyinah && adduser -S bayyinah -G bayyinah
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p uploads && chown -R bayyinah:bayyinah /app
USER bayyinah

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
