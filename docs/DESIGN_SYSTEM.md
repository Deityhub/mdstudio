# Design System — "Warm Paper"

Direction: a calm, editorial writing desk. Warm off-white paper, ink-brown text, a single terracotta accent. Serif display for character, humanist sans for UI, mono for code. Avoid generic purple gradients and Inter/Poppins.

Source of truth: `src/styles.css`. All colors are OKLCH CSS variables mapped to Tailwind via `@theme inline`. Components must use semantic classes (`bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`…) — never raw colors.

## Typography

| Role                                                                                                                                                                                                                                                                                                                                                      | Font             | Tailwind       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------- |
| Display / headings / logo                                                                                                                                                                                                                                                                                                                                 | Fraunces (serif) | `font-display` |
| UI & body                                                                                                                                                                                                                                                                                                                                                 | IBM Plex Sans    | `font-sans`    |
| Editor, code, kbd                                                                                                                                                                                                                                                                                                                                         | JetBrains Mono   | `font-mono`    |
| Self-hosted as latin-subset variable woff2 files in `public/fonts/` (SIL OFL 1.1, licenses alongside), declared with `@font-face` in `src/styles.css`; Fraunces and IBM Plex Sans are preloaded in `__root.tsx`. Characters outside latin fall back to the system font. Scale: UI 13–14px, editor 14–15px / 1.7, preview body 16px / 1.7, H1 2em display. |

## Color tokens

| Token                                                                                                                                                                        | Light                          | Dark                  | Use                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------- | --------------------------- |
| background                                                                                                                                                                   | oklch(0.975 0.012 85)          | oklch(0.19 0.012 60)  | App canvas                  |
| foreground                                                                                                                                                                   | oklch(0.22 0.02 60)            | oklch(0.93 0.012 80)  | Text                        |
| card / popover                                                                                                                                                               | oklch(0.99 0.008 85)           | oklch(0.23 0.012 60)  | Surfaces                    |
| paper                                                                                                                                                                        | oklch(0.995 0.005 85)          | oklch(0.215 0.012 60) | Editor & preview sheet      |
| primary                                                                                                                                                                      | oklch(0.52 0.15 38) terracotta | oklch(0.7 0.14 45)    | Main actions, focus ring    |
| secondary                                                                                                                                                                    | oklch(0.935 0.018 80)          | oklch(0.28 0.012 60)  | Active toggles              |
| muted / muted-foreground                                                                                                                                                     | 0.945 / 0.5                    | 0.26 / 0.68           | Meta text, status bar       |
| accent                                                                                                                                                                       | oklch(0.92 0.03 70)            | oklch(0.3 0.02 55)    | Hover                       |
| destructive                                                                                                                                                                  | oklch(0.55 0.2 27)             | oklch(0.68 0.18 25)   | Errors, delete              |
| warning                                                                                                                                                                      | oklch(0.72 0.14 75)            | oklch(0.78 0.13 80)   | Portability warnings, badge |
| info                                                                                                                                                                         | oklch(0.55 0.08 240)           | oklch(0.72 0.09 240)  | Hints                       |
| border / input                                                                                                                                                               | oklch(0.88 0.02 80)            | oklch(0.32 0.012 60)  | Hairlines                   |
| code-bg                                                                                                                                                                      | oklch(0.955 0.012 82)          | oklch(0.26 0.012 60)  | Code blocks                 |
| sidebar-*                                                                                                                                                                    | ~0.955 warm                    | ~0.21                 | Library sidebar             |
| Syntax: `--hl-keyword` (red), `--hl-string` (green), `--hl-title` (violet), `--hl-number` (blue), `--hl-comment` (muted). Used by `.hljs-*` and CodeMirror `.tok-*` classes. |

Radius: `--radius: 0.5rem` (sm/md/lg/xl derived). Shadows: minimal, soft; prefer borders.

## Components (shadcn variants)

- Button: `default` (primary), `secondary` (active toggle), `ghost` (toolbar icons, 40×40 touch targets on mobile), `outline`, `destructive`.
- Dialog (AI writer, delete confirmation), Sheet (library and panels below 1280px), DropdownMenu (export), Select (profile, provider), Tabs, Tooltip, Input/Textarea/Label, Switch (normalize; 44×24px, the accent track when on and a muted track when off, a knob in its own colours that never takes the page background), Sonner toasts. Only these shadcn components are kept in `src/components/ui/`; add new ones when a feature needs them.
- Icons: lucide-react, 16px in toolbars.

## Page frames

- **Public pages** (`SiteHeader`, `SiteFooter`, `SitePieces`): content up to 1200px; tiles are `border bg-muted`, chips are small labels (`accent`, `line`, `warn`), a call to action is a band on `bg-accent`. Reading pages (guides, legal) use `DocLayout`: a sticky contents column on the left from 1024px (hidden below it, where the text is centred), with the section being read marked as the page scrolls.
- **App pages** (`AppShell`: Settings, Admin): a top bar on the page background with the same hairline as the public header (its contents the width of the page's content; **Back to the editor** is the primary button, the account a ghost icon), a menu of sections on the left (the active one on `bg-accent` with the primary along its left edge; chips on phones), a title with a line under it, and rows grouped in bordered cards on `bg-card` (a light lift off the page; the controls inside are outlines on the card's own colour, not darker wells).
- **Standalone screens** (`Standalone`: private-link gate, invitation, password reset, 404, load error): a bar like the app pages' (page background, primary Open the editor), and a centred bordered `bg-card` box.

## Buttons and conventions

Every enabled button, tab, menu item and switch shows a pointer cursor (a base rule in `src/styles.css`). `Button` has two busy states: `pending` (disabled, `aria-busy`) and `loading` (the same plus a spinner, which replaces the icon on an icon button). A button that starts a request shows it: the button that was pressed uses `loading` (disabled, with a spinner; on an icon button the spinner replaces the icon) for as long as its action runs, whether it is the main action of a form or dialog or a small action in a row (sign-in and sign-up, the reset links, the confirmation email, the cloud picker, publishing, saving a plan, account, limits or server settings, testing an AI connection, refreshing models, opening a generated draft, the account search, unlinking a sign-in, disconnecting GitHub, deleting a hosted image, resolving or deleting a comment, removing a person, saving or restoring a version, and the two-press admin buttons). The other buttons of the same dialog use `pending` (disabled, no spinner) while it runs, so nothing can be pressed twice. `disabled` alone is for a button that cannot be used yet (an empty field, a limit reached), never for one that is working; a test (`loading-rules.test.ts`) fails on a button disabled by a busy state without `loading` or `pending`, and on a hand-made spinner. The label of a button, menu item or command never ends in an ellipsis ("Edit rules", not "Edit rules…"); the ellipsis is kept only for text that says something is in progress ("Loading…", "Saving…"). Every dropdown choice uses the shared `Select` component (the target platform in the top bar and in Settings, a rule's severity, the AI provider and integration), never a native `<select>`.

## Page loader

`PageLoader` is what a page shows while it loads (the router's default pending screen, Settings and Admin while the account loads, and the editor's first open): the logo mark drawn stroke by stroke on a loop with the name under it, and still when reduced motion is on. The in-page `Loading…` lines stay for small panels that load inside a page.

## Preview styling (`.md-preview`)

GitHub-like prose on `bg-paper`: max-width ~72ch, headings in Fraunces, links primary with underline, blockquote left border `border`, tables bordered with zebra `muted`, code `code-bg` + mono, task-list checkboxes, images max-width 100%.

## Layout & breakpoints

- `< 768px` phone: single pane (Editor / Preview toggle), horizontally scrollable toolbar, panel buttons in a bottom nav, library and panels in sheets, condensed status bar.
- `768-1279px`: split view with scroll sync; the library and the panels open as a sheet from the left.
- `>= 1280px` desktop: panel buttons (48px) | one docked pane (288px, resizable; the library or the chosen panel) | editor | preview (scroll-synced). Nothing docks on the right.
- Focus mode: hides chrome, centers the editor.
- Touch targets >= 40px on phones (toolbar buttons shrink to 36px from 768px up, where a pointer is the norm); dialogs scroll within the viewport.

## Voice

Plain, helpful, writer-first. Explain portability issues in one sentence with a fix ("`==highlight==` isn't standard; use `**bold**` or `<mark>` for GitHub").
