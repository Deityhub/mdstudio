# Changelog

## 0.3.1 (2026-11-05)

### Fixes

- retry a confirmation email that failed to send, and design the account emails
- upload Worker secrets with the built config

## 0.3.0 (2026-11-05)

### Features

- keep the drafts and panel buttons in focus mode and open them as panels
- show the release next to the logo and move focus mode into the toolbar
- keep a compressed version history of cloud drafts on the server
- password reset by emailed link
- send mail through a chain of providers with Resend and Mailtrap
- sign-up limits, one account per inbox, and email confirmation before the cloud
- host images for cloud drafts on self-hosted installs, and warn when a plain export has local images
- opt-in cloud drafts with a 5-draft limit, last-edit-wins sync and sign-out cleanup
- server push and pull API for document sync
- GitHub sign-in and an account dialog in the studio
- password sign-up, login and sliding cookie sessions with a 5-day cap
- open the D1 or SQLite database from the server and report it on /api/health (#48)

## 0.2.0 (2026-11-03)

### Features

- configurable checker rules, publication standards and your own rules
- click-through sync and line-based scroll sync between editor and preview
- offline support and installable PWA
- bulk import and export of drafts, and rename folder
- library search, tag filters and folders
- local document history with compare and restore
- studio polish with draft rename, front matter fields and a resizable library
- render Obsidian wiki-links in the Obsidian profile

### Fixes

- stop the bundle guard from matching library names inside content hashes

## 0.1.3 (2026-11-02)

### Fixes

- add padding to katex display to fix clipping

## 0.1.2 (2026-11-02)

### Fixes

- replace the leftover favicon.ico with the mdstudio mark

### Performance

- keep Mermaid and KaTeX out of the Cloudflare Worker bundle

## 0.1.1 (2026-11-02)

### Features

- deploy a preview of every pull request into dev to Cloudflare

### Fixes

- deploy to Cloudflare with wrangler-action v4

## 0.1.0 (2026-11-02)

### Features

- add Markdown guides with structured data and sitemap entries
- redesign the home page with a live checker demo, dark mode and a reusable logo
- add SEO foundation and rename the product to mdstudio
- only run ci workflow for pull request
- add release automation with changelog, Docker images and Cloudflare deploy
- add infra blueprints for Cloudflare and self-hosted Docker
- render math and Mermaid, highlights, and a smoother preview
- profile-aware toolbar with Insert menu, wrapping layout and keyboard navigation
- add tables with cell navigation and GitHub alerts
- add link and image dialogs, footnotes, rules and code block menu
- add pure editing commands and grouped toolbar with toggle state

### Fixes

- render Mermaid diagrams in a dark theme when the page is dark
- switch to single-pane layout below 768px
- harden autosave and portability checker
- self-host fonts and add nonce-based CSP
