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
    "Open-source Markdown editor that checks your writing renders the same on GitHub and elsewhere. Write together, get review, publish. No sign-up.",
  imageAlt: "mdstudio: write once, render the same everywhere",
} as const;

export const LONG_DESCRIPTION =
  "mdstudio is an open-source, local-first Markdown editor and portability checker. The preview " +
  "follows the rules of the target you pick (strict CommonMark, GFM, GFM without HTML or wiki " +
  "notes), and clickable warnings point at anything that will not travel: raw HTML, local images, " +
  "wiki-links, math, Mermaid diagrams and trailing-space line breaks. Drafts autosave in your " +
  "browser with no account. With an account you can edit a draft together with invited people, " +
  "share a read-only copy for review with comments, and publish to GitHub as a commit, a pull " +
  "request or a gist. Optional AI helpers use your own API key. mdstudio is MIT licensed, runs in " +
  "the browser and can be self-hosted with Docker.";

export const FEATURE_LIST = [
  "Live Markdown preview that follows the rules of the target you pick",
  "Portability checker with clickable issues for non-portable syntax",
  "Target profiles: Strict CommonMark, GFM extended, GFM without HTML, Wiki notes",
  "Edit a draft together with invited people, online or offline, with live cursors",
  "Share a read-only copy for review that expires, with comments from signed-in readers",
  "Publish to GitHub as a commit, a pull request or a gist",
  "Formatting toolbar for headings, lists, tables, links, images, code blocks, footnotes and alerts",
  "KaTeX math and Mermaid diagrams",
  "Local-first drafts stored in the browser (IndexedDB), no account needed",
  "Import .md files, ZIP archives and folders; paste from Google Docs, Notion and the web",
  "Export clean UTF-8 Markdown, standalone HTML, or every draft as a ZIP",
  "Search drafts and their text, tag filters, folders, and version history with side-by-side compare",
  "Custom checker rules and publication standards, shareable as a file",
  "Bring-your-own-key AI writing helpers, shown as a diff before anything changes",
  "Works offline and installs as an app",
  "Open source under the MIT license, self-hostable with Docker",
];

export const AUDIENCES = [
  "People who write for the web and publish in more than one place",
  "Developers who write READMEs and docs, and want a second pair of eyes before the pull request",
  "Notes writers who share outside their notes app",
  "Small teams who review and edit docs together without leaving Markdown",
];

export type Faq = { question: string; answer: string };

export const FAQ: Faq[] = [
  {
    question: "Is mdstudio free and open source?",
    answer:
      "Yes. It is MIT licensed and the code is on GitHub. The hosted site is free to use, with limits: 5 drafts in your cloud by default. You can also run your own copy with Docker, with your own database and storage.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. Writing, checking, importing and exporting all work without one, and drafts stay in your browser. An account is optional and adds what needs a server: cloud drafts, editing together, share links and publishing to GitHub. You sign up with an email address and confirm it.",
  },
  {
    question: "Where are my documents stored?",
    answer:
      "In your browser's storage on this device. A draft goes to our servers only if you put it in your cloud, and then only that draft. On a self-hosted copy it goes to your own database.",
  },
  {
    question: "How does editing together work?",
    answer:
      "Invite people by email from a draft's menu. Up to 3 people can edit one draft at the same time, and you see each other's cursors. If someone goes offline, their edits stay on their device and merge when they reconnect. If two people change the same spot, both keep their text.",
  },
  {
    question: "How does review work?",
    answer:
      "Sharing publishes a read-only copy that expires after 1 to 7 days. Make it public or limit it to people you name. Signed-in readers comment on the words they select, and you resolve the comments from the editor. Changing your draft does not change the copy until you publish an update, and you can stop sharing at any time.",
  },
  {
    question: "Can I publish to GitHub?",
    answer:
      "Yes. Connect your GitHub account, pick a repository, a branch and a path, then commit to the branch, open a pull request or post a gist. Local images are committed beside the file. Publishing needs an account with a confirmed email, and you can disconnect GitHub at any time.",
  },
  {
    question: "How do the AI features handle my key and my text?",
    answer:
      "You add your own key for OpenAI, Anthropic, Gemini, Ollama or any compatible gateway. The key stays in memory for the session and is never saved. Requests go from your browser to your provider, and every change is shown as a diff you accept or reject first.",
  },
  {
    question: "Which flavors and platforms does it check?",
    answer:
      "Four targets: Strict CommonMark, GFM extended, GFM without HTML and Wiki notes. They follow the rules those tools share rather than copying any one site, and the preview, the checks and the toolbar warnings all follow your choice. The guides explain where platforms differ.",
  },
  {
    question: "How is it different from other Markdown editors?",
    answer:
      "Most editors render Markdown their own way, with extra line breaks, smart quotes or built-in extensions, so a post can look right there and wrong where it lands. mdstudio renders strictly and tells you where the target will differ. It is also not a notes app or a blog host: it is where you write, check, review and publish from.",
  },
];
