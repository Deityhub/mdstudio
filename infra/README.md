# Infra blueprints

One Drizzle SQLite schema, two deployments. `src/server/db.ts` (`getDb(request)`) opens the D1
binding `DB` on Cloudflare or the SQLite file in `DATA_DIR` in Docker, and `GET /api/health` reports
whether it answers. The Workers build aliases the Node driver to a stub, so better-sqlite3 stays out
of the Worker bundle. Auth, sync and uploads are the next milestone 3 units.

| Path                               | What it is                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `db/schema.ts`                     | The shared schema (users, sessions, documents, revisions, assets, share links).                                       |
| `db/client.ts`                     | `createD1Db(env.DB)` for Cloudflare Workers.                                                                          |
| `db/node.ts`                       | `createNodeDb(file)` for Docker: better-sqlite3, WAL, foreign keys, runs migrations.                                  |
| `storage/`                         | `ObjectStore` interface with R2 (`r2.ts`) and disk (`disk.ts`) implementations. Keys are validated against traversal. |
| `migrations/`                      | SQL from `bun run db:generate`. Applied by `wrangler d1 migrations apply` on D1 and by the Drizzle migrator on Node.  |
| `Dockerfile`, `docker-compose.yml` | Self-hosted container.                                                                                                |
| `wrangler.toml`                    | Hosted-tier blueprint with placeholder ids.                                                                           |

## Self-hosting

```bash
docker compose -f infra/docker-compose.yml up -d    # http://localhost:3000
```

Data lives in the `mdstudio-data` volume mounted at `/data`. `GET /api/health` is the liveness probe.

## GitHub sign-in (optional)

Create an OAuth app (GitHub → Settings → Developer settings → OAuth Apps) with the callback URL
`<your address>/api/auth/github/callback`, then set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
(and `PUBLIC_URL`, e.g. `https://notes.example.com`, when a proxy hides the real address). Without
both, the button is not shown. An existing password account is never linked automatically to a
GitHub account with the same email.

## Cloud limits

Each account may keep `MAX_CLOUD_DOCS` drafts in the cloud (default 5; `0` switches cloud storage off).
Hosted images are on by default in Docker, and you pay for the disk. `MAX_ASSETS` (default 10) and `MAX_ASSET_BYTES` (default 10 MB) per account, 1 MB each. In Docker the
files live under `/data/uploads` on the volume; on Cloudflare they live in the R2 bucket bound as `IMAGES`
(see `docs/RELEASING.md`). Set these in the environment of the server or container.

## Changing the schema

Edit `db/schema.ts`, run `bun run db:generate`, commit the new migration. Never write
engine-specific SQL: both drivers must run the same queries.
