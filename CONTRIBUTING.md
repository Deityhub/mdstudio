# Contributing

Thanks for helping. Read `docs/SYSTEM_SPEC.md` and `AGENTS.md` first: the invariants there (raw
Markdown is the source of truth, the preview matches other platforms, no Node stdlib in client code)
are not negotiable.

## Setup

```bash
bun install
bun run dev        # http://localhost:8080
```

## Branches and pull requests

- `main` is production, `dev` is development. Branch from `dev` and open the PR into `dev`.
- One unit of work per branch: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`,
  `chore:`…). The changelog and the release version are generated from them.

## Before you push

Write the test first (`src/lib/*.test.ts`, with e2e coverage where behavior needs a browser), then:

```bash
bun run lint
bun run test
bun run build
bun run licenses   # only needed after changing dependencies
```

## Dependencies

Prefer a few lines in this project over a new package. A new dependency must pass `bun run licenses`;
anything outside the permissive set needs a reviewed exception (see `THIRD_PARTY_NOTICES.md`).

By contributing you agree your work is released under the MIT license.
