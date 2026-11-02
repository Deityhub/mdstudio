# Self-hosted mdstudio: Node.js + SQLite, one container, one volume.
# Build from the repository root:  docker build -f infra/Dockerfile -t mdstudio .

FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
# The web build never loads better-sqlite3, so skip its native compile here.
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
ENV NITRO_PRESET=node-server
RUN bun run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/infra/migrations ./infra/migrations
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", ".output/server/index.mjs"]
