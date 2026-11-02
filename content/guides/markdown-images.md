Images are the most common reason a Markdown post looks broken after publishing. The text copies perfectly, and then every picture shows as a missing icon. The cause is almost always the path, and the fix is to understand where each kind of image link actually works.

## The basic syntax

An image is a link with an exclamation mark in front. The text in square brackets is the alt text, and the part in parentheses is the address.

```md
![A bar chart of monthly visitors](https://example.com/images/visitors.png)
```

You can add an optional title in quotes after the address. It usually shows as a tooltip.

## Four ways to point at an image

1. **A hosted URL.** An absolute web address works anywhere the image is reachable. This is the most portable choice.
2. **A relative path.** A path such as `images/chart.png` only works when the Markdown file and the image sit in the same place the renderer expects. It works in a repository README and in many static site generators. It fails when you paste the text into another site.
3. **A platform upload.** On sites like dev.to, you upload through the editor and it gives you a hosted URL. Use that URL in the text.
4. **A base64 data URI.** The image data is embedded in the text itself. It is self-contained, but it makes the file huge and many platforms reject or strip it.

## Why local paths fail

A path on your computer is not a place the internet can reach. If the post is rendered by a service, it has no access to your disk, so the image cannot load. The same is true for absolute file paths and for images that exist only in your notes app. Before publishing, every image link should be either a public URL or a path the target definitely understands.

## Always write alt text

Alt text is the description shown when an image fails to load, and what screen readers announce. It also helps search engines understand the image. Describe what the image shows and why it matters, in a short sentence. Leave it empty only for purely decorative images.

## Size and format

- Prefer common formats such as PNG, JPEG, WebP or SVG.
- Compress images before uploading. Large files slow your page.
- Avoid putting width or height attributes in HTML, since sanitizers often remove them. If you need a specific size, resize the file.

## A pre-publish checklist

- Every image link is a public URL or a deliberate relative path.
- Every image has descriptive alt text.
- No image is embedded as a huge data URI unless the target allows it.
- You have opened the published page and confirmed every image loads.

## Find broken image links before you publish

[mdstudio](https://mdstudio.deityhub.com/editor) flags local image paths, embedded base64 images and images with missing alt text, with a click to jump to each one. When you insert an image, the dialog requires alt text. You can also export a self-contained Markdown or HTML file that embeds your local images, so the document works on its own. The editor is free, open source and keeps your drafts in your browser. For the wider picture, read the [portable Markdown guide](https://mdstudio.deityhub.com/guides/markdown-portability).
