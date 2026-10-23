# syntax=docker/dockerfile:1
# Production images of the collector (App 1) and the dashboard (App 2), design §9.1. One stage
# installs the whole workspace; each app gets a small runtime stage with its bundle:
#   docker build --target collector .   or   docker build --target dashboard .
# docker-compose.yaml builds both. mqtt.js parses the broker URL with url.parse(), which Node 24
# flags on every start (DEP0169): that one warning is silenced.

FROM node:24-slim AS workspace
WORKDIR /repo
RUN npm install --global --no-audit --no-fund pnpm@11.5.1
# Manifests first: the dependency layer is reused until one of them changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/collector/package.json apps/collector/
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/db/package.json packages/db/
COPY packages/mqtt-admin/package.json packages/mqtt-admin/
COPY packages/shared/package.json packages/shared/
COPY tools/simulator/package.json tools/simulator/
RUN pnpm install --frozen-lockfile
COPY . .

FROM workspace AS collector-build
RUN node scripts/bundle-server.mjs collector

FROM workspace AS dashboard-build
RUN node scripts/bundle-server.mjs dashboard && pnpm --filter @wx/dashboard build

FROM node:24-slim AS collector
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/migrations \
    HEALTH_FILE=/tmp/collector-alive
WORKDIR /app
COPY --from=collector-build /repo/packages/db/migrations ./migrations
COPY --from=collector-build /repo/apps/collector/dist ./
USER node
# Healthy while the heartbeat (every 30 s) reaches the database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=2m --retries=3 \
  CMD ["node", "-e", "const { mtimeMs } = require('node:fs').statSync(process.env.HEALTH_FILE); process.exit(Date.now() - mtimeMs < 90000 ? 0 : 1)"]
CMD ["node", "--enable-source-maps", "--disable-warning=DEP0169", "main.mjs"]

FROM node:24-slim AS dashboard
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    MIGRATIONS_DIR=/app/migrations \
    WEB_DIST=/app/web
WORKDIR /app
# Packages left out of the bundle (the native argon2 addon), at the versions of the lockfile.
COPY --from=dashboard-build /repo/apps/dashboard/dist/server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund --cache /tmp/npm-cache && rm -rf /tmp/npm-cache
COPY --from=dashboard-build /repo/packages/db/migrations ./migrations
COPY --from=dashboard-build /repo/apps/dashboard/dist/web ./web
COPY --from=dashboard-build /repo/apps/dashboard/dist/server ./
USER node
EXPOSE 3000
# /healthz answers once the API is up and reaches the database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=2m --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--enable-source-maps", "--disable-warning=DEP0169", "main.mjs"]
