# Changelog

## 0.6.0 (2026-11-13)

### Features

- **collab:** warn about images only one browser has in a live draft
- **collab:** comments and suggestions on the words of a live draft
- **collab:** open an invited draft from a link, and see invitations at once
- **collab:** share a draft for editing and open drafts shared with you
- **collab:** edit a live draft in the editor, online and offline
- **collab:** the room core and server wiring for editing a draft together (#95)
- **realtime:** live sync, review comments and session ends over the socket (#94)
- **realtime:** a WebSocket channel for live updates, on Durable Objects and in process (#93)
- **auth:** sign in and sign up with Google, and link accounts by email (#89)

### Fixes

- **collab:** mark an unshared image whenever the preview is drawn
- **collab:** whole-text changes in a live draft are part of Undo
- keep a draft's name when it goes live or stops, and stop the page hanging while typing
- **collab:** someone removed while offline finds out when the network returns
- **collab:** the owner opening a draft's link gets their own draft
- **collab:** a closing connection no longer stops others getting an edit

## 0.5.0 (2026-11-10)

### Features

- account limits, admin role and admin dashboard (#86)
- add a system option to the theme button (#85)
- keep AI integrations in the account (#84)
- fix flagged checks and alt text with AI, test connection, presets (#83)
- inline AI actions and saved AI integrations

## 0.4.0 (2026-11-08)

### Features

- publish to GitHub from the editor
- publish a cloud draft to GitHub
- connect a GitHub account for publishing
- select-to-comment on shared pages, richer invitations, no background share requests
- review link controls in the editor
- private-link sign-in and comments on the share page
- comments and named-people access for share links, server side
- share a cloud draft from the editor
- a public page for each share link
- share a cloud draft as a public read-only link that expires

### Fixes

- ensure full width for header in SiteHeader component

## 0.3.1 (2026-11-05)

### Features

- show the example only on a first visit, blank editor after, and busy states for buttons

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
