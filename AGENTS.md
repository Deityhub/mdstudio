# Guidelines for AI Agents and Contributors

This document defines the strict engineering guidelines, architecture invariants, and coding conventions for **Markdown Studio**. All AI agents and human contributors must comply with these rules.

---

## 1. Core Architecture Invariants

1. **The Markdown text is the product:** Never introduce transforms to the live preview that the exported Markdown lacks (e.g., no auto-converting single newlines to `<br>`, no smart typography/curly quotes). The preview must strictly reflect CommonMark + GFM specifications.
2. **Unified AST pipeline:** All Markdown parsing, HTML rendering, AST linting, front matter extraction, and export transforms must reside exclusively in `src/lib/markdown.ts`. Do not introduce secondary Markdown parsers (like `marked` or `markdown-it`).
3. **HTML Sanitization:** All rendered Markdown HTML trees must pass through `rehype-sanitize` before DOM mounting. Two outputs are generated after sanitizing, by design: KaTeX math (loaded on demand, `trust: false`) and Mermaid SVG (`securityLevel: "strict"`); neither accepts HTML from the document. Never use raw `dangerouslySetInnerHTML` without passing the sanitized tree. The preview mounts only that sanitized string, through `patchHtml` (`src/lib/preview-dom.ts`), which replaces just the blocks that changed.
4. **Local-first persistence:** Draft documents must always be stored through `src/lib/documentStore.ts` (IndexedDB). Network or backend connectivity must remain strictly optional for writing, previewing, checking, and exporting.
5. **Client-only CodeMirror:** CodeMirror 6 components interact directly with browser DOM APIs and must only be rendered behind client-only boundaries (`ClientOnly` / dynamic import).
6. **BYOK AI Isolation:** AI writing assistants must connect directly from the user's browser to configured provider endpoints (OpenAI, Anthropic, Google Gemini, OpenAI-compatible). API keys must reside in session memory only, must never be persisted to `localStorage`, and must never be routed through an intermediary app server.
7. **Single Source of Truth:** `docs/SYSTEM_SPEC.md` is the authoritative specification for architecture, data models, and API surfaces. If a code change modifies an architecture pattern or schema, update `docs/SYSTEM_SPEC.md` in the exact same change.
8. **Markdown stays canonical in every editing mode:** Source, split and WYSIWYG modes edit the same text; a mode must never rewrite the document except through explicit user edits, and must never emit proprietary syntax. Math and Mermaid render only in profiles whose target platform supports them.
9. **Universal SQLite Backend:** Backend storage blueprints in `infra/` share a single Drizzle SQLite schema between Cloudflare D1 and self-hosted `better-sqlite3`. Never write database-engine-specific SQL queries.

---

## 2. Responsive UI & Design Rules

1. **Mobile-First Workspace:**
   - On screens `< 768px` (mobile), the studio must use a single-pane layout with an explicit toggle between **Editor** and **Preview**.
   - Auxiliary side panels (Checks, Outline, Front Matter) must render inside modal drawers / bottom sheets on mobile, while rendering in the collapsible side panel on desktop.
   - Core panel components must be shared between desktop and drawer views to prevent state divergence.
2. **Semantic Design Tokens:**
   - All colors must use semantic CSS tokens defined in `src/styles.css` (e.g., `bg-background`, `text-foreground`, `border-border`).
   - Never hardcode arbitrary hex, RGB, or utility color values (e.g., avoid `bg-[#1a1a2e]`, `text-white`, `bg-black`).
   - Both light and dark modes must maintain accessible contrast ratios (WCAG AA).

---

## 3. Coding Conventions & Best Practices

- **Framework:** TanStack Start v1 with React 19 and Vite 8.
- **Routing:** TanStack Router (`src/routes/*`). Never install or use `react-router-dom`. Route file additions must update `src/routeTree.gen.ts` automatically.
- **UI Components:** Built on Radix UI primitives via shadcn/ui.
- **Notifications:** Toast notifications must use `sonner`.
- **Validation:** All external data, front matter, and API boundaries must be validated with `zod`.
- **Testing:** Unit tests must be written with `vitest`. When modifying Markdown transformations or linting rules, run and expand `src/lib/markdown.test.ts`.