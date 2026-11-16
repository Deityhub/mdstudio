---
slug: markdown-line-breaks
title: Markdown Line Breaks and Paragraphs Explained
description: "How line breaks work in Markdown: paragraphs, soft breaks and hard breaks, why trailing spaces are fragile, and which method renders the same everywhere."
order: 5
published: 2026-11-02T00:00:00Z
updated: 2026-11-02T00:00:00Z
---

Line breaks are one of the most confusing parts of Markdown. You press Enter, and nothing happens in the preview, or everything runs together, or it works on one site and not another. The behavior is actually well defined, and once you know the rules you can pick the method that survives every platform.

## Paragraphs, soft breaks and hard breaks

Markdown distinguishes three things:

- **Paragraphs** are separated by one or more blank lines. This always works.
- **Soft breaks** are a single newline inside a paragraph. In CommonMark the newline is kept in the HTML source but displayed as a space, so the two lines flow together.
- **Hard breaks** force a visible line break inside a paragraph.

```md
First line of the paragraph
second line, still the same paragraph.

A new paragraph starts after a blank line.
```

In strict CommonMark, the two lines above render as one run of text.

## Three ways to write a hard break

1. **Two or more spaces at the end of the line.** This is the classic method, and it is valid CommonMark. It is also invisible, so editors and formatters often strip trailing spaces and silently remove your breaks.
2. **A backslash at the end of the line.** Valid CommonMark, visible in the source, and not removed by whitespace cleanup.
3. **An HTML break tag.** It works where HTML is allowed, but platforms that sanitize HTML may drop it.

```md
Roses are red,\
violets are blue.
```

Of the three, the backslash is the most portable choice, because it is part of the CommonMark specification and does not depend on invisible characters.

## Platforms that treat newlines differently

Some places, such as comment boxes on GitHub, treat a single newline as a visible break. Markdown files such as a README do not. Chat tools and some note apps do the same as comments. The result is that text you wrote with single newlines can look right in one place and run together in another.

If you want the same result everywhere, do not depend on soft breaks. Use blank lines to separate paragraphs and a backslash where you need a break inside one.

## Why a preview must not add breaks

Some editors turn every newline into a break to feel friendlier. That makes the preview lie: the text looks fine in the editor and runs together once published. A faithful preview shows the soft break exactly as the standard defines it, so you can see the problem before readers do.

## A short rule of thumb

- Separate paragraphs with a blank line.
- Use a backslash for a break inside a paragraph.
- Avoid trailing spaces and avoid depending on single newlines.
- Keep lines in lists and block quotes consistent, since each continuation line has its own rules.

## Catch fragile breaks automatically

[mdstudio](https://mdstudio.deityhub.com/editor) renders soft breaks the way CommonMark defines them, so single newlines do not turn into breaks in the preview. Its portability checker also flags trailing-space line breaks, so you can replace them before an editor strips them. The editor is open source and keeps your drafts in your browser, unless you want to sync it to the cloud. For related pitfalls, read the [portable Markdown guide](https://mdstudio.deityhub.com/guides/markdown-portability).
