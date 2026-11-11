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

## Real-time updates

Changes to cloud drafts reach your other devices as they happen, over a WebSocket on the same port; there is nothing to configure. Behind a reverse proxy it must pass WebSocket upgrades: Caddy does by default, nginx needs `proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection "upgrade";` in the location that serves the app. Without upgrades the app falls back to checking every minute.

## GitHub sign-in (optional)

Create an OAuth app (GitHub → Settings → Developer settings → OAuth Apps) with the callback URL
`<your address>/api/auth/github/callback`, then set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
(and `PUBLIC_URL`, e.g. `https://notes.example.com`, when a proxy hides the real address). Without
both, the button is not shown. An account that already has the same (confirmed) email is signed in
and gains the GitHub sign-in; see "Linking accounts" below.

To let writers publish to their GitHub repositories, also set `GH_TOKEN_KEY` to 32 random bytes in
base64 (`openssl rand -base64 32`). It seals the GitHub tokens kept in the database; keep it stable,
since a new key means writers connect again. The same OAuth app and callback are used.

## Google sign-in (optional)

In the Google Cloud console create an OAuth client (APIs & Services → Credentials → OAuth client ID,
type "Web application") with the authorized redirect URI `<your address>/api/auth/google/callback`
(and the OAuth consent screen set up for the `openid`, `email` and `profile` scopes), then set
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (and `PUBLIC_URL` behind a proxy). Without both, the
button is not shown.

## Linking accounts

Google and GitHub sign-in work the same way. A sign-in the provider has already seen goes to the same
account. Otherwise the provider must vouch for the email; an account with that email (spelled any way
that reaches the same inbox) then gets the new sign-in added, so one person can use Google, GitHub and
a password for one account. If that account's address was never confirmed (a password sign-up on a
server that sends mail), its password and sessions are removed first, since whoever made it may not own
the address. Without an account for that email, a new one is made (unless an admin closed sign-ups).
Two providers with different emails make two accounts.

## Cloud limits

Limits are per account. The environment variables below are the **server-wide defaults**; a default set in
the admin dashboard, an account's plan or its own override take precedence (see "Account limits" in
`docs/SYSTEM_SPEC.md`). The first account created on a server is its **admin** and can open `/admin` to change
all of this. Another admin is made in the dashboard, or with SQL:

```sql
UPDATE users SET role = 'admin' WHERE email = 'pat@example.com';  -- 'user' takes it away
```

On Cloudflare run it in the D1 console (or `wrangler d1 execute`). Self-hosted: `sqlite3 /data/studio.db`.

Cloud history: `MAX_REVISIONS` versions kept per cloud draft (default 10; `0` switches server history off) and
`REVISION_INTERVAL_MINUTES` between automatic versions (default 5). They are stored compressed. The browser's
own History keeps 50 and is separate.

Share links: a verified account can publish a cloud draft as a public, read-only page at `/s/<slug>`. Every link
expires: `SHARE_MAX_DAYS` is the longest (default 7) and `SHARE_DEFAULT_DAYS` the default (4, never above the maximum).
The page keeps its own copy of the text until the writer publishes an update. A link can also be limited to named
people and can take comments from signed-in readers; `PRIVATE_LINKS=off` switches the named-people option off.

Each account may keep `MAX_CLOUD_DOCS` drafts in the cloud (default 5; `0` switches cloud storage off).
Hosted images are on by default in Docker, and you pay for the disk. `MAX_ASSETS` (default 10) and `MAX_ASSET_BYTES` (default 10 MB) per account, 1 MB each. In Docker the
files live under `/data/uploads` on the volume; on Cloudflare they live in the R2 bucket bound as `IMAGES`
(see `docs/RELEASING.md`). Set these in the environment of the server or container.

## Email confirmation and sign-up limits (optional)

Set `MAIL_FROM` plus one way to send: `SMTP_URL` (for example `smtps://user:pass@smtp.example.com:465`),
`RESEND_API_KEY` or `MAILTRAP_API_TOKEN` (every one that is set is used, the one with the most room left
first, falling back to the next on a failure; `MAIL_PROVIDERS` limits and orders them). With that, an account must confirm its address before it can store drafts in the
cloud (the email goes out the first time it tries the cloud, not at sign-up); without it nothing is
confirmed or blocked. For trying it out, `MAIL_OUTBOX_DIR=/data/outbox` writes
each message as a JSON file instead of sending it. Sign-ups are limited per address (`SIGNUP_LIMIT`, default
5 an hour), failed sign-ins per email and address (`LOGIN_FAIL_LIMIT`, default 10 in 15 minutes) and
confirmation emails per account (`VERIFY_EMAIL_LIMIT`, default 3 an hour). Password reset ("Forgot your password?")
needs mail too; its limits are `FORGOT_LIMIT` (5 an hour per address), `FORGOT_EMAIL_LIMIT` (3 an hour per inbox)
and `RESET_LIMIT` (10 an hour per address). Behind a reverse proxy set
`TRUST_PROXY=1` so the address comes from `X-Forwarded-For`; without it only the per-email limits apply,
because the address cannot be trusted. `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` add a CAPTCHA to sign-up.

## Changing the schema

Edit `db/schema.ts`, run `bun run db:generate`, commit the new migration. Never write
engine-specific SQL: both drivers must run the same queries.
