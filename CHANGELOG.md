# Changelog

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
