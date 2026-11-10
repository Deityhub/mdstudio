# Full-System Feature Roadmap

Status: ✅ done · 🔜 next · 🗓 later. Each feature lists acceptance criteria (AC). Add vitest coverage for every rule.

## Phase 0 — Shipped ✅
Editor, strict preview, scroll sync, profiles + portability checker, import/drag-drop, rich paste → MD, exports (md, self-contained md, html copy, standalone html, normalize), front matter form, outline, stats, focus mode, IndexedDB library with autosave, image compression, BYOK AI (metadata + write), responsive phone/tablet/desktop, 31 tests.

## Phase 1 — Writer polish 🔜
1. ✅ **Dark mode toggle** (tokens exist). AC: persists per device; preview + editor + hljs themed.
2. **Command palette** (cmdk, Mod-P): every action reachable. AC: fuzzy search, keyboard only.
3. **Quick fixes in Checks**: one-click fix per rule (e.g. trailing-break → backslash, mixed bullets → normalize, wiki-link → standard link). AC: fix changes only the flagged range; undoable.
4. **Find & replace with regex**, word goal, session timer.
5. **Table editor** (grid UI → GFM table) and **link/image dialogs** with alt-text enforcement (checker rule: missing alt). Done: link and image dialogs, the missing-alt rule, a table dialog and table cell commands. Not done: a grid UI.
6. **More checks**: heading level skips, duplicate headings/anchors, broken internal anchors, missing alt text, overly long lines in tables, empty links. Done: heading level skips and a single H1 (the heading-structure standard) and missing alt text. Not done: duplicate headings, broken anchors, empty links, long table lines.
7. **Paste-image from clipboard** and image manager panel (rename, delete unused, size). Done: paste and drop with compression. Not done: the image manager panel.
8. **Spellcheck / grammar** toggle (browser native first).
9. ✅ **Math (KaTeX) and Mermaid**, profile-gated: rendered only where the target platform renders them, flagged elsewhere. AC: sanitize before KaTeX (`trust: false`), Mermaid `securityLevel: "strict"` and lazy-loaded, KaTeX CSS/fonts self-hosted, standalone HTML export embeds both.
10. ✅ **Complete formatting toolbar**: every Markdown/GFM construct and profile extension (headings 1-6, emphasis, code, links, images, quotes, lists, task lists, tables, rules, footnotes, math, diagrams, alerts). AC: grouped, overflow menu on phones, shortcuts in tooltips, tools flagged when the profile can't render them, edit actions are pure tested functions.
11. ✅ **Obsidian profile rendering**: `==highlight==` renders as a marker (done); render `[[wiki-links]]` in the Obsidian profile so the preview matches the platform.
12. ✅ **Studio polish**: rename draft, canonical URL and draft toggle in front matter.
13. ✅ **Custom checker rules**: turn built-in rules on or off and change their severity, publication standards, your own text or regex rules, shareable as JSON and overridable per draft.
14. ✅ **Click-through sync**: click a block in the preview to jump to its source line, and scroll sync by line.

## Phase 2 — Library & organization 🔜
1. ✅ **Full-text search** across drafts (done in memory with tag filtering; no search index or worker was needed).
2. **Folders/collections, tags, pin, status** (idea / draft / review / published). Done: folders (drag and drop, rename, delete) and tags from front matter. Not done: pin and status.
3. **Trash** with 30-day restore.
4. ✅ **Version history**: snapshot every few minutes, on demand and before a restore; side-by-side diff; restore. (Snapshots before AI apply and import are not taken.)
5. ✅ **Bulk import/export**: zip of `.md` + `images/` (own ZIP reader and writer, no JSZip); import a folder or ZIP preserving relative images.
6. **Templates**: blog post, release notes, README, tutorial; per-platform front matter (Astro, Hugo, Jekyll, Docusaurus, dev.to, Hashnode). AC: front matter keys match platform docs.

## Phase 3 — Publishing 🗓
Client-side by default with user tokens; server proxy only where CORS forces it.
1. **GitHub**: PAT or GitHub App; choose repo/branch/path; commit `.md` + images; optional PR. Track `publications`.
2. **Other platforms**: not planned. Only GitHub publishing is supported for now.
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
1. **PWA**: installable, offline, file-handling for `.md` (File System Access API save-in-place on desktop). Done: installable and offline. Not done: file handling.
2. **Optional rendering extensions** behind explicit profile: callouts (GitHub alerts) — always flagged as non-portable outside that profile. Math (KaTeX) and Mermaid moved up: see Phase 1, item 9.
3. **AI extras** (still BYOK): rewrite selection, summarize, SEO check, alt-text suggestions, translate, tone; diff review before apply; token/cost estimate; local models via OpenAI-compatible (Ollama).
4. **Accessibility**: WCAG AA contrast, full keyboard, screen-reader labels, reduced motion.
5. **i18n** of UI.
6. **E2E tests** (Playwright) for import → edit → export → publish; performance budget (100k-char doc types without lag; render in a worker if needed).
7. **Analytics (privacy-respecting, opt-in)** and error reporting.

## Definition of done (every feature)
Works on phone and desktop · uses tokens only · no preview-only transform · sanitized · tests added · `AGENTS.md` updated if architecture changes.
