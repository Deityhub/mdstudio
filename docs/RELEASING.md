# Releasing

Versions follow [semantic versioning](https://semver.org). Commits follow
[Conventional Commits](https://www.conventionalcommits.org/), so the changelog writes itself:
`feat` goes under Features, `fix` under Fixes, `perf` under Performance, and `!` or a
`BREAKING CHANGE:` footer under Breaking changes. Everything else is left out.

## Cutting a release

1. Merge the work you want to ship into `dev` and let CI pass.
2. **Actions → Prepare release → Run workflow**, on the `dev` branch, and pick `patch`, `minor` or
   `major`. It bumps `package.json`, prepends the new section to `CHANGELOG.md` and opens a PR
   `release/vX.Y.Z` into `main`.
3. Read the changelog in that PR, fix wording if needed (push to the release branch), then merge it.
4. The **Release** workflow runs on `main`:
   - tags `vX.Y.Z` and publishes a GitHub Release with that changelog section;
   - builds `linux/amd64` and `linux/arm64` images and pushes `X.Y.Z`, `X.Y`, `X` (not for 0.x) and
     `latest` to `ghcr.io/deityhub/mdstudio` and `docker.io/deityhub/mdstudio`;
   - deploys to Cloudflare Workers at <https://mdstudio.deityhub.com>;
   - opens a PR to merge `main` back into `dev`. Merge it.

A push to `main` that does not bump the version (for example a hotfix) skips the tag and the images
and still deploys.

## One-time setup: repository secrets

Set each with `gh secret set NAME` (it prompts for the value, so nothing lands in shell history), or
under **Settings → Secrets and variables → Actions**.

| Secret                  | Used for    | How to get it                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | Deploy      | Cloudflare dashboard → **Workers & Pages** → copy **Account ID** from the right-hand panel.                                                                                                                                                                                                                                                       |
| `CLOUDFLARE_API_TOKEN`  | Deploy      | Dashboard → **My Profile → API Tokens → Create Token → Custom token**. Permissions: _Account · Workers Scripts · Edit_, _Zone · Workers Routes · Edit_, _Zone · DNS · Edit_. Zone resources: include `deityhub.com`. The domain must already be a zone on this Cloudflare account (the Worker claims `mdstudio.deityhub.com` as a custom domain). |
| `DOCKERHUB_USERNAME`    | Image push  | The Docker Hub user that can push to the `deityhub` namespace.                                                                                                                                                                                                                                                                                    |
| `DOCKERHUB_TOKEN`       | Image push  | hub.docker.com → **Account settings → Personal access tokens → Generate new token**, access **Read & Write**.                                                                                                                                                                                                                                     |
| `RELEASE_TOKEN`         | Release PRs | GitHub → **Settings → Developer settings → Fine-grained personal access tokens → Generate**. Repository access: only `Deityhub/mdstudio`. Permissions: _Contents: Read and write_, _Pull requests: Read and write_. A token is needed because PRs opened with the default `GITHUB_TOKEN` do not trigger CI.                                       |

Nothing to create for GitHub Container Registry: the workflow uses the built-in `GITHUB_TOKEN`.
After the first push, open the package under your profile's **Packages** and set its visibility if you
want the image to be pulled without logging in.

The deploy job runs in a `production` GitHub environment, which GitHub creates on first use. You can
add required reviewers to it under **Settings → Environments** for an approval gate.

## Pull request previews

Every pull request into `dev` gets a live preview, so you can see the change before you merge it.
The **Preview** workflow builds the PR, deploys it as its own Worker named `mdstudio-pr-<number>` and
comments the URL on the PR (the same URL appears in the PR's Deployments box). It updates on every
push, and the Worker is deleted when the PR closes. Previews send `X-Robots-Tag: noindex` and never
carry the production domain: `infra/worker-config.ts` leaves the custom-domain route out of preview
builds and refuses preview names that do not look like `mdstudio-pr-<number>`.

One-time setup, in addition to the secrets above:

- Register your account's **workers.dev subdomain** (Cloudflare dashboard → **Workers & Pages** →
  **Account details** → **Change** next to the subdomain), because previews live at
  `https://mdstudio-pr-<number>.<your-subdomain>.workers.dev`.
- Pull requests from forks are skipped (they cannot read the secrets). If a preview fails, the PR
  comment links to the workflow run.
- A preview is a separate Worker bound to a separate preview database, so it never touches production data.

## Real-time hub

The app's live updates run through a Durable Object in its own Worker (`infra/realtime`). The release workflow deploys it as `mdstudio-realtime` **before** the app, and every preview deploys the shared `mdstudio-realtime-preview` before its own Worker, because the app binds to the hub by that name (`REALTIME_SCRIPT` at build, see `infra/worker-config.ts`). Nothing to set up: the same Cloudflare token deploys it, it has no public address and needs no secrets, and it uses a SQLite-backed Durable Object, which Workers Free allows. If it is ever missing, the app still works: browsers fall back to polling. Free-plan limits (100,000 Durable Object requests and 13,000 GB-s a day) are shown in the Cloudflare dashboard under Workers, Durable Objects.

Live editing (several people in one draft) uses a second Durable Object class in the same Worker, `CollabRoom`, added by migration `v2` (`new_sqlite_classes`) in `infra/realtime/wrangler.jsonc`; the app reaches it through the `COLLAB` binding. Nothing else to set up, and the order stays the same (hub first, app second). Each live draft is one object that holds the document in its own SQLite and sleeps when nobody types. It is capped per account by the limits `collab_people`, `collab_docs` and `collab_enabled` (admin dashboard, per plan or account), and an admin can close it for the whole server with the `collab_open` setting. Free-plan limits (100,000 requests, 13,000 GB-s and 100,000 rows written a day) are shared with the hub; incoming socket messages count 20 to 1. To size it for a server you run, start it and run `bun scripts/collab-load.ts --url <address> --editors 8 --seconds 30` (set `MAX_COLLAB_PEOPLE` high enough on that server for the number of editors): it checks that every copy converges and prints the frames, from which the billed requests follow (frames to the room divided by 20).

## Logs and traces

Both Workers (the app and the real-time hub) have `observability` set: every log is kept (`head_sampling_rate: 1`, so an error is never sampled away) and 1 request in 20 is traced. The app's block is `OBSERVABILITY` in `infra/worker-config.ts`; the hub's is in `infra/realtime/wrangler.jsonc`, and a test keeps them equal. See them in the Cloudflare dashboard under Workers & Pages, the Worker, Observability (filter on errors; a trace follows a request from the app into the Durable Object), or live with `npx wrangler tail mdstudio` and `npx wrangler tail mdstudio-realtime`. The hub logs a socket it could not write to or close, and an upgrade that arrives without who is asking; the app logs a failed publish and server errors. Free-plan limits: 200,000 log events a day, kept 3 days (paid: 7 days); traces are kept 7 days; from 1 December 2026 both move to Cloudflare Observability pricing. Logpush needs the paid plan; OpenTelemetry export to Grafana, Honeycomb or Axiom is set up in the dashboard and then named under `observability.traces.destinations` and `observability.logs.destinations`.

## Hosted database and storage

Create the databases once, then add their ids as repository **variables** (Settings → Secrets and
variables → Actions → Variables; the ids are not secret):

```bash
wrangler d1 create mdstudio           # variable D1_DATABASE_ID
wrangler d1 create mdstudio-preview   # variable D1_PREVIEW_DATABASE_ID, shared by every preview
```

The API token needs **D1: Edit**. The build binds the database as `DB` when the variable is set
(`infra/worker-config.ts`), and the preview and release workflows run
`wrangler d1 migrations apply` before deploying, so a schema change ships with the pull request that
makes it. Without the variables the Worker still deploys, and `/api/health` reports
`"database":"unavailable"`.

### Hosted images (R2): off on mdstudio.deityhub.com

Image hosting is built for **self-hosted** installs, where the person running the server owns the storage
and the bill (in Docker it is on by default and lives on the volume). **The official site does not enable
it, on purpose**: sign-up is open, so anyone could create accounts to fill the R2 free allowance, and a
hot-linked image served through the Worker could use the free plan's 100,000 daily requests and take the
whole site down. Without a bucket the Worker deploys as usual, the upload controls stay hidden and
`/api/auth/me` reports `"images": false`. On the hosted site, local images stay in the draft, and a plain
export warns that they only exist there.

A fork that wants hosting on Cloudflare creates a bucket per tier and sets repository **variables** (not
secrets); enabling R2 asks for a payment method even though the free allowance is 10 GB:

```bash
wrangler r2 bucket create my-assets            # variable R2_BUCKET
wrangler r2 bucket create my-preview-assets    # variable R2_PREVIEW_BUCKET, shared by every preview
```

The API token then needs **Workers R2 Storage: Edit**, and the build binds the bucket as `IMAGES` when
`R2_BUCKET` is set (`infra/worker-config.ts`; Nitro already uses `ASSETS` for the static files). Before
doing this on a public site, add email verification, sign-up throttling and a global storage cap. Each
account may keep 10 images and 10 MB by default (`MAX_ASSETS`, `MAX_ASSET_BYTES`; per account limits can override them).
Image links contain the address of the site that hosted them, so a draft written on a PR preview links to
that preview, which disappears when the pull request closes.

## Google sign-in

In the Google Cloud console, create an OAuth client (type "Web application") with the authorized
redirect URI `https://mdstudio.deityhub.com/api/auth/google/callback` and an OAuth consent screen
with the `openid`, `email` and `profile` scopes (publish it, or only test users can sign in). Store its
credentials as repository secrets: `gh secret set GOOGLE_CLIENT_ID` and
`gh secret set GOOGLE_CLIENT_SECRET`. The release workflow sets them on the Worker under the same names.
Previews do not offer Google sign-in (their addresses change); for local development create a second
client with `http://localhost:8080/api/auth/google/callback` and export the two values before `bun run dev`.

## GitHub sign-in

Create an OAuth app (GitHub → Settings → Developer settings → OAuth Apps) with the homepage
`https://mdstudio.deityhub.com` and the callback URL
`https://mdstudio.deityhub.com/api/auth/github/callback`, then store its credentials as repository
secrets: `gh secret set GH_OAUTH_CLIENT_ID` and `gh secret set GH_OAUTH_CLIENT_SECRET` (GitHub
reserves the `GITHUB_` prefix for secret names, so the workflow maps them). The release workflow
sets them on the Worker as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. An OAuth app has one
callback URL, so previews do not offer GitHub sign-in; password sign-in works everywhere. For local
development use a second OAuth app with `http://localhost:8080/api/auth/github/callback` and export the
two values in your shell before `bun run dev`.

Publishing to GitHub (a writer connecting their own account) reuses the same OAuth app and callback
URL, and needs one more secret: a random key that seals the stored GitHub tokens. Create it once and
store it without printing it: `openssl rand -base64 32 | gh secret set GH_TOKEN_KEY`. The release
workflow sets it on the Worker as `GH_TOKEN_KEY`. Keep it stable: a new key makes saved tokens
unreadable, and writers then connect again. Without it, publishing is simply not offered.

## Admins and account limits

Limits and most of the server's behaviour are managed in the admin dashboard at `/admin`, which needs no secret
or setting. The first account ever created is the admin; the release migration also makes the oldest existing
account the admin. To make another account an admin, or to take it away, run SQL in the D1 dashboard:
`UPDATE users SET role = 'admin' WHERE email = '...';` (`'user'` removes it). The environment variables such as
`MAX_CLOUD_DOCS` stay as server-wide defaults (see "Account limits" in `docs/SYSTEM_SPEC.md`).

## Sign-up protection

mdstudio.deityhub.com protects the cloud from throwaway accounts with four things. The limits need nothing
from you; the email and the CAPTCHA each switch on when their secrets exist, and the release workflow sends
only the ones that are set.

- **Email confirmation (Resend, Mailtrap, or more).** Mail goes out through any provider that has its key
  set, and each free tier has its own daily and monthly allowance, so the server keeps count and picks the
  provider with the most room left. When one fails or is full it tries the next, and a failing provider
  is left alone for five minutes. Set `MAIL_FROM` (the same sender for all, e.g. `mdstudio <noreply@deityhub.com>`)
  and a key for each provider you use, after adding your domain's DNS records (SPF and DKIM) at that provider:
  ```bash
  gh secret set MAIL_FROM
  gh secret set RESEND_API_KEY        # Resend: free 100 a day, 3,000 a month
  gh secret set MAILTRAP_API_TOKEN    # Mailtrap Email Sending: free 150 a day, 4,000 a month
  ```
  Until `MAIL_FROM` and at least one key are set the server sends no mail, every address counts as
  confirmed, and nothing is blocked. Once they are, an account must click an emailed link before it can store
  drafts in the cloud (GitHub and Google sign-in count as confirmed). The link is sent the first time the account tries
  the cloud, not at sign-up, so people who only write locally never use up the free sending allowance.
  Writing, previewing and exporting never need it. `MAIL_PROVIDERS=mailtrap,resend` limits and orders the
  providers, and `MAIL_<ID>_DAILY` / `MAIL_<ID>_MONTHLY` (for example `MAIL_RESEND_DAILY=50`) change the
  limits the server assumes, for when a plan changes. To add another provider, see `src/server/mail/providers.ts`.
- **Sign-up CAPTCHA (Cloudflare Turnstile).** Create a Turnstile widget (Cloudflare dashboard → Turnstile; free)
  for `mdstudio.deityhub.com`, then `gh secret set TURNSTILE_SITE_KEY` and `gh secret set TURNSTILE_SECRET`.
  Without them sign-up has no CAPTCHA.
- **Limits** (always on; each changeable with an environment variable): 5 sign-ups an hour per address
  (`SIGNUP_LIMIT`), 10 failed sign-ins per 15 minutes per email and per address (`LOGIN_FAIL_LIMIT`), 3
  confirmation emails an hour per account (`VERIFY_EMAIL_LIMIT`), 5 password reset requests an hour per address
  (`FORGOT_LIMIT`) and 3 per inbox (`FORGOT_EMAIL_LIMIT`), and 10 reset attempts an hour per address
  (`RESET_LIMIT`). The address is Cloudflare's
  `cf-connecting-ip`.
- **One inbox, one account.** `test+shop@gmail.com` and `t.e.s.t@gmail.com` are the same account as
  `test@gmail.com` (a `+tag` is dropped everywhere, dots are ignored for Gmail, `googlemail.com` is `gmail.com`).

Pull request previews send no mail, so confirmation is off there, like GitHub and Google sign-in.
