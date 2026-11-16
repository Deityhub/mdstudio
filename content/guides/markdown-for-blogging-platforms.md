---
slug: markdown-for-blogging-platforms
title: Writing Markdown for Blogging Platforms
description: "Write Markdown that publishes cleanly to blogging platforms and site tools: front matter, images, raw HTML and a test post before you rely on an extra feature."
order: 4
published: 2026-11-02T13:08:00Z
updated: 2026-11-16T10:52:00Z
---

Most blogging platforms, publishing tools and static site generators let you write in Markdown, which makes it tempting to draft in your own editor and paste the result. That works well, as long as you know where each tool differs from the Markdown you write locally. This guide covers the habits that make a post publish cleanly the first time, without claiming to know the rules of any one platform: those change, and the platform's own documentation is the authority.

## They all read Markdown, and then add their own rules

Headings, lists, links, images, block quotes, tables and fenced code blocks are common ground. Beyond that, each tool adds its own features, such as embed tags for videos and social posts, shortcodes, or a plugin system, and each processes your text before showing it to readers. Some sanitize HTML, some rewrite links, some turn single newlines into line breaks. The same file can come out differently in each.

## Start with front matter

Many tools read a YAML block at the top of the file for the title, a description, tags, a date and a draft flag. The field names differ from tool to tool, so check the ones your target reads, and keep the block valid YAML:

```md
---
title: Writing portable Markdown
description: A short summary for previews and search.
tags: markdown, writing
draft: true
---
```

Keep the number of tags within what the platform allows, and keep the post marked as a draft until you have previewed it there. A tool that does not understand a field usually ignores it, but one that is strict about unknown fields may refuse the post.

## Do not rely on raw HTML

Platforms sanitize HTML, and what survives can change. Alignment wrappers, custom styles, iframes and scripts are the usual casualties. If you can express something in Markdown, do. Use a Markdown table instead of an HTML one, bold instead of a styled span, and the platform's own embed syntax for videos and social posts.

## Images need public URLs

A relative path such as an `images` folder only exists on your computer, unless the tool publishes from a repository that contains it. Upload each image through the platform's editor and use the URL it returns, or host the images somewhere stable. Add alt text to every image: it helps screen readers, and it is what readers see if the image fails to load. Avoid embedding large base64 images in the text, since they bloat the post and are often rejected.

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

## Test post: what to try before you rely on it

The features most likely to behave differently are the ones outside CommonMark. Before you build a post around one, publish a private or draft test post that uses each of these once, and look at the result:

- Math written with dollar signs.
- A Mermaid diagram in a fenced block.
- A footnote, a task list and a table.
- A GitHub-style alert (a block quote starting with a marker such as NOTE).
- An Obsidian wiki-link, which prints as literal brackets almost everywhere.
- Raw HTML with an alignment attribute.

Write down what works for that platform. It takes ten minutes once and saves you from finding out in front of readers. For a diagram you cannot afford to lose, use an image. See the guide to [math and Mermaid in Markdown](https://mdstudio.deityhub.com/guides/markdown-math-and-diagrams).

## Preview before you publish

[mdstudio](https://mdstudio.deityhub.com/editor) can hold the text to the stricter rules while you write. Choose the GFM without HTML target: raw HTML is reported as an error there, and the checker also catches local images, wiki-links, math, Mermaid and trailing-space line breaks, each with a click to jump to the line. If your tool builds pages from a Git repository, you can also publish the draft straight to it as a commit or a pull request. For a wider checklist, read the [portable Markdown guide](https://mdstudio.deityhub.com/guides/markdown-portability).
