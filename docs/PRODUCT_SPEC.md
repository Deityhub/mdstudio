# Product Spec — Markdown Studio

## One-liner
Write, import, check and export Markdown that renders identically on GitHub, dev.to, Hashnode, Ghost, Obsidian, static-site generators and any CommonMark platform — with an optional AI co-writer using your own key.

## Origin
Rebuild of github.com/Deityhub/markdown-previewer. Problems in the original: React 16 class components, `marked` 0.6 with `breaks:true` + `smartypants:true` (preview lied about output), unsanitized `dangerouslySetInnerHTML` (XSS), no import/export/save, no tests.

## Target users
- Developer-bloggers publishing on dev.to / Hashnode / personal Astro/Next/Hugo sites.
- Technical writers maintaining docs in Git repos.
- Content teams drafting in Google Docs/Notion who need clean Markdown out.
- Note-takers moving between Obsidian and the web.

## Principles
1. **Portable by default.** Output is plain CommonMark + GFM. Anything non-portable is flagged, never silently rendered as if it would work.
2. **What you see is what ships.** Preview = exported bytes rendered by a spec-compliant parser.
3. **Local-first, no lock-in.** Works offline, no account required, data in the browser; export everything any time.
4. **Safe.** Sanitized preview; pasted HTML can't execute.
5. **Your AI, your key.** No vendor proxy; suggestions are reviewed before they change anything.
6. **Every device.** Fully usable on a phone.

## Use cases (must all be supported by the full system)
| # | Use case | Status |
|---|---|---|
| U1 | Write a blog post from scratch with live preview | Done |
| U2 | Import a `.md` file (open / drag-drop) and edit | Done |
| U3 | Paste Markdown or rich text (Docs/Notion/web → Markdown) | Done |
| U4 | Download `.md` / copy Markdown / copy HTML / standalone `.html` | Done |
| U5 | Self-contained `.md` with images embedded as base64 | Done |
| U6 | Check portability for a target platform | Done |
| U7 | Edit blog front matter (title, description, tags, date, slug, cover…) | Done |
| U8 | Manage many drafts locally (new, duplicate, delete, autosave; rename planned) | Done (rename planned) |
| U9 | AI: suggest title/description/tags; write a draft from a topic | Done |
| U10 | Use on phone | Done |
| U11 | Publish directly to GitHub repo / dev.to / Hashnode / Ghost / WordPress | Planned |
| U12 | Version history and restore | Planned |
| U13 | Collections, tags, search across drafts | Planned |
| U14 | Templates per platform (Astro, Hugo, Jekyll, Docusaurus, dev.to) | Planned |
| U15 | Accounts + cross-device sync, share links, collaboration | Planned |
| U16 | Image hosting / upload to absolute URLs | Planned |
| U17 | Offline PWA install | Planned |
| U18 | Bulk import/export (zip of .md + images) | Planned |
| U19 | Math (KaTeX) and Mermaid diagrams, shown only where the target platform renders them | Planned (next) |
| U20 | Complete formatting toolbar covering every supported Markdown construct | Planned (next) |
| U21 | Optional WYSIWYG live-preview mode with Markdown as the canonical text | Planned (M2) |

See `FEATURES_ROADMAP.md` for specs and acceptance criteria.

## Out of scope
Proprietary syntax extensions as the default output. WYSIWYG is *in* scope as an optional mode (U21): the Markdown text stays the document and the output is always standard Markdown, so a mode that hides Markdown as the only way to edit remains out of scope.
