# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository. Include steps to reproduce and the
version or commit you tested. You will get a reply within a few days.

## Scope

mdstudio renders untrusted Markdown, so reports about HTML sanitization, XSS, the
Content-Security-Policy, Mermaid or KaTeX rendering, and exported documents are especially welcome.
API keys for the AI writer are held in session memory only and must never be persisted or proxied.

## Supported versions

Only the latest release receives fixes.
