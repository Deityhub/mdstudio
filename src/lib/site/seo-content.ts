// The words search engines, AI assistants and visitors read. Everything user-facing about what
// mdstudio is lives here so the page copy, meta tags, JSON-LD and llms.txt cannot drift apart.
// Claims must match what the product does today (see docs/SYSTEM_SPEC.md).

export const BRAND = {
  name: "mdstudio",
  /** Older name, kept as an alternate so people searching for it still land here. */
  alternateName: "Markdown Studio",
  tagline: "Write once. Render the same everywhere.",
  homeTitle: "mdstudio: Markdown editor that renders the same everywhere",
  description:
    "Free, open-source Markdown editor with live preview. Checks your writing renders the same on GitHub, dev.to and Obsidian. Math, Mermaid, no sign-up.",
  imageAlt: "mdstudio: write once, render the same everywhere",
} as const;

export const LONG_DESCRIPTION =
  "mdstudio is a free, open-source, local-first Markdown editor and portability checker. Write in a " +
  "full-featured editor with a complete formatting toolbar, watch a live preview that matches what " +
  "GitHub, dev.to, Obsidian or a strict CommonMark engine will render, and get clickable warnings for " +
  "anything that will not travel: raw HTML, local images, wiki-links, math, Mermaid diagrams and " +
  "trailing-space line breaks. Drafts autosave in your browser with no account, import from .md files or " +
  "pasted Google Docs and Notion content, and export clean UTF-8 Markdown or self-contained HTML. " +
  "Optional AI writing helpers use your own API key. mdstudio is MIT licensed, runs free in the browser " +
  "and can be self-hosted with Docker.";

export const FEATURE_LIST = [
  "Live Markdown preview that matches GitHub, dev.to, Obsidian and CommonMark",
  "Portability checker with clickable issues for non-portable syntax",
  "Target profiles: Strict CommonMark, GitHub Flavored Markdown, dev.to, Obsidian",
  "Formatting toolbar for headings, lists, tables, links, images, code blocks, footnotes and alerts",
  "KaTeX math and Mermaid diagrams",
  "Local-first drafts stored in the browser (IndexedDB), no account needed",
  "Import .md files and paste from Google Docs, Notion and the web",
  "Export clean UTF-8 Markdown or standalone HTML, or every draft at once as a ZIP",
  "Import ZIP archives and whole folders of Markdown files",
  "Search, tag filters and folders for your drafts, all kept in the browser",
  "Version history with a side-by-side compare and one-click restore",
  "Custom checker rules and publication standards, shareable as a file",
  "Works offline and installs as an app",
  "Bring-your-own-key AI writing helpers",
  "Open source under the MIT license, self-hostable with Docker",
];

export const AUDIENCES = [
  "Technical bloggers publishing to dev.to, Hashnode and static site generators",
  "Developers writing READMEs and documentation for GitHub",
  "Obsidian users who share notes outside Obsidian",
  "Documentation teams who need Markdown that renders the same in every tool",
];

export type Faq = { question: string; answer: string };

export const FAQ: Faq[] = [
  {
    question: "What is mdstudio?",
    answer:
      "mdstudio is a free, open-source Markdown editor with a live preview and a portability checker. You write Markdown, see how it will render on GitHub, dev.to, Obsidian or a strict CommonMark engine, and fix anything that would look different before you publish.",
  },
  {
    question: "How is mdstudio different from other Markdown editors?",
    answer:
      "Most editors render Markdown their own way, so a post can look right in the editor and wrong where you publish it. mdstudio keeps the raw Markdown as the single source of truth, renders it without preview-only tricks, and flags syntax that other platforms handle differently, such as raw HTML, local image paths, wiki-links, math and Mermaid.",
  },
  {
    question: "Is mdstudio free and open source?",
    answer:
      "Yes. mdstudio is free to use in the browser and released under the MIT license. The source code is on GitHub, and you can self-host it with Docker.",
  },
  {
    question: "Are my documents private?",
    answer:
      "Yes. Drafts are saved in your browser's IndexedDB and are not uploaded anywhere. There is no account to create. If you use the optional AI helpers, your API key stays in memory for the session and requests go directly from your browser to the provider you choose.",
  },
  {
    question: "Does mdstudio work offline?",
    answer:
      "Yes. After your first visit the studio opens and keeps working without a connection, saves your drafts in the browser, and can be installed as an app. Only the optional AI helpers need a network connection.",
  },
  {
    question: "Can I organise many drafts and go back to an earlier version?",
    answer:
      "Yes. Search your drafts, filter them by tag and keep them in folders. mdstudio saves versions as you write, shows a side-by-side comparison with the current draft, and restores any version in one click. You can also export every draft as a ZIP.",
  },
  {
    question: "Which Markdown flavors and platforms does it check?",
    answer:
      "Choose a target profile: Strict CommonMark, GitHub Flavored Markdown, dev.to or Obsidian. The preview and the portability checks adapt to the profile, and the toolbar warns before you insert syntax the target does not support.",
  },
  {
    question: "Does mdstudio support math, diagrams, tables and footnotes?",
    answer:
      "Yes. It renders KaTeX math, Mermaid diagrams, GitHub-style tables, task lists, footnotes and alert blocks, and shows when a target platform may not render them.",
  },
  {
    question: "How do I export my writing?",
    answer:
      "Download or copy clean Markdown with UTF-8 and LF line endings and optional whitespace normalizing, or export a standalone HTML file with images and math included.",
  },
  {
    question: "Can I self-host mdstudio?",
    answer:
      "Yes. A Docker image runs the whole app in a single container with a persistent volume. See the project on GitHub for the compose file and instructions.",
  },
];
