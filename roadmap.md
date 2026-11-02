# mdstudio — Project Roadmap

## Launch readiness (target: v0.1.0)

- [x] Remove Supabase and Lovable, plain Vite config
- [x] Format the codebase; lint, test, typecheck and build all green
- [x] Raw IndexedDB store (no wrapper library)
- [x] Dependency diet (unused UI components and packages removed)
- [x] Self-hosted fonts and nonce-based CSP
- [x] Autosave hardening, checker locations, `local-link` and `unclosed-html` rules
- [x] Math (KaTeX) and Mermaid, profile-gated
- [x] Complete formatting toolbar (marks, headings, lists, links, images, footnotes, rules, code blocks, tables, alerts, math/Mermaid/HTML insertion, profile warnings, keyboard model)
- [x] Open-source license, contributor docs and license check (known items for the audit: `elkjs` EPL-2.0 via Mermaid needs an attribution notice; `khroma` is MIT but has no `license` field; `lightningcss` MPL-2.0 is build-time only; KaTeX font lineage is MathJax-derived, see `public/katex/README.md`)
- [x] CI (lint, test, build, license, e2e, Docker smoke test)
- [x] Infra blueprints (Cloudflare Workers + D1 + R2, Docker + SQLite)
- [x] Release automation (prepare-release, changelog, tags, GHCR + Docker Hub, Cloudflare deploy)
- [x] SEO foundation (meta, canonical, JSON-LD, sitemap, robots, llms.txt, IndexNow, icons, OG image)
- [x] Home page redesign (live checker demo, dark mode, logo)
- [x] Mermaid dark theme
- [x] README
- [x] Content pages: seven guides rendered with the app's own pipeline
- [ ] Cut v0.1.0

## Milestone 1: Core Writing Studio & Portability (Completed)

- [x] **Editor & Highlighting:** CodeMirror 6 integration with Markdown syntax highlighting, line numbers, search, and history.
- [x] **Formatting Controls:** Quick-access toolbar (bold, italic, strikethrough, headings, links, code, quotes, lists, tables).
- [x] **Faithful Preview:** Strict CommonMark + GFM preview rendering via unified/remark/rehype with syntax-highlighted code fences.
- [x] **Scroll Synchronization:** Bidirectional ratio-based scroll synchronization between editor and preview.
- [x] **Security:** XSS prevention using `rehype-sanitize` with customized safe attribute allowlists.
- [x] **Portability Linter:** Real-time syntax checker with selectable profiles (Strict CommonMark, GitHub, dev.to, Obsidian).
- [x] **Import Pipeline:** Support for `.md` file imports, drag-and-drop, and rich HTML-to-Markdown paste conversion.
- [x] **Export Pipeline:** Standard `.md`, clipboard copy, self-contained `.md` with base64 embedded images, and standalone `.html`.
- [x] **Draft Library:** Local-first IndexedDB persistence with autosave debounce (400ms).
- [x] **Writing Aids:** Live word count, character count, reading time estimation, and click-to-navigate outline.
- [x] **BYOK AI Assistant:** Direct browser streaming integration for OpenAI, Anthropic, Gemini, and custom OpenAI-compatible models.
- [x] **Responsive Workspace:** Full phone and tablet responsiveness with single-pane view switching and drawer-based panels.
- [x] **Automated Test Suite:** Comprehensive Vitest coverage for rendering parity, sanitizer safety, AST checkers, and paste conversion.

---

## Milestone 2: PWA, Local History & Advanced Library (Target: Q1 2027)

- [ ] **PWA Support:** Web app manifest, service worker caching, and complete offline installation capability.
- [ ] **Local Document History:** Automatic periodic snapshots stored in IndexedDB with visual side-by-side diff and one-click restore.
- [ ] **Library Organization:** Full-text document search, custom tags, and folder categorization.
- [ ] **Bulk Import & Export:** Export all drafts as a structured ZIP file; bulk import Markdown folders and archives.
- [ ] **WYSIWYG Live-Preview Mode:** Optional CodeMirror-decoration mode that hides syntax markers on inactive lines; Markdown stays canonical.
- [x] **Obsidian Rendering:** `==highlight==` and `[[wiki-links]]` (with `|alias` and `#heading`) render in the Obsidian profile. `![[embeds]]` are not rendered.
- [ ] **Studio Polish:** Rename drafts, canonical URL and draft toggle in front matter.
- [ ] **Custom Checker Rules:** User-configurable linting rules and warnings for publication standards.

---

## Milestone 3: Accounts, Cloud Sync & Hosted Storage (Target: Q2 2027)

- [ ] **Activate Server Blueprint:** Transition `infra/` backend blueprints into `src/server/`.
- [ ] **Authentication System:** Secure cookie-based session management, password authentication (Argon2id/Scrypt), and GitHub OAuth.
- [ ] **Optimistic Cloud Sync:** Incremental sync engine with monotonic version counters and automatic conflict branch resolution.
- [ ] **Hosted Image Pipeline:** Drag-and-drop image upload to Cloudflare R2 (hosted) or local disk volume (Docker); auto-rewrites relative paths to CDN URLs.
- [ ] **Cloud Revision Log:** Immutable server-side document revision history.
- [ ] **Dual Deployment CI/CD:** GitHub Actions workflows for automated Cloudflare Workers deployment and multi-arch Docker image publication (`ghcr.io`).

---

## Milestone 4: Sharing & Multi-Platform Publishing (Target: Q3 2027)

- [ ] **Public Share Links:** Generate unguessable, read-only public web links (`/s/:slug`) with server-side rendered sanitized HTML.
- [ ] **Link Management:** Configurable expiration dates and one-click link revocation.
- [ ] **GitHub Publishing:** Direct commit and pull-request creation to user GitHub repositories using OAuth or personal access tokens.
- [ ] **Blogging Integrations:** One-click publishing to dev.to and Hashnode via API integrations.

---

## Milestone 5: Collaboration & Advanced AI (Future)

- [ ] **Real-Time Collaboration:** Peer-to-peer or server-coordinated collaborative editing using Yjs CRDTs.
- [ ] **Local AI Models:** Direct browser integration with local model runners (e.g., WebLLM or local Ollama instances via CORS).
- [ ] **Inline AI Writing Actions:** In-place selection rewriting, summarization, proofreading, and automated image alt-text generation.
