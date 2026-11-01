# UI Spec — Current Screens

Screenshots in `docs/ui-screenshots/`.

## 1. Landing `/` — `01_home_page.png`
Header with Fraunces wordmark and "Open studio" button. Hero: headline about portable Markdown, subcopy, primary CTA to `/editor`. Mock editor/preview card. Feature grid (Portable output, Live preview, Import & paste, Export, Checks, Local drafts, AI with your key).

## 2. Studio desktop `/editor/$docId` — `02_editor_split_view.png`
- **Top bar:** library toggle · editable doc title · profile Select (CommonMark/GitHub/dev.to/Obsidian) · view toggle (Editor / Split / Preview) · Import · AI · Export dropdown · Focus.
- **Export dropdown:** Download .md, Copy Markdown, Download self-contained .md (base64 images), Copy HTML, Download .html, switch "Normalize on export".
- **Library sidebar:** New, list of drafts (title, relative updated time), per-item duplicate/delete.
- **Formatting toolbar:** H1–H3, bold, italic, strike, code, link, image, quote, bullet/number/task list, table, code block, hr.
- **Editor** (CodeMirror, line numbers) and **Preview** (`.md-preview`) with two-way scroll sync.
- **Side panel icons:** Checks (warning badge with count), Outline, Front matter.
- **Status bar:** words · reading time · images · profile · saved state.

## 3. Checks panel — `03_editor_checks_panel.png`
Grouped issues with severity icon, message, line number; click jumps editor to line.

## 4. Outline — `04_editor_outline_panel.png`
Indented heading list; click to jump.

## 5. Front matter — `04_editor_frontmatter_panel.png`
Fields: title, description, tags (comma), date, slug (auto from title), cover image, canonical URL, draft toggle. Writes YAML at top of document; editing text updates fields.

## 6. AI writer dialog — `05_ai_writer_dialog.png`
- Connection: provider select, base URL (custom), model id, API key (password), "Use this connection" / "Disconnect"; note that key is kept in memory only.
- Tab "Title, description & tags": source = current draft or pasted/imported text → Suggest → editable fields → Apply to current draft (front matter).
- Tab "Write a topic": topic + notes → streams Markdown → Stop / Open as new draft.
- Errors shown inline (auth, quota, network/CORS).

## 7. Mobile — `06_mobile_editor_view.png`, `07_mobile_preview_view.png`
Compact top bar with menu (library drawer), Edit/Preview toggle, overflow actions; scrollable toolbar; panels open in bottom drawers.

## Interactions
- Autosave 400ms after typing; drafts persist across reloads.
- Drag-drop `.md`/`.markdown`/`.txt` imports; dropping images compresses and inserts `![name](images/name.jpg)`.
- Paste of rich HTML converts to Markdown with a toast offering undo.
- Shortcuts: Mod-B, Mod-I, Mod-K, Mod-F (search), Mod-Z/Shift-Z.
