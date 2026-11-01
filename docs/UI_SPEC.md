# UI Spec — Current Screens

Screenshots in `docs/ui-screenshots/` (taken before the home page redesign and the toolbar work; refresh them when those land).
Items marked **(planned)** are specified but not built yet.

## 1. Landing `/` — `01_home_page.png`
Header with the Fraunces wordmark and an "Open editor" button. Hero: "Write once. Render the same everywhere.", subcopy, primary CTA to `/editor`, and a mock editor/preview card. A four-item feature grid (what you see is what ships, portability checks, import/paste/drop, clean export). **(planned)** Full rewrite with a convincing story, live checker demo, FAQ and SEO content in the home redesign PR.

## 2. Studio desktop `/editor/$docId` — `02_editor_split_view.png`
- **Top bar, row 1:** drafts toggle · wordmark link and current title · Import · AI writer · Export dropdown · Focus mode.
- **Top bar, row 2:** target-platform Select (GitHub, Strict CommonMark, dev.to / Hashnode, Obsidian; remembered per device) · view toggle (Editor / Split / Preview) · panel buttons on mid-size screens.
- **Export dropdown:** Download .md, Copy Markdown, Download self-contained .md and Copy self-contained Markdown (both enabled only when the draft has local images), Copy rendered HTML, Download standalone .html, and the "Normalize on export" switch.
- **Drafts sidebar:** New draft, list of drafts (title, updated date), per-item Duplicate and Delete. Delete opens a confirmation Dialog. Renaming is **(planned)**: titles currently come from front matter or the first heading.
- **Formatting toolbar** (`role="toolbar"`, grouped): undo/redo · heading style menu (Paragraph, H1-H6), bold, italic, strikethrough, inline code · link, image, footnote, horizontal rule · quote, bulleted, numbered and task lists, outdent, indent · code block language menu, insert table, table options, alert menu. Toggle tools show their state at the cursor (`aria-pressed`) and pressing one twice undoes it. Link (Mod-K) and image open dialogs: the link dialog edits the link under the caret, the image dialog requires alt text and accepts a URL or an uploaded file (stored in the draft). The footnote tool adds `[^n]` and a definition at the end of the document with the caret in it. The code block menu fences the selection or current line with a language, switches the language inside a block, or removes the fence. The table dialog (body rows and columns) inserts an aligned GFM table with the first header cell selected. Inside a table, Tab and Shift-Tab move between cells (Tab past the last cell adds a row) and the Table options menu adds or deletes rows and columns, sets column alignment and formats the table. The Alert menu turns the selected lines into a GitHub alert (`> [!NOTE]` and friends), switches the kind inside an alert, or removes the marker when the same kind is chosen again; the preview renders alerts for the GitHub and Obsidian profiles. **(planned)** Math and diagrams, HTML extras, an overflow menu on small screens, and warnings on tools the selected profile can't render.
- **Editor** (CodeMirror, line numbers) and **Preview** (`.md-preview`) with two-way scroll sync.
- **Side panel buttons:** Checks (badge with the count of warnings and errors), Outline, Front matter.
- **Status bar:** words · reading time · image count · save status (Saving… / Saved in this browser / Not saved) · target platform.

## 3. Checks panel — `03_editor_checks_panel.png`
One card per issue, sorted by line: severity icon, `L<line>` and a one-sentence message. Clicking a card switches to the editor and jumps to that line. Rules are listed in `SYSTEM_SPEC.md` §4.1.

## 4. Outline — `04_editor_outline_panel.png`
Indented heading list; clicking jumps to the heading's line.

## 5. Front matter — `04_editor_frontmatter_panel.png`
Fields: title, slug, date, cover image URL, description, tags (comma separated). Writes the YAML block at the top of the document. "Add front matter" creates it and "Remove front matter" deletes it. **(planned)** Canonical URL and a draft toggle.

## 6. AI writer dialog — `05_ai_writer_dialog.png`
- **Connection:** provider Select (OpenAI, Anthropic, Google Gemini, custom/OpenAI-compatible), base URL (custom only), model ID, API key, "Use this connection" and "Disconnect". The key stays in memory until the draft closes or the page reloads, and requests go directly to the provider.
- **Tab "Title, description & tags":** the current draft (editable, or uploaded) → "Suggest metadata" → editable suggested fields → apply to the draft's front matter.
- **Tab "Write a topic":** topic and notes → "Generate draft" streams Markdown → Stop / Open as new draft (never overwrites the current draft).
- Errors are shown inline (auth, quota, network/CORS).

## 7. Small screens — `06_mobile_editor_view.png`, `07_mobile_preview_view.png`
- **Below 768px** the studio is a single pane: the view toggle offers Editor and Preview only, and the panel buttons move to a bottom navigation bar.
- **Below 1280px** the drafts list opens as a left sheet and Checks, Outline and Front matter open as a right sheet, sharing the same panel components as the desktop sidebars.
- **At 1280px and above** the drafts sidebar and the panel column are docked.

## Interactions
- Autosave 400ms after typing. Unsaved edits are flushed immediately when switching drafts, leaving the studio, hiding the tab or closing the page. A failed save shows "Not saved" and one toast.
- Drag-drop `.md` / `.markdown` / `.mdown` / `.txt` files to import them as new drafts; dropping images compresses them and inserts `![name](./images/name.jpg)`.
- Pasting rich HTML converts it to Markdown, with a toast that explains how to undo.
- Shortcuts: Mod-B bold, Mod-I italic, Mod-E inline code, Mod-Shift-X strikethrough, Mod-Shift-H highlight, Mod-K link, Mod-Alt-0..6 paragraph and headings, Mod-Shift-7 numbered list, Mod-Shift-8 bulleted list, Mod-Shift-L task list, Mod-Shift-. quote, Tab / Shift-Tab nest and outdent list items, Mod-F search, Mod-Z / Shift-Mod-Z undo and redo. Enter continues lists and quotes.
