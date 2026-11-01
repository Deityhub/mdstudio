import { get, set, del, keys, getMany } from "idb-keyval";

export type MdDocument = {
  id: string;
  title: string;
  content: string;
  /** Local images keyed by file name, stored as data URIs. */
  images: Record<string, string>;
  createdAt: number;
  updatedAt: number;
};

const PREFIX = "doc:";

export const documentStore = {
  async list(): Promise<MdDocument[]> {
    const ks = (await keys()).filter((k) => String(k).startsWith(PREFIX));
    const docs = (await getMany<MdDocument>(ks)).filter((d): d is MdDocument => !!d);
    return docs.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  get: (id: string) => get<MdDocument>(PREFIX + id),
  async save(doc: MdDocument) {
    await set(PREFIX + doc.id, doc);
    return doc;
  },
  remove: (id: string) => del(PREFIX + id),
  async create(partial: Partial<MdDocument> = {}): Promise<MdDocument> {
    const now = Date.now();
    const doc: MdDocument = {
      id: crypto.randomUUID().slice(0, 8),
      title: "Untitled",
      content: "",
      images: {},
      createdAt: now,
      updatedAt: now,
      ...partial,
    };
    return documentStore.save(doc);
  },
};

export const SAMPLE = `---
title: Writing portable Markdown
tags:
  - markdown
  - writing
description: A quick tour of what renders the same everywhere.
---

# Writing portable Markdown

What you see here is **exactly** what GitHub, dev.to, Hashnode and most static site generators render.
A single line break like this one does *not* create a new line. That's standard CommonMark.

Need a hard break? End the line with a backslash\\
and the next line starts here.

## Lists

- Bullets use a dash
- Nested items:
  - indent by two spaces
- [x] Task lists work on GFM platforms
- [ ] …like GitHub

1. Numbered
2. Lists

## Code

\`\`\`ts
export function greet(name: string) {
  return \`Hello, \${name}!\`;
}
\`\`\`

## Tables

| Feature     | CommonMark | GFM |
| ----------- | :--------: | :-: |
| Headings    |     ✓      |  ✓  |
| Tables      |            |  ✓  |
| Footnotes   |            |  ✓  |

> Tip: open the **Checks** panel to see anything that may not render the same on other platforms.

Here's a footnote reference.[^1]

[^1]: Footnotes are supported on GitHub and most blog platforms.
`;
