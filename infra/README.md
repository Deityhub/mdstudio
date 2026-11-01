# Infra blueprints

One Drizzle SQLite schema, two deployments. Nothing here is wired into the app yet: milestone 3
("Activate Server Blueprint" in `roadmap.md`) moves it into `src/server/`.

| Path | What it is |
| --- | --- |
| `db/schema.ts` | The shared schema (users, sessions, documents, revisions, assets, share links). |
| `db/client.ts` | `createD1Db(env.DB)` for Cloudflare Workers. |
| `db/node.ts` | `createNodeDb(file)` for Docker: better-sqlite3, WAL, foreign keys, runs migrations. |
| `storage/` | `ObjectStore` interface with R2 (`r2.ts`) and disk (`disk.ts`) implementations. Keys are validated against traversal. |
| `migrations/` | SQL from `bun run db:generate`. Applied by `wrangler d1 migrations apply` on D1 and by the Drizzle migrator on Node. |
| `Dockerfile`, `docker-compose.yml` | Self-hosted container. |
| `wrangler.toml` | Hosted-tier blueprint with placeholder ids. |

## Self-hosting

```bash
docker compose -f infra/docker-compose.yml up -d    # http://localhost:3000
```

Data lives in the `mdstudio-data` volume mounted at `/data`. `GET /api/health` is the liveness probe.

## Changing the schema

Edit `db/schema.ts`, run `bun run db:generate`, commit the new migration. Never write
engine-specific SQL: both drivers must run the same queries.
