---
slug: markdown-for-devto-and-hashnode
title: Writing Markdown for dev.to and Hashnode
description: "Tips for writing blog posts in Markdown that publish cleanly to dev.to and Hashnode: front matter, images, code blocks, raw HTML and what to check first."
order: 4
published: 2026-11-02T00:00:00Z
updated: 2026-11-02T00:00:00Z
---

dev.to and Hashnode both let you write posts in Markdown, which makes it tempting to draft in your own editor and paste the result. That works well, as long as you know where each platform differs from the Markdown you write locally. This guide covers the habits that make a post publish cleanly the first time.

## Both are Markdown, with their own rules

dev.to and Hashnode follow common Markdown conventions: headings, lists, links, images, block quotes, tables and fenced code blocks. Each adds its own features on top, such as embed tags for videos and social posts, and each processes your text before showing it to readers. The details change over time, so treat the points below as habits rather than guarantees, and check the platform's current editor guide for anything unusual.

## Start with front matter

dev.to reads a YAML block at the top of the post, which sets the title, tags and publishing state:

```md
---
title: Writing portable Markdown
published: false
description: A short summary for previews and search.
tags: markdown, writing
---
```

Keep the block valid YAML, keep tags to the number the platform allows, and set `published: false` until you have previewed the post. Hashnode takes much of this from its editor settings instead, so check how it handles imported metadata.

## Do not rely on raw HTML

Both platforms sanitize HTML, and what survives can change. Alignment wrappers, custom styles, iframes and scripts are the usual casualties. If you can express something in Markdown, do. Use a Markdown table instead of an HTML one, bold instead of a styled span, and the platform's own embed syntax for videos and tweets.

## Images need public URLs

A relative path such as an `images` folder only exists on your computer. Upload each image through the platform's editor and use the URL it returns, or host the images somewhere stable. Add alt text to every image: it helps screen readers, and it is what readers see if the image fails to load. Avoid embedding large base64 images in the text, since they bloat the post and are often rejected.

```md
![A flow chart of the publishing process](https://example.com/images/publish-flow.png)
```

## Code blocks and highlighting

Always put a language after the opening fence. It enables syntax highlighting, and it keeps your code readable if the post is copied to another site.

````md
```ts
export const greet = (name: string) => `Hello, ${name}`;
```
````

## Things that often do not render

- Math written with dollar signs may show as plain text.
- Mermaid diagrams written in a fenced block may show as code rather than a diagram.
- Obsidian wiki-links print as literal brackets.
- Footnotes and GitHub-style alerts may not be supported.

Check each against the platform before you rely on it, and prefer an image for diagrams you cannot afford to lose. See the guide to [math and Mermaid in Markdown](https://mdstudio.deityhub.com/guides/markdown-math-and-diagrams).

## Preview before you publish

The fastest safeguard is to check the post against the rules of your target before you paste it. In [mdstudio](https://mdstudio.deityhub.com/editor), choose the GFM without HTML profile. Raw HTML is reported as an error there, and the checker also catches local images, wiki-links, math, Mermaid and trailing-space line breaks, each with a click to jump to the line. The editor is open source and keeps drafts in your browser. For a wider checklist, read the [portable Markdown guide](https://mdstudio.deityhub.com/guides/markdown-portability).
