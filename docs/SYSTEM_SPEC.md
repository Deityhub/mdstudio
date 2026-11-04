# mdstudio — System Specification (Source of Truth)

| Metadata       | Details                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Status         | Living document, v1.0 (2026-11-01)                                                                                                              |
| Author / Owner | Chizoba Jude Ojini                                                                                                                              |
| License model  | Open source (MIT); official hosted instance + self-host via Docker                                                                              |
| Change rule    | Any change to architecture, data model, flows, or invariants must update this document in the same pull request. ADRs (§14) record the reasons. |

---

## 1. Product Overview

**What it is:** A local-first Markdown writing studio and lightweight CMS for blog posts, documentation, and technical articles. The Markdown text is the source of truth: whatever a writer copies or downloads renders identically on GitHub, dev.to, Hashnode, Obsidian, static-site generators (Astro, Hugo, Next.js), and any standard CommonMark renderer.

**Who it is for:** Technical writers, developer bloggers, open-source documentation maintainers, students, and engineers who write on multiple platforms and want zero format lock-in.

**Core Jobs to be Done:**

1. **Write with fidelity:** Live preview that strictly matches production platforms.
2. **Bring content in seamlessly:** Import `.md`, drag-and-drop files, paste raw Markdown, or paste rich text (Google Docs, Notion, web pages) with automatic, clean HTML-to-Markdown conversion.
3. **Take content out anywhere:** Download `.md`, copy raw Markdown, generate self-contained `.md` (images embedded as base64 data URIs), copy rendered HTML, or export standalone `.html`.
4. **Know it's portable:** Real-time portability checker flags non-portable syntax (raw HTML, wiki-links, mermaid, math, local images) tailored to target profiles (Strict CommonMark, GitHub, dev.to, Obsidian).
5. **Smart assistance without lock-in:** BYOK (Bring Your Own Key) browser-direct AI for metadata suggestions (title, description, tags) and topic drafting.
6. **Optional cloud sync:** Hosted zero-egress Cloudflare deployment or self-hosted Docker container with SQLite.

### 1.1 Invariants (Rules Never to Break)

1. **Local-first:** Writing, previewing, linting, and exporting work 100% offline without requiring an account or network connection. The backend is strictly additive.
2. **Preview = Export:** Strict CommonMark + GFM. The preview must never apply transforms that the exported text lacks (no auto-`<br>` line breaks, no smart quotes).
3. **Sanitized Output:** Every rendered HTML tree passes through `rehype-sanitize` before DOM insertion to prevent XSS.
4. **Bring-Your-Own-Key AI:** Browser connects directly to AI providers via streaming HTTPS/SSE. Keys live in session memory only, are never sent to our backend, and have no proprietary platform dependencies.
5. **One Codebase, Two Deployments:** Cloudflare Workers + D1 + R2 (official hosted tier) and Docker Node + SQLite + disk volume (self-hosted) share 100% of the Drizzle schema, queries, and business logic. Only storage/driver adapters differ.
6. **Review Before Mutation:** AI generations or cloud sync operations must never silently overwrite or destroy a local draft.
7. **Responsive Parity:** Every workflow (editing, previewing, importing, exporting, linting, front matter editing, AI assistance) must be fully usable on mobile phones, tablets, and desktop displays.

8. **Markdown Is Canonical:** The source and split views edit the same text. Nothing may rewrite the document except through explicit user edits, and nothing emits proprietary syntax.

---

## 2. Feature Scope & Status

| Area                        | Feature                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Status                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Editor**                  | CodeMirror 6, syntax highlighting, formatting toolbar, keyboard shortcuts (Mod-B/I/K), search, line numbers                                                                                                                                                                                                                                                                                                                                                                | Done (M1)                                                                 |
| **Preview**                 | Live synchronized preview, GitHub-like prose, syntax-highlighted code blocks, two-way scroll ratio sync                                                                                                                                                                                                                                                                                                                                                                    | Done (M1)                                                                 |
| **Workspace**               | Split view, editor-only, preview-only, focus mode, responsive mobile drawers & bottom sheets                                                                                                                                                                                                                                                                                                                                                                               | Done (M1)                                                                 |
| **Import**                  | File picker (`.md`, `.markdown`, `.txt`), drag-and-drop, paste raw text, paste rich HTML with automatic Markdown conversion                                                                                                                                                                                                                                                                                                                                                | Done (M1)                                                                 |
| **Export**                  | Standard `.md`, clipboard copy, self-contained `.md` (base64 compressed images), copy HTML, standalone `.html` with embedded styles, optional text normalization                                                                                                                                                                                                                                                                                                           | Done (M1)                                                                 |
| **Portability Checks**      | AST & line linter with profiles: Strict CommonMark, GitHub, dev.to, Obsidian                                                                                                                                                                                                                                                                                                                                                                                               | Done (M1)                                                                 |
| **Metadata**                | YAML front matter visual form: title, slug, date, cover image URL, description, tags. Canonical URL (`canonical_url`, validated as http(s)) and a draft toggle (`draft: true`) are in the form                                                                                                                                                                                                                                                                             | Done                                                                      |
| **Draft Library**           | Local-first IndexedDB storage, instant autosave (400ms debounce, flushed on draft switch, tab hide and page close, with a visible saved/saving/error status), create, duplicate, delete. Rename (a library label stored beside the text, blank to follow the title) is done                                                                                                                                                                                                | Done                                                                      |
| **Writing Aids**            | Word count, character count, estimated reading time, live heading outline/TOC with click-to-line                                                                                                                                                                                                                                                                                                                                                                           | Done (M1)                                                                 |
| **AI Writing**              | BYOK direct browser streaming (OpenAI, Anthropic, Google Gemini, OpenAI-compatible); title/description/tag suggestions; draft topic into new document                                                                                                                                                                                                                                                                                                                      | Done (M1)                                                                 |
| **PWA & Offline**           | Installable manifest (standalone, maskable icons, a New draft shortcut) and an offline service worker (`public/sw.js`, see PWA and offline below). No app icon badge                                                                                                                                                                                                                                                                                                       | Done                                                                      |
| **Advanced Library**        | Full-text draft search, tag filters (from front matter `tags`), one-level folders (a library label, created, dragged into and deleted from the sidebar; names live under the `meta:folders` key so an empty folder persists), bulk import and export as ZIP (see Import and export below)                                                                                                                                                                                  | Done                                                                      |
| **Local History**           | Automatic snapshots of each draft in IndexedDB (at most one every 5 minutes, up to 50 per draft, automatic ones dropped first), a manual "Save a version now", a side-by-side line diff against the current text, and one-click restore that first keeps the text it replaces                                                                                                                                                                                              | Done                                                                      |
| **Accounts**                | Email + password / magic link, GitHub OAuth                                                                                                                                                                                                                                                                                                                                                                                                                                | Milestone 3                                                               |
| **Cloud Sync**              | Multi-device synchronization with versioned last-write-wins and automatic conflict forks                                                                                                                                                                                                                                                                                                                                                                                   | Milestone 3                                                               |
| **Hosted Assets**           | Images added to cloud drafts upload to Cloudflare R2 (or the Docker volume) and are linked by public address, so the Markdown works on other platforms. Shrunk in the browser first; 10 images and 10 MB per account (`MAX_ASSETS`, `MAX_ASSET_BYTES`), 1 MB each; managed and deleted from the account menu                                                                                                                                                               | Done for self-hosting; off on the official site (see `docs/RELEASING.md`) |
| **Server History**          | Immutable server revision log per document                                                                                                                                                                                                                                                                                                                                                                                                                                 | Milestone 3                                                               |
| **Share Links**             | Read-only public web view (`/s/:slug`) of a specific document version with revoke and expiration options                                                                                                                                                                                                                                                                                                                                                                   | Milestone 4                                                               |
| **Publishing Integrations** | Direct push to GitHub repositories via personal access token, dev.to API, Hashnode API                                                                                                                                                                                                                                                                                                                                                                                     | Milestone 4                                                               |
| **Collaboration**           | Optional real-time collaborative editing via Yjs / CRDTs                                                                                                                                                                                                                                                                                                                                                                                                                   | Post-v1                                                                   |
| **Math & Mermaid**          | KaTeX math (`$x$`, `$$…$$`, ` ```math `) and Mermaid diagrams, rendered only in profiles whose target platform renders them (GitHub, Obsidian) and left as source or code elsewhere. KaTeX runs after sanitizing with `trust: false` and loads on demand; Mermaid runs with `securityLevel: "strict"`, loads on demand, and shows invalid diagrams as an error under their code. Exports embed rendered math (with the KaTeX stylesheet and fonts) and inline SVG diagrams | Done                                                                      |
| **Complete Toolbar**        | Formatting toolbar covering every Markdown/GFM construct and each profile's extensions (headings 1-6, emphasis, code, links, images, quotes, lists, task lists, tables, rules, footnotes, math, diagrams, alerts, HTML extras), grouped, keyboard-accessible (roving focus, Alt+F10) and profile-aware (warnings driven by `FEATURE_SUPPORT`). Edit logic is pure functions in `src/lib/editing*.ts` and `tables.ts`                                                       | Done. Rendering math and Mermaid in the preview is the next feature       |

---

## 3. System Architecture

```text
┌──────────────────────────── Browser Client (React 19 SPA / TanStack Start) ────────────────────────────┐
│  Routes: /  /editor  /editor/$docId  (+ /login /settings /s/$slug in M3/M4)                            │
│                                                                                                         │
│  CodeMirror 6 Editor ⇄ Studio State ⇄ src/lib/markdown/markdown.ts (unified pipeline) → Sanitized Preview       │
│         │                     │                              └→ Checks, Outline, Stats, Clean Export    │
│         │                     ▼                                                                         │
│         │             documentStore (IndexedDB)  ←→  SyncEngine (M3, optional cloud sync)               │
│         ▼                                                 │                                             │
│   AiWriter → ai-provider.ts ──HTTPS (SSE)──► OpenAI / Anthropic / Gemini / Compatible Services         │
└───────────────────────────────────────────────────────────┼─────────────────────────────────────────────┘
                                                            │ HTTPS JSON (HTTP-only session cookie)
                        ┌───────────────────────────────────┴────────────────────────┐
                        │      TanStack Start Server (Server Functions & /api)        │
                        │   Auth · Sync · Asset Proxy · Revisions · Share · Webhooks │
                        │             │ Drizzle ORM           │ AssetStorage         │
                        └─────────────┼───────────────────────┼──────────────────────┘
               Hosted (Cloudflare)    │                       │         Self-Hosted (Docker)
          Cloudflare Workers + D1 ────┘                       └──── R2   |  Node + SQLite file + Disk
```

### 3.1 Technology Stack

| Layer                 | Technology                                                                                                                                                                                                                                                                                                                                      | Justification                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Framework**         | TanStack Start v1, React 19, Vite 8                                                                                                                                                                                                                                                                                                             | Modern full-stack SSR and server functions; compiles to Edge Workers or Node runtime.                                 |
| **Styling**           | Tailwind CSS v4, shadcn/ui                                                                                                                                                                                                                                                                                                                      | Native CSS token theming (`src/styles.css`), dark mode support, accessible Radix UI primitives.                       |
| **Editor**            | CodeMirror 6 (client-only dynamic import)                                                                                                                                                                                                                                                                                                       | Fast, modular, accessible on mobile keyboards, extensible language facets.                                            |
| **Markdown Pipeline** | Unified ecosystem (`remark-parse`, `remark-gfm`, `remark-frontmatter`, `remark-rehype`, `rehype-sanitize`, `rehype-highlight`, `rehype-stringify`; `rehype-parse` + `rehype-remark` + `remark-stringify` for HTML→MD). The preview is a sanitized HTML string. `remark-math` + `rehype-katex` (math), `mermaid` (diagrams, in the browser only) | Strict AST-compliant parsing, linting, conversion, and sanitization sharing a single syntax tree.                     |
| **Client Storage**    | IndexedDB (raw, no wrapper library)                                                                                                                                                                                                                                                                                                             | Reliable client-side persistence for large drafts and base64 image blobs.                                             |
| **Database ORM**      | Drizzle ORM (SQLite dialect)                                                                                                                                                                                                                                                                                                                    | Identical type-safe SQL queries run on Cloudflare D1 and `better-sqlite3`.                                            |
| **Object Storage**    | Cloudflare R2 / Local Filesystem                                                                                                                                                                                                                                                                                                                | S3-compatible, zero egress costs on Cloudflare; flat directory structure on Docker.                                   |
| **Testing**           | Vitest + Testing Library (unit/integration). Playwright e2e runs in CI against the production build (Chromium)                                                                                                                                                                                                                                  | Fast AST unit tests now; end-to-end browser automation for flows that need a real browser (IndexedDB, import/export). |

### 3.2 Repository Structure

```text
├── src/
│   ├── routes/                # TanStack Start file routes (/, /editor, /editor/$docId)
│   ├── start.ts               # Request middleware: security headers + CSP nonce, error page, CSRF
│   ├── components/
│   │   ├── studio/            # Studio, MarkdownEditor, AiWriter, panels
│   │   └── ui/                # Radix / shadcn UI primitives (button, dialog, tabs, etc.)
│   ├── lib/
│   │   ├── markdown.ts        # Unified parsing, rendering, checks, stats, exports
│   │   ├── documentStore.ts   # IndexedDB document repository
│   │   ├── csp.ts             # Nonce + Content-Security-Policy builder
│   │   ├── math.ts            # Lazy KaTeX loader, currency guard, export CSS helpers
│   │   ├── diagrams.ts        # Lazy Mermaid renderer, preview hydration, export inlining
│   │   ├── export.ts          # Async HTML export (math + diagrams + standalone document)
│   │   ├── images.ts          # Canvas resizing and base64 compression
│   │   ├── ai-provider.ts     # BYOK direct browser HTTP/SSE client
│   │   └── ai-writing.ts      # AI prompts and metadata response schemas
│   └── styles.css             # Tailwind v4 theme tokens, prose typography, CodeMirror overrides
├── public/fonts/              # Self-hosted woff2 fonts + OFL licenses
├── public/katex/              # Vendored KaTeX stylesheet, fonts and licenses (bun run vendor:katex)
├── scripts/vendor-katex.mjs   # Copies KaTeX assets out of node_modules
├── infra/                     # Shared backend blueprints (scaffolded in the infra PR, activated in M3)
│   ├── db/
│   │   ├── schema.ts          # Drizzle SQLite schema (users, sessions, documents, revisions, assets)
│   │   └── client.ts          # Runtime factory (Cloudflare D1 vs better-sqlite3)
│   ├── storage/
│   │   └── index.ts           # Storage abstraction (Cloudflare R2 vs local filesystem)
│   ├── migrations/            # Versioned SQL migration files
│   ├── Dockerfile             # Multi-stage production container build
│   ├── docker-compose.yml     # Self-hosted single-command container stack
│   └── wrangler.toml          # Cloudflare Workers, D1, and R2 deployment configuration
└── docs/
    └── SYSTEM_SPEC.md         # Master specification and source of truth
```

---

## 4. Core Client Modules

| Module                                              | Core Responsibilities                                                                                                                                                                                                                                                                                                                                                             | Key Functions / Interfaces                                                                                                                                                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/markdown/markdown.ts`                      | The single pipeline for parsing, rendering, linting, and export transforms. Also owns `FEATURE_SUPPORT` (where each feature renders), shared with the toolbar.                                                                                                                                                                                                                    | `renderMarkdown()`, `checkPortability(text, profile)`, `getOutline(text)`, `getStats(text)`, `splitFrontMatter()`, `joinFrontMatter()`, `normalizeMarkdown()`, `embedImages()`, `htmlToMarkdown()`, `standaloneHtml()`, `finalizeText()` |
| `src/lib/storage/documentStore.ts`                  | Client persistence layer on raw IndexedDB (database `mdstudio-db`).                                                                                                                                                                                                                                                                                                               | `list()`, `get(id)`, `save(doc)`, `create(partial)`, `remove(id)`, `folders.list/add/remove`, `renameFolder(from, to)`; `createDocumentStore(kv)` for tests; `MdDocument` model                                                          |
| `src/lib/storage/history.ts`                        | Local version history on the same key-value backend (`rev:<docId>:<time>:<id>` keys).                                                                                                                                                                                                                                                                                             | `createHistoryStore(kv)`, `historyStore`, `maybeSnapshot`, `save`, `list`, `remove`, `clear`                                                                                                                                             |
| `src/lib/storage/library.ts`                        | Pure library logic: front matter tags, search with snippets, tag filtering, folder grouping (empty folders included).                                                                                                                                                                                                                                                             | `docTags`, `allTags`, `filterDocs`, `groupByFolder`, `normalizeFolder`, `resolveFolder`, `searchSnippet`                                                                                                                                 |
| `src/lib/checker/config.ts`                         | Checker rule settings: the zod schema, defaults, the list of built-in rule ids, JSON export and import, and `applyOverrides` for a draft's `checks:` front matter.                                                                                                                                                                                                                | `CheckConfig`, `DEFAULT_CONFIG`, `parseConfig`, `exportConfig`, `importConfig`, `applyOverrides`                                                                                                                                         |
| `src/lib/checker/{standards,custom,run,storage}.ts` | The publication standards, the writer's own pattern rules (with limits and a guard against runaway patterns), the runner that merges all issues for the Checks panel, and the localStorage load and save.                                                                                                                                                                         | `runStandards`, `runCustomRules`, `validateCustomRule`, `runChecks`, `loadConfig`, `saveConfig`                                                                                                                                          |
| `src/lib/storage/zip.ts`                            | Dependency-free ZIP reader and writer (deflate through `CompressionStream`; no encryption or ZIP64). Limits: 5,000 files, 256 MB unpacked.                                                                                                                                                                                                                                        | `createZip(entries)`, `readZip(bytes, limits?)`, `ZIP_LIMITS`                                                                                                                                                                            |
| `src/lib/storage/archive.ts`                        | Drafts to and from archive files: `Folder/title.md`, images under `images/`, library folders as directories.                                                                                                                                                                                                                                                                      | `buildArchive(docs)`, `parseArchive(files)`, `mapImageSrc`, `dataUriToBytes`                                                                                                                                                             |
| `src/lib/editor/diff.ts`                            | Dependency-free line diff (longest common subsequence, large inputs shown whole) producing side-by-side rows.                                                                                                                                                                                                                                                                     | `diffLines(a, b)`, `diffStats(rows)`                                                                                                                                                                                                     |
| `src/lib/editor/images.ts`                          | Client-side image handling, resizing, and compression.                                                                                                                                                                                                                                                                                                                            | `compressImage(file, maxDimension, quality)`, `safeImageName()`, `kb()`                                                                                                                                                                  |
| `src/lib/ai/provider.ts`                            | Multi-provider HTTP request builder and streaming SSE parser.                                                                                                                                                                                                                                                                                                                     | `buildProviderRequest(connection, request)`, `generateWithProvider(connection, request, signal, onEvent)`                                                                                                                                |
| `src/lib/editor/editing.ts`                         | Pure Markdown editing commands: toggle marks, headings, quote/list/task toggles, list nesting, cursor context.                                                                                                                                                                                                                                                                    | `runCommand(snapshot, command)`, `getContext(snapshot)`, `applyEdit(text, edit)`, `isListLine(snapshot)`                                                                                                                                 |
| `src/lib/editor/editing-insert.ts`                  | Pure insertion commands: links (with detection of the link under the caret), images (alt required), footnotes, rules, code blocks, alerts, math blocks, Mermaid starters, HTML tags and details.                                                                                                                                                                                  | `insertLink`, `findLinkAt`, `insertImage`, `insertFootnote`, `insertRule`, `codeBlock`, `insertBlock`                                                                                                                                    |
| `src/lib/editor/blocks.ts`                          | Structural scanning shared by commands and cursor context: fenced code, GFM tables, alert quotes, whole lines.                                                                                                                                                                                                                                                                    | `fenceAt`, `tableAt`, `quoteBlockAt`, `wholeLines`, `splitCells`                                                                                                                                                                         |
| `src/lib/editor/tables.ts`                          | Pure GFM table commands: insert, add/delete rows and columns, alignment, format, Tab navigation.                                                                                                                                                                                                                                                                                  | `insertTable`, `tableCommand`, `tableMove`, `isInTable`                                                                                                                                                                                  |
| `src/components/studio/EditorToolbar.tsx`           | The formatting toolbar (menus, profile warnings, roving focus) built on the pure commands and `FEATURE_SUPPORT`.                                                                                                                                                                                                                                                                  | `EditorToolbar`, `useRovingToolbar`                                                                                                                                                                                                      |
| `src/lib/markdown/math.ts`                          | On-demand KaTeX loading, the `$5 and $10` guard, and embedding KaTeX CSS and fonts for exports.                                                                                                                                                                                                                                                                                   | `ensureMath`, `hasMathSyntax`, `remarkMathGuard`, `katexCssForExport`                                                                                                                                                                    |
| `src/lib/markdown/diagrams.ts`                      | On-demand Mermaid rendering with a result cache; swaps diagram blocks in the preview and in exported HTML.                                                                                                                                                                                                                                                                        | `renderDiagram`, `hydrateDiagrams`, `inlineDiagrams`                                                                                                                                                                                     |
| `src/lib/markdown/preview-dom.ts`                   | Updates the preview block by block so unchanged content (images, math, diagrams) is never rebuilt.                                                                                                                                                                                                                                                                                | `patchHtml`                                                                                                                                                                                                                              |
| `src/lib/markdown/source-lines.ts`                  | Click-through sync: maps between preview blocks and editor lines using the `data-sl` / `data-el` attributes that `renderMarkdown(..., { sourceLines: true })` adds after sanitizing (numbers only, studio preview only, never in exports). `patchHtml` ignores them when comparing, so a line inserted above never reloads the blocks below.                                      | `blockAtLine(container, line)`, `lineOfTarget(target, container)`                                                                                                                                                                        |
| `src/lib/markdown/scroll-map.ts`                    | Scroll sync by source line instead of percentage. The preview's innermost blocks (positioned by `previewBlocks`) give a monotone map between a source line and a height, so the panes stay on the same text even when a code block is many editor lines and a few preview pixels. Falls back to the percentage when there are no blocks, and both panes jump to the end together. | `buildAnchors(blocks)`, `lineToY(anchors, line)`, `yToLine(anchors, y)`                                                                                                                                                                  |
| `src/lib/markdown/export.ts`                        | Async rendering for "Copy rendered HTML" and "Download standalone .html".                                                                                                                                                                                                                                                                                                         | `renderExportBody`, `standaloneDocument`                                                                                                                                                                                                 |
| `src/lib/server/csp.ts`                             | Per-request nonce and the Content-Security-Policy / security headers (§8).                                                                                                                                                                                                                                                                                                        | `createNonce()`, `buildCsp(nonce)`, `securityHeaders(nonce)`                                                                                                                                                                             |
| `src/components/studio/Studio.tsx`                  | Main workspace coordinator: layout, debounce autosave, drawers, panels, import/export.                                                                                                                                                                                                                                                                                            | State coordinator; handles keyboard shortcuts and two-way scroll mapping.                                                                                                                                                                |
| `src/components/studio/MarkdownEditor.tsx`          | CodeMirror 6 React wrapper with line numbers, keymaps, and paste handlers.                                                                                                                                                                                                                                                                                                        | Exposes imperative `EditorHandle` (`run`, `undo`, `redo`, `getSnapshot`, `apply`, `insert`, `goToLine`, `scrollToRatio`, `focus`).                                                                                                       |

---

### 4.1 Portability Rules (`checkPortability`)

Each issue carries a 1-based `line` that points at the offending text (clicking it jumps the editor there).

| Rule                                                     | Flags                                                                                                                           | Severity                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `raw-html`                                               | HTML other than comments                                                                                                        | warning (error for dev.to) |
| `unclosed-html`                                          | Open/close tags paired per parent node; reports the opening line and stray closing tags                                         | warning                    |
| `local-image` / `data-image`                             | Image paths that won't load elsewhere / base64 images                                                                           | warning / info             |
| `local-link`                                             | Links and reference definitions to local files (`./a.md`, `/docs/x`, `file://`); anchors, web, mail and phone links pass        | warning                    |
| `alert`                                                  | `> [!NOTE]`-style alerts outside the GitHub and Obsidian profiles (they show as a plain quote)                                  | warning                    |
| `missing-alt`                                            | Images with empty alt text                                                                                                      | warning                    |
| `mermaid`                                                | Mermaid blocks outside GitHub/Obsidian profiles                                                                                 | warning                    |
| `math`                                                   | Inline or block math (found in the AST, so code and currency such as `$5 and $10` are ignored) in profiles that don't render it | warning                    |
| `highlight` / `wiki-link`                                | `==x==` and `[[x]]` outside the Obsidian profile (where both render)                                                            | warning                    |
| `container`                                              | `:::` custom containers                                                                                                         | warning                    |
| `trailing-break`                                         | Two trailing spaces used as a line break                                                                                        | warning                    |
| `fence-lang`                                             | Code fence without a language                                                                                                   | info                       |
| `mixed-bullets`                                          | Mixed `-`/`*`/`+` markers; points at the first line that differs                                                                | info                       |
| `gfm-table` / `gfm-task` / `gfm-strike` / `gfm-footnote` | GFM extensions under the Strict CommonMark profile                                                                              | warning                    |

`math`, `mermaid` and `alert` follow `FEATURE_SUPPORT`: rendered by the preview where supported, flagged elsewhere.

### 4.2 Checker rules (`src/lib/checker/`)

The Checks panel shows three kinds of issue, all produced by `runChecks(md, profile, config)` and merged by line:

- **Portability rules** (section 4.1), with the writer's on/off and severity choices applied afterwards. The rule ids are listed in `BUILTIN_RULES`; a rule that a profile renders stays quiet on its own.
- **Publication standards**, off until turned on, each with a severity and limits: `title-length` (front matter title, else the first heading), `description-length`, `required-fields`, `heading-structure` (one `#` heading, no skipped levels), `word-count` (as the status bar counts) and `tag-count`. They use `splitFrontMatter`, `getOutline` and `getStats` from `markdown.ts`, so there is still one Markdown parser.
- **The writer's own rules**: plain text (optionally whole-word) or a regular expression, a message in which `{match}` is the text found, and a severity. They run over the text outside fenced code and front matter, report the first match on each line, at most 50 lines per rule, and look at only the first 2,000 characters of a line. A pattern that repeats a repeat (like `(a+)+`) is refused, because a regular expression cannot be interrupted; this is a heuristic guard, noted in `custom.ts`. Up to 50 rules, patterns up to 200 characters.

**Where settings live.** One set per browser, in `localStorage` (`md:check-rules`, validated with zod and replaced by the defaults when invalid), edited in the Rules dialog and exportable and importable as JSON (200 KB limit) so a team can share standards. **A draft can override them** with a `checks:` map in its front matter: `rule: false` or `true` switches a rule off or on, `rule: error|warning|info` sets its severity, and `title-length: { max: 80 }` sets and enables a standard's limits. The ids are those in the Rules dialog. A setting that is not understood becomes an info note (`checks-config`) on the `checks:` line instead of being ignored silently. Overrides never change the browser's settings.

---

## 5. End-to-End Data Flows

### 5.1 Edit, Render, and Autosave

```text
User keystroke → CodeMirror doc change → Studio.setContent
   ├─ (Deferred render) → unified → markdown AST → hast → rehype-sanitize → rehype-highlight → sanitized HTML string → preview
   ├─ (Memoized analysis) → portability checks, table of contents outline, reading stats
   └─ (Debounce 400ms) → documentStore.save(currentDoc) [IndexedDB]
      Unsaved edits are also flushed on draft switch, leaving the studio, tab hide and pagehide.
      Status line: Saving… / Saved in this browser / Not saved (failures also raise one toast).
Scroll sync: Editor onScroll → compute scroll percentage → Preview scrollToRatio (and vice-versa)
```

### 5.2 Content Ingestion (Import & Paste)

```text
1. File Import (.md, .txt): File API → splitFrontMatter → create new draft or replace current.
2. Rich Paste (text/html): Clipboard event → rehype-parse → rehype-remark → remark-stringify(GFM) → insert Markdown text; toast notification confirms conversion.
3. Image Paste / Drop: in a draft that is not in the cloud (or when hosting is off or fails): File blob → compressImage (canvas max 1600px) → store data URI in draft.images → insert `![alt](./images/filename.png)`.
   In a cloud draft with hosting on: File blob → shrinkImage (PNG/JPEG/WebP/GIF under 300 KB go as they are, anything larger is re-encoded as WebP, or JPEG where WebP can't be written, at up to 1600px and falling quality until it fits 300 KB; 1 MB is the hard limit) → `POST /api/assets` → insert `![alt](https://<host>/a/<id>.<ext>)`. A failure falls back to the local path and says so.
   "Host images (n)" in a cloud draft's menu moves its local images to hosting and rewrites `images/x.png` and `./images/x.png` (Markdown and `<img src>`) to the hosted links; it is the only thing that rewrites existing text, and Ctrl/⌘+Z undoes it.
```

### 5.3 Content Export

```text
Raw Content → [Optional normalizeMarkdown] → joinFrontMatter → finalizeText (strict LF, single trailing newline)
  ├─ Standard .md: Preserve original relative image links.
  ├─ Self-Contained .md: embedImages() replaces relative image paths with base64 data URIs (+ size warning).
  ├─ Rendered HTML: renderMarkdown() → copy sanitized HTML string to clipboard.
  └─ Standalone HTML Document: Embed inline CSS styles + sanitized body into full HTML5 document template.
```

### 5.4 BYOK AI Assistance

```text
1. Connect: Provider + Model ID + API Key (+ optional Base URL) → Stored in React state memory only.
2. Metadata Suggestion: Send draft content → Parse JSON stream → Populate interactive review inputs → "Apply" writes YAML front matter.
3. Topic Drafting: Send topic prompt + notes → Stream Markdown response → "Open as New Draft" (guarantees existing work is never overwritten).
4. Guardrails: AbortController cancels active streams; HTTP 401/402/403 errors halt immediately without wasteful retries.
```

### 5.5 Cloud Drafts and Synchronization (Milestone 3)

Accounts are optional and the cloud is opt-in. A draft is stored in the cloud only when the writer chooses it, an account may keep a limited number (5 by default, `MAX_CLOUD_DOCS` on the server), and everything else stays in the browser's IndexedDB.

```text
Choosing:    after signing in, a dialog lists this device's drafts (none pre-selected); a draft's menu has
             "Save to cloud" / "Remove from cloud". Removing deletes the cloud copy and keeps the local draft.
Ownership:   a draft in an account's cloud belongs to that account. It is hidden while anyone else, or nobody,
             is signed in (this includes an expired session) and is never offered to another account.
             Drafts not in the cloud are visible to everyone who uses the browser.
Signing out: sync once, then remove the account's cloud drafts (and their local history) from the browser, so
             the next sign-in downloads them again. Drafts with images are listed first (images are not in
             the cloud yet) and can be kept. Without a connection and with unsynced changes the writer must
             choose between staying signed in and keeping those drafts on the device.
Syncing:     only when a draft changed (its hash differs from what the cloud has) and only drafts in the cloud.
             A round pulls first, then pushes; it runs about 3 seconds after a local save, when the tab
             regains focus or comes back online, and every minute, never while signed out. A cloud change to
             a draft with unsaved edits waits for the next round.
Conflicts:   the later edit wins. Each push carries the time of the edit on its device (`editedAt`); when the
             draft moved on since the device last synced, the later edit replaces the server's text, and
             the loser is answered with the server copy. A device whose text is replaced first keeps it as a
             version in the draft's local History ("Replaced by a newer edit elsewhere"). A device clock
             cannot claim more than 5 minutes ahead of the server. An identical text is never a conflict,
             an edit beats a delete, and an edit cannot revive a delete it has not seen.
Limit:       the server refuses a new cloud draft beyond the limit (`limit_reached`) and the draft is local
             again; bringing back a deleted draft needs a free slot too. Deleting frees one.
```

- PULL: `GET /api/sync/pull?since=<cursor>` returns changes and tombstones plus the account's `limit`. The cursor is the server's `updated_at` in milliseconds and is inclusive, so a write in the same millisecond is never missed; applying an already-seen version is a no-op.
- PUSH: `POST /api/sync/push` (up to 50 documents, 5 MB, 1 MB of text each) returns per document `ok`, `conflict` (with the server copy), `limit_reached` or `rejected`. Deleting stores a tombstone and drops the text.
- Scope: title, library name, folder and text. Local images and empty folders stay on the device until hosted images ship.
- Ids: drafts keep their short local ids, sent as `<userId>:<id>` so two accounts can never clash; the server refuses ids outside the caller's prefix, and answers another account's id as "rejected", the same as an unknown one.
- Browser engine (`src/lib/sync/`): per account and per cloud draft, IndexedDB keeps `{ version, hash }` under `sync:<userId>:doc:<id>` plus the pull cursor. The wire contract is `protocol.ts`, shared with `src/server/sync`. The account is remembered in `localStorage` so an offline reload still shows its drafts.
- Honest limit: IndexedDB is not encrypted. Removing cloud drafts at sign-out and hiding them afterwards reduces what a shared computer shows; it is not protection against someone who can open the browser's developer tools while a session is active.

---

## 6. Authoritative Database Schema (SQLite / Drizzle)

The database schema is defined in `infra/db/schema.ts` and runs identically on Cloudflare D1 and `better-sqlite3`:

```sql
-- Core users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,                       -- UUID v7
  email TEXT NOT NULL UNIQUE,
  email_key TEXT UNIQUE,                     -- The inbox under every spelling: +tag dropped, Gmail dots ignored
  email_verified_at INTEGER,                 -- Set by the emailed link (or by GitHub); NULL until then
  password_hash TEXT,                        -- PBKDF2-SHA256 (WebCrypto, 100k iterations, the Workers cap); NULL for OAuth-only users
  display_name TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,               -- Unix milliseconds
  updated_at INTEGER NOT NULL
);

-- Active user sessions (cookie-based)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,           -- SHA-256 hash of the session token
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Linked OAuth identities
CREATE TABLE oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                    -- 'github'
  provider_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(provider, provider_user_id)
);

-- Synced Markdown documents
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  name TEXT,                                 -- Library label set by renaming
  folder TEXT,                               -- Library folder (one level)
  content TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,        -- Monotonically increasing version counter
  content_hash TEXT NOT NULL,                -- SHA-256 of title, name, folder and content
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  edited_at INTEGER NOT NULL DEFAULT 0,      -- When the text was last edited on a device (later edit wins)
  deleted_at INTEGER                         -- Soft delete tombstone for sync propagation
);
CREATE INDEX idx_documents_user_updated ON documents(user_id, updated_at);

-- Immutable version history
CREATE TABLE document_revisions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_revisions_doc_version ON document_revisions(document_id, version DESC);

-- Hosted uploaded image assets
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  storage_key TEXT NOT NULL UNIQUE,          -- `<random id>.<ext>` in R2 or under DATA_DIR/uploads
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,                      -- Deduplication hash
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, sha256)                   -- The same picture is stored once per account
);

-- Public read-only shareable links
CREATE TABLE share_links (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  revision_id TEXT REFERENCES document_revisions(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,                 -- Unguessable nanoid/slug
  is_public INTEGER NOT NULL DEFAULT 1,
  view_count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);
```

---

## 7. API Specifications (Milestone 3+)

| Method   | Endpoint                       | Auth Required | Purpose                                                                                                                                            |
| -------- | ------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/health`                  | None          | Service liveness probe and database connectivity check.                                                                                            |
| `POST`   | `/api/auth/signup`             | None          | Account creation with email and password.                                                                                                          |
| `POST`   | `/api/auth/login`              | None          | Session issuance; returns HTTP-only `SameSite=Lax` cookie.                                                                                         |
| `POST`   | `/api/auth/logout`             | Session       | Revokes session row and clears the browser cookie.                                                                                                 |
| `GET`    | `/api/auth/me`                 | None          | Returns the signed-in user (with `emailVerified`), or `null`, and what this server offers (GitHub, images, email confirmation, the CAPTCHA key).   |
| `GET`    | `/api/auth/verify?token=`      | None          | Confirms the address with the emailed one-time link (24 hours), then redirects to the editor.                                                      |
| `POST`   | `/api/auth/verify/resend`      | Session       | Sends another confirmation email (3 an hour per account).                                                                                          |
| `GET`    | `/api/auth/github`             | None          | Initiates GitHub OAuth flow with PKCE state challenge.                                                                                             |
| `GET`    | `/api/auth/github/callback`    | None          | Validates OAuth code, links user account, creates session.                                                                                         |
| `POST`   | `/api/sync/push`               | Session       | Pushes dirty documents; enforces optimistic concurrency.                                                                                           |
| `GET`    | `/api/sync/pull`               | Session       | Incremental pull of updated documents and deletions.                                                                                               |
| `GET`    | `/api/documents/:id/revisions` | Session       | Retrieves document snapshot history.                                                                                                               |
| `POST`   | `/api/assets`                  | Session       | Uploads an image (multipart `file`); type is decided by its bytes (PNG, JPEG, WebP, GIF; never SVG), 1 MB each, per-account count and size limits. |
| `GET`    | `/api/assets`                  | Session       | Lists the account's images with usage and limits.                                                                                                  |
| `DELETE` | `/api/assets/:id`              | Session       | Deletes an image; links to it stop working.                                                                                                        |
| `GET`    | `/a/:file`                     | None          | Serves an image publicly (`<id>.<ext>`): immutable cache, `nosniff`, `default-src 'none'; sandbox`, embeddable cross-origin.                       |
| `POST`   | `/api/share`                   | Session       | Creates an unguessable read-only share link.                                                                                                       |
| `GET`    | `/s/:slug`                     | None          | Server-side renders sanitized static HTML of a shared doc.                                                                                         |
| `POST`   | `/api/publish/:target`         | Session       | Dispatches document to GitHub repo, dev.to, or Hashnode.                                                                                           |

---

## 8. Security & Privacy Guarantees

**Sign-up protection.** Open sign-up must not be a way to run up the free allowances.

- _One inbox, one account:_ `emailKey` (`src/server/auth/email.ts`) drops a `+tag`, ignores dots in Gmail addresses and maps `googlemail.com` to `gmail.com`; sign-up and GitHub sign-in refuse a key that exists, and any spelling signs in to its account.
- _Limits_ (table `rate_limits`, fixed windows, the same SQL on D1 and SQLite): 5 sign-ups per hour per address, 10 failed sign-ins per 15 minutes per email and per address (locked out until the window ends, before any password work, and a success clears the email's count), 3 confirmation emails per hour per account. The address is `cf-connecting-ip`, or `X-Forwarded-For` only when `TRUST_PROXY` is set, since any client can send that header; with neither, only the per-email limits apply.
- _Email confirmation:_ when the server can send mail (Resend over HTTP anywhere, SMTP or a folder of JSON files on Node), a password account starts unconfirmed and **nothing is sent at sign-up**: the first time the account tries the cloud (a draft's "Save to cloud" or the account menu's "Choose drafts for the cloud…") the app opens a "Confirm your email" dialog that sends the link, and opening it again sends nothing while that link is still good ("Send it again" forces one). People who only write locally never cost a message. Until the link is used the cloud (sync and image hosting) answers 403 `email_unverified`. The one-time link (hash stored, 24 hours, single use, valid only for the address it was sent to) is used. GitHub accounts count as confirmed. A server that sends no mail confirms nothing and blocks nothing. A failed send shows in the dialog, which offers to try again.
- _CAPTCHA:_ with `TURNSTILE_SECRET` set, sign-up needs a Cloudflare Turnstile token, verified server-side (anything but a clear success fails); the CSP allows Cloudflare's challenge script and frame for it.

1. **HTML Sanitization:** Raw user input is parsed and sanitized using a strict `rehype-sanitize` schema allowing only standard formatting elements, safe attributes, and `data:image/*` or `https://` sources.
2. **Content Security Policy (CSP):** Sent on every HTML response in production by the security-headers middleware (`src/start.ts`, `src/lib/server/csp.ts`). Each request gets a random nonce that TanStack Start stamps on its inline SSR scripts, so `script-src` never needs `'unsafe-inline'`. Styles keep `'unsafe-inline'` because CodeMirror and Radix inject style elements at runtime. `connect-src` allows `https:` and `http://localhost`/`127.0.0.1` because BYOK AI calls go directly from the browser to the writer's provider (including local runners such as Ollama). Fonts are self-hosted, so no third-party origins are needed. The same middleware sets `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `Strict-Transport-Security`. It is disabled in `vite dev` (HMR needs inline scripts).
   ```
   default-src 'self';
   script-src 'self' 'nonce-<per-request>';
   style-src 'self' 'unsafe-inline';
   img-src 'self' data: https:;
   font-src 'self';
   connect-src 'self' https: http://localhost:* http://127.0.0.1:*;
   object-src 'none';
   base-uri 'self';
   form-action 'self';
   frame-ancestors 'none';
   ```
3. **Session Management:** Cryptographically random 32-byte session tokens stored as SHA-256 digests in SQLite. Delivered via `HttpOnly`, `Secure`, `SameSite=Lax` cookies. A session lasts 24 hours and slides: use in the second half of its life extends it by another 24 hours, so only someone idle for a full day is signed out. An absolute cap of 5 days from sign-in ends it regardless of activity.
4. **Data Isolation:** All database queries require a verified `user_id` extracted from the server session context. Client-provided user IDs are strictly ignored.
5. **Private AI Usage:** User API keys are held strictly in browser client memory for the active session, never stored in `localStorage`, and never forwarded to our backend.
6. **Self-Host Hardening:** The `ALLOW_SIGNUPS=false` configuration variable allows private instance owners to completely disable registration.

---

## 9. Deployment Architecture

### 9.1 Hosted Tier (Cloudflare — Zero Cost Baseline)

- **Edge Application & API:** Cloudflare Workers running the TanStack Start runtime.
- **Database:** Cloudflare D1 (Serverless SQLite, 5 GB storage, 5 million reads/day free).
- **Asset Storage:** Cloudflare R2 (10 GB storage, zero egress bandwidth charges).
- **Import and export (bulk):** Export, _Download all drafts (.zip)_, writes each draft as `<Folder>/<title-slug>.md` (unfiled drafts at the top), with the images a draft uses in an `images/` directory beside it and references pointed at `./images/<name>`; duplicate titles get `-2`, `-3`, and a clashing image name is renamed. The text is otherwise unchanged. Version history is not exported. Import accepts several files, a `.zip` (such as this export), or a picked folder: Markdown and `.txt` files become drafts, directories become library folders (nested ones joined as `a / b`), and images referenced by relative path are attached. Hidden files, `__MACOSX` and paths with `..` are ignored; archives over 5,000 files or 256 MB unpacked are refused. A file with no title or heading keeps its file name.
- **PWA and offline:** `public/sw.js` is a hand-written service worker with no build step, registered in production builds only (not in PR previews) as `/sw.js?v=<package version>` so each release is a new worker with its own cache and the old caches are deleted on activate. It fetches `/editor` and `/` with the scripts and styles they link to on install; pages are network first (4 second timeout) and kept for offline, an editor page that was never cached falls back to the cached editor, files under `/assets/` are cache first, fonts, icons and the manifest are stale-while-revalidate, and the page hands the worker the files it has loaded so the first visit is covered too. It never touches other origins (AI providers), `/api/`, `/_` paths, or non-GET requests. What works offline is what has been used online once: the editor, the preview and the checks, plus Mermaid or KaTeX after they were first used. The `Install` button appears when the browser fires `beforeinstallprompt`. Routing rules are unit-tested (`src/lib/pwa/sw.test.ts`) and the offline behavior is covered by e2e specs.
- **Worker size:** the server bundle is about 0.7 MiB gzipped (Cloudflare free plan allows 3 MiB). Mermaid and KaTeX are browser-only and excluded from it through `import.meta.env.SSR`; `scripts/bundle-size.ts` enforces a 1.5 MiB budget and a list of forbidden libraries in CI.
- **Edge Security:** see Sign-up protection (§8).
- **PR previews:** each pull request into `dev` is deployed as its own Worker (`mdstudio-pr-<number>`, workers.dev, `noindex`) by `.github/workflows/preview.yml` and deleted when the PR closes; see `docs/RELEASING.md`.

### 9.2 Self-Hosted Tier (Docker — Single Container)

- **Deployment:** `docker compose -f infra/docker-compose.yml up -d`
- **Architecture:** Alpine Linux container running Node.js + `better-sqlite3`.
- **Persistent Data:** Single mounted Docker volume (`/data`) containing `studio.db` and the `/data/assets` folder.
- **Backups:** Atomic snapshot via `sqlite3 /data/studio.db ".backup /backup/studio.db"`.

---

## 10. Design System & Typography

- **Visual Direction:** Warm editorial paper aesthetic; clean, high-contrast typography designed for long-form reading and writing.

- **Theme Tokens:** Full OKLCH semantic palette defined in `src/styles.css` supporting light and dark modes without hardcoded component hex values.

- **Typography Pairing:**

  - _Headings & Display:_ `Fraunces` (warm, editorial serif).
  - _UI & Navigation:_ `IBM Plex Sans` (clean, technical, readable grotesque).
  - _Editor & Code:_ `JetBrains Mono` (ligature-rich monospace).

- **Prose Preview:** Styled via the `.md-preview` class to match GitHub's exact typography, blockquote styles, table layouts, and syntax-highlighted code fences.

---

## 11. Architectural Decision Records (ADRs)

| ADR        | Decision                                                | Architectural Rationale                                                                                                                                   |
| ---------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ADR 01** | Markdown text is the single source of truth             | Prevents proprietary CMS schema lock-in; ensures complete portability across developer platforms.                                                         |
| **ADR 02** | Unified / Remark / Rehype pipeline                      | Industry-standard Abstract Syntax Tree (AST); enables identical parsing for rendering, linting, and AST transforms.                                       |
| **ADR 03** | Local-first IndexedDB storage                           | Guarantees instant typing feedback and 100% offline functionality without requiring account registration.                                                 |
| **ADR 04** | Client-direct BYOK AI integration                       | Eliminates backend proxy server costs, eliminates vendor lock-in, and guarantees maximum user privacy.                                                    |
| **ADR 05** | Base64 image embedding in self-contained export         | Enables distributing single, self-sufficient Markdown files without hosting dependencies.                                                                 |
| **ADR 06** | Cloudflare stack for hosted tier                        | Leverages the most generous free-tier edge compute and database, with zero egress fees on R2.                                                             |
| **ADR 07** | Universal SQLite via Drizzle ORM                        | Unifies Cloudflare D1 and Docker `better-sqlite3` under a single schema, query syntax, and migration pipeline.                                            |
| **ADR 08** | Single-container Docker deployment                      | Eliminates complex multi-container dependencies (e.g., PostgreSQL + Redis), making self-hosting trivial.                                                  |
| **ADR 09** | Versioned optimistic concurrency for sync               | Simple, robust, and predictable conflict handling; creates duplicate conflict documents rather than destroying data.                                      |
| **ADR 10** | Database-backed cookie sessions over JWT                | Enables immediate session revocation and simplifies Edge/Node authentication compatibility.                                                               |
| **ADR 11** | Raw IndexedDB instead of `idb-keyval`                   | The wrapper was a thin layer over ~60 lines; owning it removes a dependency and lets writes resolve on transaction completion.                            |
| **ADR 13** | Math and Mermaid are profile-gated                      | Preview must match the target platform: render only where it renders, flag everywhere else. Two packages are the one exception to "build, don't install". |
| **ADR 14** | Nonce-based CSP instead of `script-src 'unsafe-inline'` | SSR emits inline scripts; a per-request nonce keeps XSS protection without hashing dynamic payloads.                                                      |

---

## 12. Known Gaps (Tracked)

| Gap                              | Spec expectation             | Current behavior                                                                                                                                                                                                                                                                                                                                                                          | Plan                 |
| -------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Obsidian wiki-links              | Render what Obsidian renders | `[[wiki-links]]` are silenced in Checks but shown as plain text in the preview (`==highlight==` now renders as a marker)                                                                                                                                                                                                                                                                  | Roadmap, Phase 1     |
| Math and diagram details         | Preview = platform           | the preview renders Mermaid in its neutral theme in light mode and its dark theme in dark mode (one cached render per theme, re-rendered when the theme toggles), while exports are always light; a document with math exports as a ~380 KB file because all KaTeX fonts are embedded; the `$…$` currency guard follows GitHub's rule (no space inside the dollars, no digit right after) | Font pruning later   |
| Playwright e2e                   | Listed in the stack          | Not installed                                                                                                                                                                                                                                                                                                                                                                             | With the CI workflow |
| Drafts from before the DB rename | n/a                          | Drafts in the old `keyval-store` database are not read (rename was intentional; app unreleased)                                                                                                                                                                                                                                                                                           | None                 |

---

## 12. SEO and Discoverability

- **Single source:** `src/lib/site/seo.ts` holds the site constants, `pageHead()` (title, description, canonical, Open Graph, Twitter), the WebApplication JSON-LD, the sitemap and the IndexNow payload. Every public route builds its head with `pageHead()`; add new public pages to `SITEMAP_ENTRIES` (which feeds `INDEXABLE_PATHS`) so they reach the sitemap and IndexNow.
- **Private pages:** editor routes use `noindex` and no canonical. `/api/` is disallowed in `robots.txt`.
- **Crawlers:** search engines and AI crawlers are explicitly allowed (`public/robots.txt`). `public/llms.txt` summarises the product for AI assistants and must be updated when pages are added.
- **IndexNow:** `public/<key>.txt` proves site ownership; the release workflow runs `scripts/indexnow.ts` after each deploy (non-blocking).
- **Assets:** `public/og.png` (1200x630) and the app icons are generated by `bun run brand` from `public/favicon.svg`; `public/manifest.webmanifest` describes the installable app.
- **Checked by:** `src/lib/site/seo.test.ts` and `e2e/seo.spec.ts`.
- **Guides:** long-form articles live in `content/guides/<slug>.md` (no H1; the page title is the H1) with their metadata (title, description, dates) in `src/lib/site/guides.ts`. The `/guides` index and `/guides/$slug` pages render them with mdstudio's own pipeline (`renderMarkdown`, sanitized), add `TechArticle` and `BreadcrumbList` JSON-LD, an "On this page" table of contents and per-guide sitemap `lastmod`. `src/lib/site/guides.test.ts` enforces the invariants: a file per guide, title at most 60 and description 110 to 160 characters, at least three sections, no checker issues on the GitHub, dev.to and Obsidian profiles, and every guide listed in `public/llms.txt`. To add a guide: write the Markdown, add its metadata, add it to `llms.txt`.
