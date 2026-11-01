# Design System — "Warm Paper"

Direction: a calm, editorial writing desk. Warm off-white paper, ink-brown text, a single terracotta accent. Serif display for character, humanist sans for UI, mono for code. Avoid generic purple gradients and Inter/Poppins.

Source of truth: `src/styles.css`. All colors are OKLCH CSS variables mapped to Tailwind via `@theme inline`. Components must use semantic classes (`bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`…) — never raw colors.

## Typography
| Role | Font | Tailwind |
|---|---|---|
| Display / headings / logo | Fraunces (serif) | `font-display` |
| UI & body | IBM Plex Sans | `font-sans` |
| Editor, code, kbd | JetBrains Mono | `font-mono` |
Self-hosted as latin-subset variable woff2 files in `public/fonts/` (SIL OFL 1.1, licenses alongside), declared with `@font-face` in `src/styles.css`; Fraunces and IBM Plex Sans are preloaded in `__root.tsx`. Characters outside latin fall back to the system font. Scale: UI 13–14px, editor 14–15px / 1.7, preview body 16px / 1.7, H1 2em display.

## Color tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| background | oklch(0.975 0.012 85) | oklch(0.19 0.012 60) | App canvas |
| foreground | oklch(0.22 0.02 60) | oklch(0.93 0.012 80) | Text |
| card / popover | oklch(0.99 0.008 85) | oklch(0.23 0.012 60) | Surfaces |
| paper | oklch(0.995 0.005 85) | oklch(0.215 0.012 60) | Editor & preview sheet |
| primary | oklch(0.52 0.15 38) terracotta | oklch(0.7 0.14 45) | Main actions, focus ring |
| secondary | oklch(0.935 0.018 80) | oklch(0.28 0.012 60) | Active toggles |
| muted / muted-foreground | 0.945 / 0.5 | 0.26 / 0.68 | Meta text, status bar |
| accent | oklch(0.92 0.03 70) | oklch(0.3 0.02 55) | Hover |
| destructive | oklch(0.55 0.2 27) | oklch(0.68 0.18 25) | Errors, delete |
| warning | oklch(0.72 0.14 75) | oklch(0.78 0.13 80) | Portability warnings, badge |
| info | oklch(0.55 0.08 240) | oklch(0.72 0.09 240) | Hints |
| border / input | oklch(0.88 0.02 80) | oklch(0.32 0.012 60) | Hairlines |
| code-bg | oklch(0.955 0.012 82) | oklch(0.26 0.012 60) | Code blocks |
| sidebar-* | ~0.955 warm | ~0.21 | Library sidebar |
Syntax: `--hl-keyword` (red), `--hl-string` (green), `--hl-title` (violet), `--hl-number` (blue), `--hl-comment` (muted). Used by `.hljs-*` and CodeMirror `.tok-*` classes.

Radius: `--radius: 0.5rem` (sm/md/lg/xl derived). Shadows: minimal, soft; prefer borders.

## Components (shadcn variants)
- Button: `default` (primary), `secondary` (active toggle), `ghost` (toolbar icons, 40×40 touch targets on mobile), `outline`, `destructive`.
- Dialog (AI writer, delete confirmation), Sheet (library and panels below 1280px), DropdownMenu (export), Select (profile, provider), Tabs, Tooltip, Input/Textarea/Label, Switch (normalize), Sonner toasts. Only these shadcn components are kept in `src/components/ui/`; add new ones when a feature needs them.
- Icons: lucide-react, 16px in toolbars.

## Preview styling (`.md-preview`)
GitHub-like prose on `bg-paper`: max-width ~72ch, headings in Fraunces, links primary with underline, blockquote left border `border`, tables bordered with zebra `muted`, code `code-bg` + mono, task-list checkboxes, images max-width 100%.

## Layout & breakpoints
- `< 768px` phone: single pane (Editor / Preview toggle), horizontally scrollable toolbar, panel buttons in a bottom nav, library and panels in sheets, condensed status bar.
- `768-1279px`: split view with scroll sync; the library opens as a left sheet and the panels as a right sheet.
- `>= 1280px` desktop: docked library sidebar (about 240px, collapsible) | editor | preview (scroll-synced) | docked side panel (about 288px, Checks/Outline/Front matter).
- Focus mode: hides chrome, centers the editor.
- Touch targets >= 40px; dialogs scroll within the viewport.

## Voice
Plain, helpful, writer-first. Explain portability issues in one sentence with a fix ("`==highlight==` isn't standard; use `**bold**` or `<mark>` for GitHub").
