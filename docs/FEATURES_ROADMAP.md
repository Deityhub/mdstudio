# Full-System Feature Roadmap

Status: ✅ done · 🔜 next · 🗓 later. Each feature lists acceptance criteria (AC). Add vitest coverage for every rule.

## Phase 0 — Shipped ✅
Editor, strict preview, scroll sync, profiles + portability checker, import/drag-drop, rich paste → MD, exports (md, self-contained md, html copy, standalone html, normalize), front matter form, outline, stats, focus mode, IndexedDB library with autosave, image compression, BYOK AI (metadata + write), responsive phone/tablet/desktop, 31 tests.

## Phase 1 — Writer polish 🔜
1. **Dark mode toggle** (tokens exist). AC: persists per device; preview + editor + hljs themed.
2. **Command palette** (cmdk, Mod-P): every action reachable. AC: fuzzy search, keyboard only.
3. **Quick fixes in Checks**: one-click fix per rule (e.g. trailing-break → backslash, mixed bullets → normalize, wiki-link → standard link). AC: fix changes only the flagged range; undoable.
4. **Find & replace with regex**, word goal, session timer.
5. **Table editor** (grid UI → GFM table) and **link/image dialogs** with alt-text enforcement (checker rule: missing alt).
6. **More checks**: heading level skips, duplicate headings/anchors, broken internal anchors, missing alt text, overly long lines in tables, empty links.
7. **Paste-image from clipboard** and image manager panel (rename, delete unused, size).
8. **Spellcheck / grammar** toggle (browser native first).

## Phase 2 — Library & organization 🔜
1. **Full-text search** across drafts (MiniSearch in a worker).
2. **Folders/collections, tags, pin, status** (idea / draft / review / published).
3. **Trash** with 30-day restore.
4. **Version history**: snapshot on idle (every N minutes / significant change) and before AI apply / import; diff viewer; restore. Store `document_versions` in IndexedDB.
5. **Bulk import/export**: zip of `.md` + `images/` (JSZip); import a folder/zip preserving relative images.
6. **Templates**: blog post, release notes, README, tutorial; per-platform front matter (Astro, Hugo, Jekyll, Docusaurus, dev.to, Hashnode). AC: front matter keys match platform docs.

## Phase 3 — Publishing 🗓
Client-side by default with user tokens; server proxy only where CORS forces it.
1. **GitHub**: PAT or GitHub App; choose repo/branch/path; commit `.md` + images; optional PR. Track `publications`.
2. **dev.to** (Forem API), **Hashnode** (GraphQL), **Ghost** (Admin API, needs proxy), **WordPress** (REST + application password), **Medium** (import link only — API closed), **Substack** (copy HTML).
3. **Update vs create**: re-publish updates remote post by stored remote id.
4. **Per-target transforms preview**: show exactly what's sent.
AC: dry-run view; failures shown with fix; no token persisted unless user opts in to encrypted local storage.

## Phase 4 — Accounts, sync, sharing 🗓
1. Auth (email + Google/GitHub), optional — app still works signed out.
2. Sync engine implementing `documentStore` interface; offline queue; conflict → keep both + version.
3. Image hosting: upload to storage, rewrite refs to absolute URLs (fixes local-image warning).
4. Read-only share links; public published pages with SEO meta / RSS.
5. Collaboration: comments on ranges, suggestions mode; later real-time (Yjs + CodeMirror).
6. Workspaces/teams with roles (owner/editor/viewer) stored in a separate roles table.

## Phase 5 — Platform & quality 🗓
1. **PWA**: installable, offline, file-handling for `.md` (File System Access API save-in-place on desktop).
2. **Optional rendering extensions** behind explicit profile: math (KaTeX), Mermaid, callouts — always flagged as non-portable outside that profile.
3. **AI extras** (still BYOK): rewrite selection, summarize, SEO check, alt-text suggestions, translate, tone; diff review before apply; token/cost estimate; local models via OpenAI-compatible (Ollama).
4. **Accessibility**: WCAG AA contrast, full keyboard, screen-reader labels, reduced motion.
5. **i18n** of UI.
6. **E2E tests** (Playwright) for import → edit → export → publish; performance budget (100k-char doc types without lag; render in a worker if needed).
7. **Analytics (privacy-respecting, opt-in)** and error reporting.

## Definition of done (every feature)
Works on phone and desktop · uses tokens only · no preview-only transform · sanitized · tests added · `AGENTS.md` updated if architecture changes.
