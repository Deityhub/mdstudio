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
- A preview is a separate Worker, so it never touches production data. When milestone 3 adds D1 and
  R2, give previews their own bindings.

## Hosted database and storage

The hosted tier does not use D1 or R2 yet. When milestone 3 activates them, create the database and
bucket (`wrangler d1 create mdstudio`, `wrangler r2 bucket create mdstudio-assets`), then add the
bindings from `infra/wrangler.toml` to the `cloudflare.wrangler` block in `vite.config.ts`.
