# Architecture

## Stack
| Layer | Choice |
|---|---|
| Framework | TanStack Start v1, React 19, TypeScript, Vite |
| Routing | TanStack Router file routes (`src/routes`) |
| Styling | Tailwind CSS v4 via `src/styles.css` (`@theme inline`, OKLCH tokens) |
| UI kit | shadcn/ui (Radix) in `src/components/ui`, Vaul drawers, Sonner toasts, lucide-react icons |
| Editor | CodeMirror 6 (`@codemirror/lang-markdown`, language-data, search, history) |
| Markdown | unified: remark-parse, remark-gfm, remark-frontmatter, remark-rehype, rehype-highlight, rehype-sanitize, rehype-stringify; rehype-parse + rehype-remark + remark-stringify for HTML→MD; `yaml` for front matter |
| Storage | IndexedDB (raw, no wrapper library) |
| Tests | Vitest + Testing Library + jsdom |

## Routes
| Path | File | Purpose |
|---|---|---|
| `/` | `src/routes/index.tsx` | Landing page |
| `/editor` | `src/routes/editor.index.tsx` | Opens most recent draft, or creates one from the sample |
| `/editor/$docId` | `src/routes/editor.$docId.tsx` | Renders `<Studio docId />` |
| root | `src/routes/__root.tsx` | Head/meta, fonts (Fraunces, IBM Plex Sans, JetBrains Mono), `<Toaster/>` |

## Modules
### `src/lib/markdown.ts` (single home of all Markdown logic)
- `PROFILES`: `commonmark | github | devto | obsidian` — controls which features are considered portable.
- `renderMarkdown(text, profile, images)` → sanitized HTML string. Local `images/x.png` refs resolve to stored data URIs for preview only.
- `checkPortability(text, profile)` → `Issue[] {rule, severity, line, message, fix?}`. Rules: raw-html, data-image, local-image, mermaid, highlight (`==x==`), wiki-link (`[[x]]`), math (`$`/`$$`), container (`:::`), trailing-break (two spaces), mixed-bullets, gfm-table/task/strike (on commonmark), fence-lang (missing language).
- `getOutline`, `getStats` (words, chars, reading time), `deriveTitle`, `slugify`.
- `splitFrontMatter` / `joinFrontMatter` (YAML).
- `finalizeText` (LF endings, trailing newline), `normalizeMarkdown` (remark-stringify with consistent bullets/fences/emphasis).
- `embedImages(text, images)` → self-contained export.
- `htmlToMarkdown(html)` — paste conversion.
- `standaloneHtml(title, html)` — full HTML document with inline CSS.

### `src/lib/documentStore.ts`
```ts
interface MdDocument { id: string; title: string; content: string; images: Record<string,string /*dataURI*/>; createdAt: number; updatedAt: number }
```
`list / get / save / create / remove / duplicate` + `SAMPLE`. Treat as an interface: a future sync backend implements the same API.

### `src/lib/images.ts`
`compressImage(file)` (canvas, max 1600px, JPEG/WebP), `safeImageName`, `kb`.

### `src/lib/ai-provider.ts` / `src/lib/ai-writing.ts`
- Providers: `openai` (`/v1/chat/completions`), `anthropic` (`/v1/messages`, header `anthropic-dangerous-direct-browser-access: true`), `gemini` (`:streamGenerateContent?alt=sse`), `custom` (OpenAI-compatible base URL, HTTPS required).
- `buildProviderRequest`, `generateWithProvider` — streaming SSE parse, AbortSignal, refusal/length handling, no retry on 402/403.
- Modes: `metadata` (returns JSON `{title, description, tags[]}`) and `write` (streams Markdown).
- Keys: React state only. Never persisted.

### Components (`src/components/studio`)
- `Studio.tsx` — page orchestration: top bar, library, toolbar, editor/preview, side panel, status bar, autosave (400 ms debounce), import, paste, export, compact (<1024px) layout with drawers.
- `MarkdownEditor.tsx` — CodeMirror wrapper; `EditorHandle { wrap, linePrefix, insert, goToLine, scrollToRatio, focus }`; paste & drop handlers; Mod-B/I/K.
- `AiWriter.tsx` — provider connection + two tabs (Metadata, Write a topic).

## Invariants
See `AGENTS.md`. Key: no preview-only transforms; sanitize always; storage via documentStore only; CodeMirror client-only; AI BYOK and review-before-apply; tokens only.

## Tests (31 passing)
`src/lib/markdown.test.ts` (render: no `<br>` on single newline, no smart quotes, GFM, sanitizer strips `<script>`/`onerror`, checker rules, front matter round-trip, export bytes, paste conversion), `ai-provider.test.ts`, `ai-writing.test.ts`, `src/test/app-routing.test.tsx`.

## Future backend shape (for sync phase)
Tables: `documents(id, owner_id, title, content, front_matter jsonb, updated_at, deleted_at)`, `document_versions(id, document_id, content, created_at)`, `assets(id, owner_id, path, url, bytes)`, `publish_targets(id, owner_id, kind, config)`, `publications(id, document_id, target_id, remote_id, url, published_at)`. Row-level security by owner. Conflict strategy: last-writer-wins per doc + version snapshot on conflict.
