# Guidelines for AI Agents and Contributors

This document defines the engineering guidelines, architecture invariants, and coding conventions for **mdstudio**, an open-source, local-first Markdown writing environment and portability linter. All AI agents and human contributors must comply with these rules.

mdstudio is built for writers, developers, technical bloggers, and documentation teams:

- **Local-first and resilient:** Documents are saved instantly to browser IndexedDB. Writing, previewing, checking and exporting need no network once the page has loaded.
- **Portability is the primary invariant:** The raw Markdown is the single source of truth. The preview must render exactly what external platforms (GitHub, dev.to, Obsidian, CommonMark engines) render.
- **Zero cost, open source:** Designed to scale on Cloudflare's free tiers at $0/month, while anyone can self-host with a single `docker compose up`.

---

## 1. Reading Order

Before proposing or making changes, read:

1. `docs/SYSTEM_SPEC.md`: the master source of truth (product, architecture, schema, decisions). The end-to-end use cases are in `docs/PRODUCT_SPEC.md`.
2. This file: the non-negotiable invariants.
3. `roadmap.md`: milestones and pending work.
4. As needed: `docs/UI_SPEC.md` and `docs/DESIGN_SYSTEM.md` (screens and tokens), `infra/README.md` (backend blueprints), `docs/RELEASING.md` (releases and secrets).

---

## 2. Core Architecture Invariants

1. **The Markdown text is the product:** Never introduce transforms to the live preview that the exported Markdown lacks (no auto-converting single newlines to `<br>`, no smart typography or curly quotes, no non-standard markup transformations). The preview must strictly reflect CommonMark + GFM.
2. **Unified AST pipeline:** All Markdown parsing, HTML rendering, AST linting, front matter extraction, and export transforms live exclusively in `src/lib/markdown/markdown.ts`. Do not introduce secondary Markdown parsers (like `marked` or `markdown-it`).
   - Portability checks inspect the AST and raw lines to flag non-portable syntax: raw HTML, base64 and local images, local links, wiki-links, math, Mermaid, trailing-space breaks and more. Every issue must be clickable and lead to where it was found.
   - Target profiles: **Strict CommonMark**, **GitHub Flavored Markdown**, **dev.to**, **Obsidian**. `FEATURE_SUPPORT` is the single source of truth for what each profile supports, shared by the checker and the toolbar warnings.
3. **HTML sanitization:** All rendered Markdown HTML must pass through `rehype-sanitize` (with our configured schema, which allows data URIs for self-contained exports) before DOM mounting. Three outputs are produced after sanitizing, by design: KaTeX math (loaded on demand, `trust: false`), Mermaid SVG (`securityLevel: "strict"`), and the alert and highlight transforms; none accepts HTML from the document. Never use `dangerouslySetInnerHTML` with anything but the sanitized string. The preview mounts it through `patchHtml` (`src/lib/markdown/preview-dom.ts`), which replaces only the blocks that changed.
4. **Local-first persistence:** Drafts are stored only through the `documentStore` interface in `src/lib/storage/documentStore.ts`, backed by raw IndexedDB (database `mdstudio-db`, store `mdstudio-store`; no wrapper library). Network or backend connectivity must stay optional, so local storage can later sync with D1/SQLite without changing callers.
5. **Client-only CodeMirror:** CodeMirror 6 touches browser DOM APIs and must only render behind client-only boundaries (`ClientOnly` / dynamic import) to keep SSR clean with TanStack Start. The editor keeps two-way scroll-ratio sync with the preview.
6. **BYOK AI isolation:** AI assistants connect directly from the user's browser to the configured provider (OpenAI, Anthropic, Google Gemini, or OpenAI-compatible gateways such as Ollama, OpenRouter, Groq). API keys live in session memory only (React state or `sessionStorage`), are never persisted to `localStorage`, databases or disk, and are never routed through an app server. AI suggestions require explicit user confirmation before they touch a draft.
7. **Single source of truth:** `docs/SYSTEM_SPEC.md` is authoritative for architecture, data models and API surfaces. If a change alters a pattern or the schema, update the spec in the same change.
8. **Markdown stays canonical:** The source and split views edit the same text; nothing may rewrite the document except through explicit user edits, and nothing may emit proprietary syntax. Math and Mermaid render only in profiles whose target platform supports them.
9. **Universal SQLite backend:** Backend blueprints in `infra/` share one Drizzle SQLite schema between Cloudflare D1 and self-hosted `better-sqlite3`. Never write database-engine-specific SQL.
10. **No Supabase.** The project deliberately avoids hosted Postgres and vendor lock-in: Cloudflare's free tiers (Workers, D1, R2) cover the hosted tier at $0, the same SQLite schema and queries run in the self-hosted container, and writers own their data. Do not reintroduce Supabase or any equivalent hosted database.

---

## 3. Backend and Database Strategy

All backend code lives in or is scaffolded via `infra/` (see `infra/README.md`):

| Component            | Hosted Cloudflare tier ($0/mo)               | Self-hosted Docker container               |
| :------------------- | :------------------------------------------- | :----------------------------------------- |
| **Runtime**          | Cloudflare Workers (`workerd`)               | Node.js 22 LTS Alpine                      |
| **Database**         | Cloudflare D1 (serverless SQLite)            | Embedded SQLite (`/data/studio.db`)        |
| **ORM / migrations** | Drizzle ORM (`drizzle-orm/d1`)               | Drizzle ORM (`drizzle-orm/better-sqlite3`) |
| **Asset storage**    | Cloudflare R2 (S3-compatible, no egress fee) | Local volume (`/data/uploads/`)            |
| **Schema**           | `infra/db/schema.ts` (shared)                | `infra/db/schema.ts` (shared)              |

---

## 4. Responsive UI and Design Rules

1. **Mobile-first workspace:**
   - Below `768px` the studio uses a single-pane layout with an explicit toggle between **Editor** and **Preview**. From `768px` up it is a side-by-side split with synchronized scrolling and collapsible sidebars.
   - Auxiliary panels (Checks, Outline, Front Matter, Library) render in modal drawers or bottom sheets on mobile and in the collapsible side panel on desktop.
   - Panel components are shared between desktop and drawer views to prevent state divergence.
2. **Semantic design tokens:**
   - The theme is a warm paper editorial palette defined as CSS tokens in `src/styles.css`. All colors use semantic utilities (`bg-background`, `text-foreground`, `border-border`, ...).
   - Never hardcode hex, RGB or utility colors (`bg-[#1a1a2e]`, `text-white`, `bg-black`) in JSX.
   - Light and dark modes must both keep accessible contrast (WCAG AA).

---

## 5. Coding Conventions

- **Framework:** TanStack Start v1 with React 19 and Vite 8.
- **Routing:** TanStack Router (`src/routes/*`). Never install or use `react-router-dom`. New routes update `src/routeTree.gen.ts` automatically.
- **UI components:** Radix UI primitives via shadcn/ui.
- **Notifications:** Toasts use `sonner`.
- **Validation:** All external data, front matter and API boundaries are validated with `zod`.
- **`src/lib` layout:** code is grouped by concern, and new modules go in the matching folder: `markdown/` (the unified pipeline, profiles, math, diagrams, export, preview patching), `editor/` (editing commands, block scanning, tables, images, line diff), `ai/` (BYOK provider and writing helpers), `storage/` (IndexedDB persistence and version history), `site/` (SEO, guides), `server/` (CSP, error capture and page), `ui/` (theme, layout), `checker/` (rule settings, publication standards, the writer's own rules), `pwa/` (service worker registration, install prompt, online status), `account/` (browser side of sign-in), `sync/` (the account sync engine; `protocol.ts` is the contract shared with `src/server/sync`). Server code lives in `src/server/` (database, auth, mail, sync, assets). Tests sit next to the file they cover. Import with the full path, e.g. `@/lib/markdown/markdown`.
- **Worker size:** Browser-only heavy libraries (Mermaid, KaTeX and the like) are loaded with a dynamic `import()` behind `import.meta.env.SSR`, so the server build drops them. `bun run bundle:check` (run in CI) fails if the Worker passes its size budget or if one of those libraries leaks into it.
- **Compatibility:** Do not use Node.js standard library modules (`fs`, `path`, `crypto`, ...) in client-side code; client code must run in all browsers and on Cloudflare Workers. Node APIs are fine in `scripts/` and the Node-only `infra/` drivers.
- **Types:** Prefer clean types and deterministic state machines. The TypeScript config is strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).
- **Tailwind classes:** write them in the form Tailwind recommends (`size-4` not `h-4 w-4`, `shrink-0` not `flex-shrink-0`, `data-disabled:` not `data-[disabled]:`, `wrap-break-word` not `break-words`). `bun run tailwind:check` lists anything that is not, CI runs it, and `bun run tailwind:fix` rewrites it using Tailwind's own rules.
- **Accessibility:** Build accessible UX by default (Radix primitives, roving focus on toolbars, labelled controls).

---

## 6. Workflow

### Commands

```bash
bun install        # install dependencies
bun run dev        # Vite + TanStack Start on http://localhost:8080
bun run lint       # ESLint
bun run typecheck  # tsc --noEmit
bun run test       # Vitest (markdown, portability, editing, AI provider, ...)
bun run e2e        # builds the self-hosted output and runs Playwright
bun run build      # production build (Cloudflare Workers preset)
bun run licenses   # dependency license audit
```

### Rules for each unit of work

1. **Tests first.** Write automated tests before the implementation: unit tests in `src/lib/**/*.test.ts` (extend `src/lib/markdown/markdown.test.ts` when touching Markdown transforms or lint rules) and Playwright specs in `e2e/` where behavior needs a real browser.
2. **One branch per unit.** Branch off `dev`, keep commits focused, and open the pull request into `dev`. `main` is production and only receives release PRs. Leave changes uncommitted until the maintainer has reviewed them.
3. **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `ci:` ...); the changelog and version are generated from them.
4. **No AI attribution.** Do not mention AI assistants in commit messages, pull request descriptions or code, and add no co-author lines.
5. **Prefer in-project code over new packages**, and run `bun run licenses` after changing dependencies.
