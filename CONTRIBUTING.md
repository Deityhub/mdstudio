# Contributing

Thanks for helping. Read `docs/SYSTEM_SPEC.md` and `AGENTS.md` first: the invariants there (raw
Markdown is the source of truth, the preview matches other platforms, no Node stdlib in client code)
are not negotiable.

## Setup

```bash
bun install
bun run dev        # http://localhost:8080
```

### Trying accounts against the shared preview database

`bun run dev` has no database. To test sign-in or sync against real remote data, run
`wrangler login` once, then `bun run dev:remote`: it builds the app and serves it on
`http://localhost:8080` with its D1 binding pointed at the shared **preview** database (never
production). Add `--migrate` to apply pending migrations to that database first. There is no hot
reload; stop it, change code and run it again. The preview database id comes from the
`D1_PREVIEW_DATABASE_ID` repository variable (`gh` must be logged in) or the environment variable
of the same name. In CI or any non-interactive shell, set `CLOUDFLARE_API_TOKEN` instead of logging
in.

## Branches and pull requests

- `main` is production, `dev` is development. Branch from `dev` and open the PR into `dev`.
- One unit of work per branch: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`,
  `chore:`…). The changelog and the release version are generated from them.

## Before you push

Write the test first (`src/lib/**/*.test.ts`, plus a Playwright spec in `e2e/` where behavior needs a real browser; run `bunx playwright install chromium` once), then:

```bash
bun run lint
bun run typecheck
bun run test
bun run e2e         # builds the self-hosted output and runs Playwright
bun run licenses   # only needed after changing dependencies
```

If you changed how the UI looks, also run `bun run screenshots` (it rebuilds the app and rewrites `docs/ui-screenshots/`), look at the images it changes, and update `README.md` and `docs/UI_SPEC.md` where they describe that part of the UI.

## Dependencies

Prefer a few lines in this project over a new package. A new dependency must pass `bun run licenses`;
anything outside the permissive set needs a reviewed exception (see `THIRD_PARTY_NOTICES.md`).

Every pull request into `dev` gets a live preview deployment (the URL is posted as a comment). Maintainers: see `docs/RELEASING.md` for how releases and previews work.

By contributing you agree your work is released under the MIT license.
