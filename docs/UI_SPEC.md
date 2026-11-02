# UI Spec — Current Screens

Screenshots in `docs/ui-screenshots/` are generated from the production build with `bun run screenshots`; rerun it after UI changes.
Items marked **(planned)** are specified but not built yet.

## 1. Landing `/` — `01_home_page.png`, `08_home_checker_demo.png`
Header: the `Logo` (two-pages mark plus the **md**studio wordmark, linking home), a light/dark toggle and a GitHub link (opens the repository in a new tab). Sections, top to bottom:
- **Hero:** "Write once. Render the same everywhere.", a short description, a primary "Start writing" button to `/editor`, a "Try the checker" anchor, and a decorative (`aria-hidden`) editor/preview mock. The page has exactly one `h1`.
- **How it works:** Write, Check, Export.
- **Live checker demo** (`#try-it`): the real portability engine, lazy-loaded behind `ClientOnly`. An editable sample, four target pills with live issue counts, and a clickable report that selects the offending line.
- **Features** (six cards), **target profiles** (four cards), **About** and **Who it's for**, an eight-question **FAQ** (native `details`, mirrored in FAQPage JSON-LD), a closing call to action, and a footer (copyright and author on the left, GitHub and Changelog on the right).
- **Theme:** an inline head script applies the saved or OS theme before first paint; the toggle also lives in the studio header.

## 1b. Guides `/guides` and `/guides/$slug`
Shared `SiteHeader` and `SiteFooter` (the footer links to Guides, the source and the changelog). The index lists every guide with its description and update date. A guide page has breadcrumbs, the title as the single `h1`, an "Updated … · N min read" line, an "On this page" list of section links, the article (`.md-preview`), a call to action to open the editor, and three related guides. Unknown slugs return a real 404. The home page links to the first three guides.

## 2. Studio desktop `/editor/$docId` — `02_editor_split_view.png`
- **Top bar, row 1:** drafts toggle · wordmark link and current title · Import dropdown (files or a ZIP, or a folder) · Install (only when the browser offers to install the app) · AI writer · Export dropdown (including Download all drafts as a ZIP) · Focus mode.
- **Top bar, row 2:** target-platform Select (GitHub, Strict CommonMark, dev.to / Hashnode, Obsidian; remembered per device) · view toggle (Editor / Split / Preview) · panel buttons on mid-size screens.
- **Export dropdown:** Download .md, Copy Markdown, Download self-contained .md and Copy self-contained Markdown (both enabled only when the draft has local images), Copy rendered HTML, Download standalone .html, and the "Normalize on export" switch.
- **Drafts sidebar:** New folder and New draft buttons, a search box, tag chips, and a folder tree. Search matches every word in a draft's title or text (a matching line is shown under the title); tag chips come from each draft's front matter `tags` and narrow the list when selected. Folders are labels kept in the library, not in the text: they list first (A to Z, collapsible, drafts indented beneath them with a guide line) and unfiled drafts follow. A draft moves by dragging it onto a folder, or onto the empty part of the list to take it out, and also from its three-dot menu (Rename, Move to folder, Duplicate, Delete), which is the route on touch screens. A folder's menu has Rename folder (an inline field with save and cancel; the drafts follow, and a name another folder already has is refused) and Delete folder: an empty one goes at once, one with drafts asks first because the drafts inside are deleted too. Delete opens a confirmation Dialog.
- **Formatting toolbar** (`role="toolbar"`, one tab stop, arrow keys / Home / End to move, Alt+F10 from the editor to enter it and Esc to leave; 16 buttons that wrap onto an extra row when the space runs out, never scroll: one row from 768px up (36px buttons), two rows on phones (40px touch targets)):
  undo, redo · heading style menu (Paragraph, H1-H6), bold, italic, strikethrough, inline code · link, image · quote, bulleted, numbered and task lists · code block menu, table menu, **Insert** menu.
  - Toggle tools show their state at the cursor (`aria-pressed`), and pressing one twice undoes it.
  - **Link** (Mod-K) and **Image** open dialogs. The link dialog edits the link under the caret; the image dialog requires alt text and accepts a URL or an uploaded file (stored in the draft).
  - **Code block** menu: fences the selection or current line with a language, switches the language inside a block, or removes the fence.
  - **Table** menu: Insert table (rows and columns dialog), and, inside a table, add or delete rows and columns, column alignment and Format table. Tab / Shift-Tab move between cells and Tab past the last cell adds a row.
  - **Insert** menu: Outdent / Indent · Footnote, Horizontal rule, Highlight, Inline math, Math block · Alert (Note, Tip, Important, Warning, Caution) · Diagram (Mermaid starters: flowchart, sequence, class, state, entity relationship, Gantt, pie) · HTML (collapsible section, keyboard key, subscript, superscript) · Keyboard shortcuts.
  - Every Insert-menu entry has an icon, and nested menus (Alert, Diagram, HTML) use icons too.
  - **Profile warnings:** a tool the selected platform won't render keeps working but carries a warning dot (buttons) or icon (menu items) and a hint such as "Renders on GitHub and Obsidian only". In menus the hint appears instantly on hover or keyboard focus, and the warning icon sits next to the submenu arrow. Raw HTML reads "may be removed or shown differently on other platforms": HTML is only partly supported (GitHub keeps `<details>`, `<kbd>`, `<sub>` and `<sup>`, for example) and each platform filters it differently. The same table drives the Checks panel, so the two never disagree.
  - Math and Mermaid tools insert the syntax, and the preview renders it for the GitHub and Obsidian profiles (see Preview below).
- **Editor** (CodeMirror, line numbers) and **Preview** (`.md-preview`) with two-way scroll sync (by source line, so both panes show the same text) and click-through sync: the block that holds the editor cursor gets a faint highlight in the preview, and clicking a block in the preview puts the editor cursor on its first source line (links, controls and text selections are left alone; from the preview-only view the click brings the editor back). The studio is a fixed shell: only the editor, preview and side panels scroll, never the page.
  - **Highlights:** `==text==` renders as a marker highlight for the Obsidian profile; other profiles show the text unchanged.
  - **Smooth updates:** the preview replaces only the blocks that changed, so images, math and diagrams don't flash while you type; a diagram being edited keeps its previous version on screen until the new one is ready.
  - **Math:** `$x$`, `$$…$$` and ```` ```math ```` render with KaTeX for GitHub and Obsidian; `$5 and $10` stays text. KaTeX loads the first time a document needs it.
  - **Diagrams:** ```` ```mermaid ```` blocks render as SVG for GitHub and Obsidian; an invalid diagram keeps its code and shows the error beneath it. Other profiles show the source, as their platforms do.
  - **Export:** "Copy rendered HTML" and "Download standalone .html" include the rendered math (the standalone file embeds the KaTeX stylesheet and fonts) and inline SVG diagrams.
- **Side panel buttons:** Checks (badge with the count of warnings and errors), Outline, Front matter, History (saved versions of the draft; opening one shows a side-by-side comparison with the current text and a Restore button).
- **Status bar:** words · reading time · image count · an "Offline" note when there is no connection · save status (Saving… / Saved in this browser / Not saved) · target platform.

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
- **At 1280px and above** the drafts sidebar and the panel column are docked. The drafts sidebar defaults to 288px and can be dragged (or resized with the arrow keys, Home and End; double-click resets) between 240px and 480px; the width is remembered. The Checks panel starts open only from 1536px; below that it stays closed until its button is clicked.

## Interactions
- Autosave 400ms after typing. Unsaved edits are flushed immediately when switching drafts, leaving the studio, hiding the tab or closing the page. A failed save shows "Not saved" and one toast.
- Drag-drop `.md` / `.markdown` / `.mdown` / `.txt` files to import them as new drafts; dropping images compresses them and inserts `![name](./images/name.jpg)`.
- Pasting rich HTML converts it to Markdown, with a toast that explains how to undo.
- Shortcuts (also listed in the app: Insert menu > Keyboard shortcuts, or Mod-/): Mod-B bold, Mod-I italic, Mod-E inline code, Mod-Shift-X strikethrough, Mod-Shift-H highlight, Mod-K link, Mod-Alt-0..6 paragraph and headings, Mod-Shift-7 numbered list, Mod-Shift-8 bulleted list, Mod-Shift-L task list, Mod-Shift-. quote, Tab / Shift-Tab nest and outdent list items, Mod-F search, Mod-Z / Shift-Mod-Z undo and redo, Mod-/ shortcuts list, Alt-F10 focus the toolbar. Enter continues lists and quotes.
