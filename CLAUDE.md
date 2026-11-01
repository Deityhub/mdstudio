# CLAUDE.md — Developer & AI Instructions for Markdown Studio

You are continuing the design, architecture, and implementation of **Markdown Studio**, an open-source, local-first Markdown writing environment, portability linter, and lightweight CMS created by **Chizoba Jude Ojini** (Senior Software Engineer).

---

## 1. Project Overview & Guiding Philosophy

Markdown Studio (mdstudio) is built for writers, developers, technical bloggers, and documentation teams. 

- **Local-First & Resilient:** Documents are written and saved instantly to browser IndexedDB (`src/lib/documentStore.ts`). Writers can use the studio completely offline.
- **Portability as the Primary Invariant:** The raw Markdown text is the single source of truth. The preview must render **exactly** what external platforms (GitHub, Dev.to, Obsidian, CommonMark engines) render. Never add preview-only syntactic shortcuts (no synthetic hard breaks, no smart quotes, no non-standard markup transformations).
- **Zero Cost / Open Source Architecture:** Designed to scale to thousands of users at **$0/month** on Cloudflare, while allowing anyone to self-host with a single `docker compose up` command.

---

## 2. Essential Documents & Reading Order

Before proposing or making changes, read the documentation in this order:

1. `docs/SYSTEM_SPEC.md` — **Master Source of Truth**: full product vision, technical boundaries, UI specs, completed features, and the 18 end-to-end use cases.
2. `AGENTS.md` — Non-negotiable structural and architectural invariants.
3. `roadmap.md` — Phased implementation milestones and pending tasks.
4. Review the docs and setup proper infra and blueprints for Cloudflare workers + D1 + R2 and Docker + SQLite self-hosting

---

## 3. Critical Architecture Decision: NO SUPABASE

> ⚠️ **IMPORTANT INSTRUCTION FOR CLAUDE:**
> **We are NOT using Supabase in this project.** 
> Any leftover Supabase files or dependencies from early prototypes are deprecated and must be removed.

### Why No Supabase?
1. **Cost & Generosity:** For an open-source tool, Cloudflare's free tiers (Workers: 100k req/day, D1 SQLite: 5M reads/day, R2: 10GB storage with $0 egress fees) provide virtually unlimited scale at $0/month.
2. **True Portability:** Cloudflare D1 runs SQLite at the edge. A self-hosted Docker container also runs zero-dependency SQLite (`better-sqlite3`). By standardizing on SQLite via Drizzle ORM, 100% of the database schema and query logic is shared between the cloud deployment and self-hosters.
3. **No Vendor Lock-in:** Writers own their data without dependency on external hosted Postgres providers.

- [x] Delete `src/integrations/supabase/` entirely.
- [x] Delete root `supabase/` directory and `supabase/config.toml`.
- [x] Remove `@supabase/supabase-js` from `package.json`.
- [x] Clean up `src/start.ts`: remove `import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher"` and remove `attachSupabaseAuth` from `functionMiddleware`.
- [x] Clean up any stale Supabase error logging in `src/lib/lovable-error-reporting.ts`.

---

## 4. Backend & Database Strategy (Dual Target)

All backend code lives in or is scaffolded via `infra/`:

| Component | Target A: Hosted Cloudflare Tier ($0/mo) | Target B: Self-Hosted Docker Container |
| :--- | :--- | :--- |
| **Runtime** | Cloudflare Workers (`workerd`) | Node.js 22 LTS Alpine |
| **Database** | Cloudflare D1 (Serverless SQLite) | Embedded SQLite (`/data/studio.db`) |
| **ORM / Migrations** | Drizzle ORM (`drizzle-orm/d1`) | Drizzle ORM (`drizzle-orm/better-sqlite3`) |
| **Asset Storage** | Cloudflare R2 (S3-compatible, no egress fee) | Local volume mount (`/data/uploads/`) |
| **Schema Definition** | `infra/db/schema.ts` (shared SQLite dialect) | `infra/db/schema.ts` (shared SQLite dialect) |

---

## 5. Client & Core Architecture Rules

### 1. Markdown Engine (`src/lib/markdown.ts`)
- All Markdown processing lives here. Built on unified: `remark-parse` → `remark-gfm` → `remark-frontmatter` → `remark-rehype` → `rehype-sanitize` → `rehype-react`.
- Output HTML must **always** pass through `rehype-sanitize` with our configured schema (allowing data URIs for self-contained exports).
- Portability checks inspect AST and raw lines to flag non-portable syntax: unclosed raw HTML, embedded base64 data URIs, local file references, Obsidian wiki-links, math blocks, Mermaid syntax, and trailing spaces. Anything flagged should be clickable and lead directly to where it was found so it can be fixed.
- Target profiles supported: **Strict CommonMark**, **GitHub Flavored Markdown**, **Dev.to**, and **Obsidian**. We should also support LaTex

### 2. Editor (`src/components/studio/MarkdownEditor.tsx`)
- CodeMirror 6 with custom syntax highlighting tokens matching our warm design theme.
- **Browser-only:** CodeMirror must remain lazy-loaded behind `<ClientOnly>` to ensure clean SSR / SSG compatibility with TanStack Start.
- Two-way scroll ratio synchronization with the preview pane.

### 3. Local Storage (`src/lib/documentStore.ts`)
- Client persistence uses raw IndexedDB (no wrapper library). The database is `mdstudio-db` / store `mdstudio-store`.
- All document mutations go through the `documentStore` interface so local storage can seamlessly sync with D1/SQLite later.

### 4. Client-Side AI Engine (`src/lib/ai-provider.ts` & `AiWriter.tsx`)
- **Bring Your Own Key (BYOK):** Users provide their own keys for OpenAI, Anthropic, Google Gemini, or OpenAI-compatible gateways (e.g. Ollama, OpenRouter, Groq).
- Direct browser-to-provider streaming. No server proxies or backend token consumption.
- API keys are held **strictly in session memory** (`sessionStorage` or React state); they are never persisted to databases or local disks.
- Human-in-the-loop: AI suggestions for metadata or draft content require manual user confirmation before applying to drafts.

### 5. Responsive Layout & Design System
- **Mobile (< 768px):** Single-pane toggle (Editor vs Preview) with auxiliary tools (Checks, Front Matter, Outline, Library) rendered in sliding sheet drawers.
- **Desktop (≥ 768px):** Side-by-side split view with synchronized scrolling and collapsible utility sidebars.
- **Theme:** Warm paper editorial palette configured via CSS semantic tokens in `src/styles.css`. Never hardcode colors (`text-white`, `bg-black`, hex codes) directly in JSX; use semantic utility classes (`text-foreground`, `bg-background`, `border-border`, etc.).

---

## 6. How to Run, Test, and Verify

```bash
# 1. Install dependencies
bun install   # or npm install / pnpm install

# 2. Run local development server
bun run dev   # Starts Vite + TanStack Start on http://localhost:8080

# 3. Run unit & integration test suites
bun run test  # Runs Vitest (all markdown, portability, and AI provider tests)

# 4. Typecheck and verify build
bun run build

```

---

## 7. Development Guidelines for Claude

 1. Keep Commits Focused: When implementing features from roadmap.md, write automated tests first in src/lib/*.test.ts. In places where e2e test is needed, write that too
 2. Preserve Compatibility: Do not introduce Node.js standard library dependencies (fs, path, crypto) into client-side code; client code must run cleanly in all browsers and on Cloudflare Workers.
 3. Keep the User Persona in Mind: Chizoba is a Senior Software Engineer and Lead Frontend Engineer. Prioritize clean types, deterministic state machines, accessible UX (shadcn/Radix), and fast, portable rendering.
 4. For every unit of feature being implemented, create a branch off of dev, I review the code, then add the commits, and create PR to dev. Don't ever mention claude in any of it, and no co-author line anywhere.