# Markdown Studio — System Specification (Source of Truth)

| Metadata | Details |
| --- | --- |
| Status | Living document, v1.0 (2026-11-01) |
| Author / Owner | Chizoba Jude Ojini |
| License model | Open source (MIT); official hosted instance + self-host via Docker |
| Change rule | Any change to architecture, data model, flows, or invariants must update this document in the same pull request. ADRs (§14) record the reasons. |

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

---

## 2. Feature Scope & Status

| Area | Feature | Status |
| --- | --- | --- |
| **Editor** | CodeMirror 6, syntax highlighting, formatting toolbar, keyboard shortcuts (Mod-B/I/K), search, line numbers | Done (M1) |
| **Preview** | Live synchronized preview, GitHub-like prose, syntax-highlighted code blocks, two-way scroll ratio sync | Done (M1) |
| **Workspace** | Split view, editor-only, preview-only, focus mode, responsive mobile drawers & bottom sheets | Done (M1) |
| **Import** | File picker (`.md`, `.markdown`, `.txt`), drag-and-drop, paste raw text, paste rich HTML with automatic Markdown conversion | Done (M1) |
| **Export** | Standard `.md`, clipboard copy, self-contained `.md` (base64 compressed images), copy HTML, standalone `.html` with embedded styles, optional text normalization | Done (M1) |
| **Portability Checks** | AST & line linter with profiles: Strict CommonMark, GitHub, dev.to, Obsidian | Done (M1) |
| **Metadata** | YAML front matter visual form (title, description, tags, date, canonical URL, cover image) | Done (M1) |
| **Draft Library** | Local-first IndexedDB storage, instant autosave (400ms debounce), create, duplicate, rename, delete | Done (M1) |
| **Writing Aids** | Word count, character count, estimated reading time, live heading outline/TOC with click-to-line | Done (M1) |
| **AI Writing** | BYOK direct browser streaming (OpenAI, Anthropic, Google Gemini, OpenAI-compatible); title/description/tag suggestions; draft topic into new document | Done (M1) |
| **PWA & Offline** | Installable manifest, offline service worker, app icon badge | Milestone 2 |
| **Advanced Library** | Full-text draft search, tags, folder organization, bulk import/export ZIP archives | Milestone 2 |
| **Local History** | Automatic revision snapshots in IndexedDB, visual side-by-side diff, one-click restore | Milestone 2 |
| **Accounts** | Email + password / magic link, GitHub OAuth | Milestone 3 |
| **Cloud Sync** | Multi-device synchronization with versioned last-write-wins and automatic conflict forks | Milestone 3 |
| **Hosted Assets** | Upload images to Cloudflare R2 or local disk storage; rewrites relative refs to absolute CDN URLs | Milestone 3 |
| **Server History** | Immutable server revision log per document | Milestone 3 |
| **Share Links** | Read-only public web view (`/s/:slug`) of a specific document version with revoke and expiration options | Milestone 4 |
| **Publishing Integrations** | Direct push to GitHub repositories via personal access token, dev.to API, Hashnode API | Milestone 4 |
| **Collaboration** | Optional real-time collaborative editing via Yjs / CRDTs | Post-v1 |
| **WYSIWYG Editing** | WYSIWYG-only editing that hides Markdown; proprietary syntax extensions as the default output. | Milestone 2 |

---

## 3. System Architecture

```text
┌──────────────────────────── Browser Client (React 19 SPA / TanStack Start) ────────────────────────────┐
│  Routes: /  /editor  /editor/$docId  (+ /login /settings /s/$slug in M3/M4)                            │
│                                                                                                         │
│  CodeMirror 6 Editor ⇄ Studio State ⇄ src/lib/markdown.ts (unified pipeline) → Sanitized Preview       │
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

| Layer                 | Technology                                                                                                                                                          | Justification                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Framework**         | TanStack Start v1, React 19, Vite 7                                                                                                                                 | Modern full-stack SSR and server functions; compiles to Edge Workers or Node runtime.             |
| **Styling**           | Tailwind CSS v4, shadcn/ui                                                                                                                                          | Native CSS token theming (`src/styles.css`), dark mode support, accessible Radix UI primitives.   |
| **Editor**            | CodeMirror 6 (client-only dynamic import)                                                                                                                           | Fast, modular, accessible on mobile keyboards, extensible language facets.                        |
| **Markdown Pipeline** | Unified ecosystem (`remark-parse`, `remark-gfm`, `remark-frontmatter`, `remark-rehype`, `rehype-highlight`, `rehype-sanitize`, `rehype-remark`, `remark-stringify`) | Strict AST-compliant parsing, linting, conversion, and sanitization sharing a single syntax tree. |
| **Client Storage**    | IndexedDB (raw, no wrapper library)                                                                                                                                          | Reliable client-side persistence for large drafts and base64 image blobs.                         |
| **Database ORM**      | Drizzle ORM (SQLite dialect)                                                                                                                                        | Identical type-safe SQL queries run on Cloudflare D1 and `better-sqlite3`.                        |
| **Object Storage**    | Cloudflare R2 / Local Filesystem                                                                                                                                    | S3-compatible, zero egress costs on Cloudflare; flat directory structure on Docker.               |
| **Testing**           | Vitest + Playwright                                                                                                                                                 | Fast AST unit tests and end-to-end browser automation.                                            |

### 3.2 Repository Structure

```text
├── src/
│   ├── routes/                # TanStack Start file routes (/, /editor, /editor/$docId)
│   ├── components/
│   │   ├── studio/            # Studio, MarkdownEditor, AiWriter, panels
│   │   └── ui/                # Radix / shadcn UI primitives (button, dialog, tabs, etc.)
│   ├── lib/
│   │   ├── markdown.ts        # Unified parsing, rendering, checks, stats, exports
│   │   ├── documentStore.ts   # IndexedDB document repository
│   │   ├── images.ts          # Canvas resizing and base64 compression
│   │   ├── ai-provider.ts     # BYOK direct browser HTTP/SSE client
│   │   └── ai-writing.ts      # AI prompts and metadata response schemas
│   └── styles.css             # Tailwind v4 theme tokens, prose typography, CodeMirror overrides
├── infra/                     # Shared backend blueprints (activated in M3)
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
***

## 4. Core Client Modules

| Module                                     | Core Responsibilities                                                                  | Key Functions / Interfaces                                                                                                                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/markdown.ts`                      | The single pipeline for parsing, rendering, linting, and export transforms.            | `renderMarkdown()`, `checkPortability(text, profile)`, `getOutline(text)`, `getStats(text)`, `splitFrontMatter()`, `joinFrontMatter()`, `normalizeMarkdown()`, `embedImages()`, `htmlToMarkdown()`, `standaloneHtml()`, `finalizeText()` |
| `src/lib/documentStore.ts`                 | Client persistence layer backed by IndexedDB.                                          | `list()`, `get(id)`, `save(doc)`, `create(partial)`, `remove(id)`; `MdDocument` model                                                                                                                                                                        |
| `src/lib/images.ts`                        | Client-side image handling, resizing, and compression.                                 | `compressImage(file, maxDimension, quality)`, `safeImageName()`, `kb()`                                                                                                                                                                  |
| `src/lib/ai-provider.ts`                   | Multi-provider HTTP request builder and streaming SSE parser.                          | `buildProviderRequest(config, prompt, systemPrompt)`, `generateWithProvider(config, prompt, systemPrompt, onDelta, signal)`                                                                                                              |
| `src/components/studio/Studio.tsx`         | Main workspace coordinator: layout, debounce autosave, drawers, panels, import/export. | State coordinator; handles keyboard shortcuts and two-way scroll mapping.                                                                                                                                                                |
| `src/components/studio/MarkdownEditor.tsx` | CodeMirror 6 React wrapper with line numbers, keymaps, and paste handlers.             | Exposes imperative `EditorHandle` (`wrap`, `linePrefix`, `insert`, `goToLine`, `scrollToRatio`, `focus`).                                                                                                                                |

***

## 5. End-to-End Data Flows

### 5.1 Edit, Render, and Autosave

```text
User keystroke → CodeMirror doc change → Studio.setContent
   ├─ (Deferred render) → unified → markdown AST → hast → rehype-sanitize → React JSX preview
   ├─ (Memoized analysis) → portability checks, table of contents outline, reading stats
   └─ (Debounce 400ms) → documentStore.save(currentDoc) [IndexedDB]
Scroll sync: Editor onScroll → compute scroll percentage → Preview scrollToRatio (and vice-versa)
```

### 5.2 Content Ingestion (Import & Paste)

```text
1. File Import (.md, .txt): File API → splitFrontMatter → create new draft or replace current.
2. Rich Paste (text/html): Clipboard event → rehype-parse → rehype-remark → remark-stringify(GFM) → insert Markdown text; toast notification confirms conversion.
3. Image Paste / Drop: File blob → compressImage (canvas max 1600px) → store data URI in draft.images → insert `![alt](images/filename.png)`.
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

### 5.5 Multi-Device Synchronization (Milestone 3)

```text
Client maintains per-document sync metadata: { id, version, contentHash, isDirty }
- PUSH: POST /api/sync/push with local documents where isDirty = true.
  Server: If document.version == baseVersion, update row, increment version, record revision snapshot → 200 OK.
  Conflict: If document.version != baseVersion, reject with 409 Conflict returning current server state.
- Conflict Resolution: Keep both. Apply server version to the active document; fork the local un-synced edits into a new document named "Title (Conflict Copy - Device - Timestamp)".
- PULL: GET /api/sync/pull?since=<cursor> fetches server updates and deletions (tombstones).
```

***

## 6. Authoritative Database Schema (SQLite / Drizzle)

The database schema is defined in `infra/db/schema.ts` and runs identically on Cloudflare D1 and `better-sqlite3`:

```sql
-- Core users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,                       -- UUID v7
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,                        -- Argon2id or Scrypt hash; NULL for OAuth-only users
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
  content TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,        -- Monotonically increasing version counter
  content_hash TEXT NOT NULL,                -- SHA-256 hash of content
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
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
  storage_key TEXT NOT NULL UNIQUE,          -- Path in R2 or local disk
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,                      -- Deduplication hash
  created_at INTEGER NOT NULL
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

***

## 7. API Specifications (Milestone 3+)

| Method | Endpoint                       | Auth Required | Purpose                                                    |
| ------ | ------------------------------ | ------------- | ---------------------------------------------------------- |
| `GET`  | `/api/health`                  | None          | Service liveness probe and database connectivity check.    |
| `POST` | `/api/auth/signup`             | None          | Account creation with email and password.                  |
| `POST` | `/api/auth/login`              | None          | Session issuance; returns HTTP-only `SameSite=Lax` cookie. |
| `POST` | `/api/auth/logout`             | Session       | Revokes session row and clears the browser cookie.         |
| `GET`  | `/api/auth/github`             | None          | Initiates GitHub OAuth flow with PKCE state challenge.     |
| `GET`  | `/api/auth/github/callback`    | None          | Validates OAuth code, links user account, creates session. |
| `POST` | `/api/sync/push`               | Session       | Pushes dirty documents; enforces optimistic concurrency.   |
| `GET`  | `/api/sync/pull`               | Session       | Incremental pull of updated documents and deletions.       |
| `GET`  | `/api/documents/:id/revisions` | Session       | Retrieves document snapshot history.                       |
| `POST` | `/api/assets`                  | Session       | Uploads image asset (multipart/form-data, size-capped).    |
| `GET`  | `/a/:key`                      | None          | Serves image asset with public immutable caching headers.  |
| `POST` | `/api/share`                   | Session       | Creates an unguessable read-only share link.               |
| `GET`  | `/s/:slug`                     | None          | Server-side renders sanitized static HTML of a shared doc. |
| `POST` | `/api/publish/:target`         | Session       | Dispatches document to GitHub repo, dev.to, or Hashnode.   |

***

## 8. Security & Privacy Guarantees

1. **HTML Sanitization:** Raw user input is parsed and sanitized using a strict `rehype-sanitize` schema allowing only standard formatting elements, safe attributes, and `data:image/*` or `https://` sources.
2. **Content Security Policy (CSP):**
   ```
   default-src 'self';
   img-src 'self' data: https:;
   connect-src 'self' https:;
   script-src 'self';
   style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
   font-src 'self' https://fonts.gstatic.com;
   object-src 'none';
   frame-ancestors 'none';
   ```
3. **Session Management:** Cryptographically random 32-byte session tokens stored as SHA-256 digests in SQLite. Delivered via `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
4. **Data Isolation:** All database queries require a verified `user_id` extracted from the server session context. Client-provided user IDs are strictly ignored.
5. **Private AI Usage:** User API keys are held strictly in browser client memory for the active session, never stored in `localStorage`, and never forwarded to our backend.
6. **Self-Host Hardening:** The `ALLOW_SIGNUPS=false` configuration variable allows private instance owners to completely disable registration.

***

## 9. Deployment Architecture

### 9.1 Hosted Tier (Cloudflare — Zero Cost Baseline)

- **Edge Application & API:** Cloudflare Workers running the TanStack Start runtime.
- **Database:** Cloudflare D1 (Serverless SQLite, 5 GB storage, 5 million reads/day free).
- **Asset Storage:** Cloudflare R2 (10 GB storage, zero egress bandwidth charges).
- **Edge Security:** Cloudflare Turnstile bot verification and Workers Rate Limiting.

### 9.2 Self-Hosted Tier (Docker — Single Container)

- **Deployment:** `docker compose -f infra/docker-compose.yml up -d`
- **Architecture:** Alpine Linux container running Node.js + `better-sqlite3`.
- **Persistent Data:** Single mounted Docker volume (`/data`) containing `studio.db` and the `/data/assets` folder.
- **Backups:** Atomic snapshot via `sqlite3 /data/studio.db ".backup /backup/studio.db"`.

***

## 10. Design System & Typography

- **Visual Direction:** Warm editorial paper aesthetic; clean, high-contrast typography designed for long-form reading and writing.

- **Theme Tokens:** Full OKLCH semantic palette defined in `src/styles.css` supporting light and dark modes without hardcoded component hex values.

- **Typography Pairing:**

  - _Headings & Display:_ `Fraunces` (warm, editorial serif).
  - _UI & Navigation:_ `IBM Plex Sans` (clean, technical, readable grotesque).
  - _Editor & Code:_ `JetBrains Mono` (ligature-rich monospace).

- **Prose Preview:** Styled via the `.md-preview` class to match GitHub's exact typography, blockquote styles, table layouts, and syntax-highlighted code fences.

***

## 11. Architectural Decision Records (ADRs)

| ADR        | Decision                                        | Architectural Rationale                                                                                              |
| ---------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **ADR 01** | Markdown text is the single source of truth     | Prevents proprietary CMS schema lock-in; ensures complete portability across developer platforms.                    |
| **ADR 02** | Unified / Remark / Rehype pipeline              | Industry-standard Abstract Syntax Tree (AST); enables identical parsing for rendering, linting, and AST transforms.  |
| **ADR 03** | Local-first IndexedDB storage                   | Guarantees instant typing feedback and 100% offline functionality without requiring account registration.            |
| **ADR 04** | Client-direct BYOK AI integration               | Eliminates backend proxy server costs, eliminates vendor lock-in, and guarantees maximum user privacy.               |
| **ADR 05** | Base64 image embedding in self-contained export | Enables distributing single, self-sufficient Markdown files without hosting dependencies.                            |
| **ADR 06** | Cloudflare stack for hosted tier                | Leverages the most generous free-tier edge compute and database, with zero egress fees on R2.                        |
| **ADR 07** | Universal SQLite via Drizzle ORM                | Unifies Cloudflare D1 and Docker `better-sqlite3` under a single schema, query syntax, and migration pipeline.       |
| **ADR 08** | Single-container Docker deployment              | Eliminates complex multi-container dependencies (e.g., PostgreSQL + Redis), making self-hosting trivial.             |
| **ADR 09** | Versioned optimistic concurrency for sync       | Simple, robust, and predictable conflict handling; creates duplicate conflict documents rather than destroying data. |
| **ADR 10** | Database-backed cookie sessions over JWT        | Enables immediate session revocation and simplifies Edge/Node authentication compatibility.                          |

