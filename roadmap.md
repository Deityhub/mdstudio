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
- [x] Cut v0.1.0 (v0.1.0 to v0.1.3 are released)

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

## Milestone 2: PWA, Local History & Advanced Library (complete)

- [x] **PWA Support:** Web app manifest, service worker caching, and offline installation. (Pages and files are kept as you use them online; the app badge is not done.)
- [x] **Local Document History:** Automatic periodic snapshots stored in IndexedDB with visual side-by-side diff and one-click restore.
- [x] **Library Organization:** Full-text document search, tags (from front matter) and folder categorization.
- [x] **Bulk Import & Export:** Export all drafts as a ZIP (folders and images kept); import ZIP archives, several files or a whole folder.
- [x] **Obsidian Rendering:** `==highlight==` and `[[wiki-links]]` (with `|alias` and `#heading`) render in the Obsidian profile. `![[embeds]]` are not rendered.
- [x] **Click-through Sync:** Click a block in the preview to put the editor cursor on its source line; the cursor's block gets a faint highlight in the preview.
- [x] **Studio Polish:** Rename drafts, canonical URL and draft toggle in front matter.
- [x] **Custom Checker Rules:** Turn built-in rules on or off and change their severity; publication standards (title and description length, required front matter, heading structure, word count, tags); your own text or regex rules; settings kept in the browser, shareable as JSON, and overridable per draft from front matter.

---

## Milestone 3: Accounts, Cloud Sync & Hosted Storage (complete)

- [x] **Activate Server Blueprint:** Transition `infra/` backend blueprints into `src/server/`.
- [x] **Password Reset:** "Forgot your password?" emails a one-hour, single-use link to a reset page; it never reveals whether an address has an account, ends every session, and counts as confirming the address.
- [x] **Account Protection:** Sign-up and sign-in limits, one account per inbox (aliases blocked), email confirmation before the cloud opens, sent on first cloud use (a chain of providers: Resend and Mailtrap, SMTP or a file outbox), optional Turnstile CAPTCHA.
- [x] **Authentication System:** Secure cookie-based session management, password authentication (PBKDF2-SHA256 through WebCrypto, because Workers has no Argon2id/Scrypt; done), and GitHub OAuth (done; sign-in dialog in the studio).
- [x] **Optimistic Cloud Sync:** Incremental sync engine with monotonic version counters and automatic conflict branch resolution. (Done: opt-in cloud drafts with a 5-draft limit, last-edit-wins with the replaced text kept in History, sign-out removes cloud drafts from the browser, footer status.)
- [x] **Hosted Image Pipeline (self-hosted installs; deliberately off on mdstudio.deityhub.com to keep it at $0):** Drag-and-drop image upload to Cloudflare R2 (hosted) or local disk volume (Docker); auto-rewrites relative paths to CDN URLs.
- [x] **Cloud Revision Log:** Immutable server-side document revision history (the last 10 versions per cloud draft by default, stored compressed; `MAX_REVISIONS` changes it).
- [x] **Dual Deployment CI/CD:** GitHub Actions workflows for automated Cloudflare Workers deployment and multi-arch Docker image publication (`ghcr.io`).

---

## Milestone 4: Sharing & Multi-Platform Publishing (Target: Q4 2026)

- [x] **Public Share Links:** Generate unguessable, read-only public web links (`/s/:slug`) with server-side rendered sanitized HTML. Scope: the published copy of a cloud draft, for review before publishing elsewhere (mdstudio is an editor to publish from, not a blogging platform). Done: server API, public page and editor controls.
- [x] **Link Management:** Every link expires (1 to 7 days, 4 by default), can be extended or shortened, and can be revoked in one click.
- [x] **Review Links:** Signed-in, verified readers can comment on a published copy, and a link can be limited to named people (free for now, behind one entitlement check so a paid plan can gate it). Server, the `/s/:slug` page (private-link sign-in, comments, replies, outdated marks) and the editor controls (who can open it, comments switch, invitations, the owner's Comments panel) are done.
- [ ] **GitHub Publishing:** Direct commit and pull-request creation to user GitHub repositories using OAuth or personal access tokens.
- [ ] **Blogging Integrations:** One-click publishing to dev.to and Hashnode via API integrations.

---

## Milestone 5: Collaboration & Advanced AI (Future)

- [ ] **Edit access through a link:** Letting people named on a link edit the draft. Needs the collaboration engine below, so it waits for it.
- [ ] **Real-Time Collaboration:** Peer-to-peer or server-coordinated collaborative editing using Yjs CRDTs.
- [ ] **Local AI Models:** Direct browser integration with local model runners (e.g., WebLLM or local Ollama instances via CORS).
- [ ] **Inline AI Writing Actions:** In-place selection rewriting, summarization, proofreading, and automated image alt-text generation.

## Decided not to build (for now)

Deferred because they add abuse or cost risk for little gain on the editor path: **view counts** (a database write per public view could use up the free plan's daily write allowance; revisit with sampling or Cloudflare analytics), **custom slugs** (squatting, impersonation, and reused addresses once links expire) and **embeds** (a blogging feature, and an embed dies when its link expires).
