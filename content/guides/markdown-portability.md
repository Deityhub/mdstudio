---
slug: markdown-portability
title: "Portable Markdown: Why It Renders Differently Everywhere"
description: Why the same Markdown looks different on GitHub, blogging platforms and Obsidian, and a checklist for making your writing render the same on every platform.
order: 1
published: 2026-11-02T08:42:00Z
updated: 2026-11-16T09:14:00Z
---

Markdown looks like one language, but it is really a family of dialects. The same file can render perfectly on GitHub, lose a diagram on a blogging platform and print raw brackets in a static site generator. This guide explains why that happens and gives you a checklist for writing Markdown that renders the same everywhere.

## Why the same Markdown renders differently

The original Markdown description left many details open, so every tool made its own choices. [CommonMark](https://commonmark.org) later wrote a precise specification, and [GitHub Flavored Markdown](https://github.github.com/gfm/) (GFM) extended it with tables, task lists and strikethrough. Since then, platforms have layered their own features on top:

- GitHub adds alerts, math, Mermaid diagrams and footnotes.
- Obsidian adds wiki-links, embeds, highlights and callouts.
- Blogging platforms add their own front matter, embed tags and sanitizing rules.
- Static site generators each add shortcodes, plugins or MDX.

Your text is only portable if every platform you care about understands every construct in it.

## The six things that break most often

1. **Raw HTML.** Platforms sanitize HTML differently. A `div` with an alignment attribute may survive on GitHub and be stripped elsewhere. Prefer Markdown for everything Markdown can express.
2. **Local images.** An image link like `images/diagram.png` works on your machine and nowhere else. Use a hosted URL or upload the image to the platform. See the [guide to Markdown images](/guides/markdown-images).
3. **Wiki-links.** Obsidian links such as the double-bracket form below are meaningless outside Obsidian and print as literal text.
4. **Math and diagrams.** LaTeX math and Mermaid diagrams render on GitHub and Obsidian, but many other places show the raw source. See [math and Mermaid in Markdown](/guides/markdown-math-and-diagrams).
5. **Line breaks.** Whether a single newline becomes a visible break depends on the platform. See [Markdown line breaks](/guides/markdown-line-breaks).
6. **Extensions.** Tables, task lists, footnotes, strikethrough and alerts are not part of strict CommonMark.

```md
See [[Project plan]] for details.
```

## A portability checklist

Before you publish, run through this list:

- Decide where the text will be published and write for that target.
- Replace raw HTML with Markdown wherever you can.
- Give every code fence a language so it is highlighted consistently.
- Use absolute URLs for links and images, or the platform's own upload.
- Write alt text for every image.
- Use one bullet marker (`-`) and consistent heading levels.
- Avoid trailing-space line breaks, which editors often strip. A backslash at the end of the line is clearer.
- Open the result on the target platform, or in a preview that follows its rules, before you hit publish.

## Let the editor do the checking

Run the checklist against your own text in [mdstudio](/editor). Pick a target (Strict CommonMark, GFM extended, GFM without HTML or Wiki notes) and the Checks panel lists each problem with its line number: raw HTML, local images, wiki-links, math, Mermaid and trailing-space breaks. The preview follows the same rules, so you see the result before you publish. Paste a post in to try it.
