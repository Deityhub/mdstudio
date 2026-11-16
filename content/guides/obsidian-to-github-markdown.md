---
slug: obsidian-to-github-markdown
title: "Obsidian to GitHub Markdown: Wiki-links, Callouts & More"
description: "How to share Obsidian notes outside Obsidian: convert wiki-links, highlights, callouts and embeds so they render on GitHub, blogging platforms and static sites."
order: 3
published: 2026-11-02T11:23:00Z
updated: 2026-11-16T10:08:00Z
---

Obsidian stores notes as plain Markdown files, which makes them easy to share, but Obsidian adds syntax that other tools do not understand. If you copy a note straight into a GitHub README, a blog post or a static site, some of it will break. This guide lists what to convert and how.

## What Obsidian adds to Markdown

Besides standard Markdown and GFM, Obsidian supports:

- Wiki-links to other notes.
- Embeds of notes and files.
- Highlights.
- Callouts.
- Comments.
- Tags and block references.

Each one needs a plan when the note leaves your vault.

## Wiki-links

Obsidian links notes with double square brackets, and can show different text with a pipe.

```md
See [[Project plan]] and [[Project plan|the roadmap]].
```

Outside Obsidian these print as literal text. Convert them to standard links:

```md
See [Project plan](https://example.com/project-plan) and [the roadmap](https://example.com/project-plan).
```

If the linked note is not public, replace the link with plain text. Obsidian can also be configured to write standard Markdown links for new links, which avoids the problem at the source.

## Embeds and images

Obsidian embeds files with an exclamation mark and double brackets. Standard Markdown uses the image syntax with a path or URL. Local file paths do not work on another platform, so upload the image or host it, then link to the final URL. Always include alt text.

```md
![Architecture diagram](https://example.com/images/architecture.png)
```

## Highlights

Obsidian renders text wrapped in double equals signs as a highlight. Standard Markdown has no equivalent, so other platforms show the equals signs. Either remove the markers, or use bold or italics instead.

## Callouts

Obsidian callouts look like a block quote that starts with a type in square brackets after an exclamation mark. GitHub supports a similar feature called alerts, but with a smaller set of types: NOTE, TIP, IMPORTANT, WARNING and CAUTION. Obsidian callout types such as info or example, custom titles and folding do not carry over. Convert them to one of the GitHub types or to a plain block quote with a bold label.

```md
> **Note**
> A plain block quote with a bold label works everywhere.
```

## Front matter, tags and comments

- Front matter in YAML is widely understood, but the properties each platform reads differ.
- Inline hashtags are just text outside Obsidian. Move tags into front matter if the target supports them.
- Obsidian comments, written between double percent signs, show as text elsewhere. Delete them before sharing.

## What does carry over

Headings, emphasis, lists, task lists, tables, footnotes, code blocks, math and Mermaid diagrams are all standard on GitHub too, so these usually need no changes. Math and Mermaid still fail on platforms that do not render them. See [math and Mermaid in Markdown](https://mdstudio.deityhub.com/guides/markdown-math-and-diagrams).

## Let a checker find them

Doing this by eye across a long note is error prone. Paste the note into [mdstudio](https://mdstudio.deityhub.com/editor) and choose GFM extended: the checker lists every wiki-link, highlight and local image with a clickable line number. Then choose Wiki notes and the wiki-link and highlight warnings go away, which shows exactly what is Obsidian-only. For the bigger picture, read the [portable Markdown guide](https://mdstudio.deityhub.com/guides/markdown-portability).
