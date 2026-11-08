// Regenerates docs/ui-screenshots/*.png (used by the README and docs/UI_SPEC.md) from the
// production self-hosted build, so they always show the current UI. Run it whenever the UI
// changes, look at every image, and commit them with the docs that describe them.
//   bun run screenshots
import { spawn, execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const PORT = 4175;
const BASE = `http://localhost:${PORT}`;
// A stand-in for GitHub (see e2e/fake-github.ts) for the publishing screens.
const GITHUB_PORT = 4383;
const GITHUB = `http://localhost:${GITHUB_PORT}`;
const OUT = "docs/ui-screenshots";

const DOC = `---
title: Release notes
tags:
  - changelog
  - docs
description: What shipped in this release.
---

# Release notes

Everything below renders the same on GitHub, dev.to and Obsidian, except the parts mdstudio flags.

## Highlights

- [x] Live preview that matches the target platform
- [x] Portability checks you can click
- [ ] Ship it

> [!TIP]
> Switch the target platform to see the warnings change.

| Feature | Status |
| ------- | ------ |
| Math    | Done   |
| Mermaid | Done   |

Inline math like $E = mc^2$ sits next to ==highlighted== text.

<div align="center">Centered with raw HTML</div>

See [[Project plan]] for the roadmap.

\`\`\`mermaid
graph LR
  A[Write] --> B{Check}
  B -->|portable| C[Publish]
  B -->|not| A
\`\`\`
`;

const SHARE_DOC = `# Launch plan

We ship the new editor on Friday. The announcement goes out the same morning.

## Rollout

- Week one: invite the early reviewers.
- Week two: open it to everyone.

Pricing stays free while we gather feedback from the first users.
`;

const waitFor = async (url) => {
  for (let i = 0; i < 60; i++) {
    if (
      await fetch(url).then(
        (r) => r.ok,
        () => false,
      )
    )
      return;
    await new Promise((r) => setTimeout(r, 500));
  }
};

execSync("NITRO_PRESET=node-server bun run build", { stdio: "ignore" });
const github = spawn("bun", ["e2e/fake-github.ts"], {
  env: { ...process.env, PORT: String(GITHUB_PORT) },
  stdio: "ignore",
});
const server = spawn("node", [".output/server/index.mjs"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: "production",
    // a throwaway database, so the accounts made below never land in ./data
    DATA_DIR: mkdtempSync(join(tmpdir(), "mdstudio-shots-")),
    GITHUB_CLIENT_ID: "shots",
    GITHUB_CLIENT_SECRET: "shots",
    GH_TOKEN_KEY: Buffer.alloc(32, 9).toString("base64"),
    GITHUB_URL: GITHUB,
    GITHUB_API_URL: GITHUB,
  },
  stdio: "ignore",
});
await waitFor(BASE);
await waitFor(`${GITHUB}/__state`);

const browser = await chromium.launch();
const open = async (opts, { waitForPreview = true } = {}) => {
  const page = await browser.newPage(opts);
  await page.goto(`${BASE}/editor`);
  await page.locator(".cm-content").waitFor();
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(DOC);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll(".cm-scroller, .md-preview")) {
      for (let n = el; n; n = n.parentElement) n.scrollTop = 0;
    }
  });
  if (waitForPreview)
    await page.locator(".md-preview .md-mermaid svg").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  return page;
};
const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name);
};
const desktop = { viewport: { width: 1280, height: 800 }, colorScheme: "light" };

try {
  // 01 home
  const home = await browser.newPage(desktop);
  await home.goto(BASE);
  await home.locator("#try-it textarea").waitFor();
  await shot(home, "01_home_page");
  await home.locator("#try-it").scrollIntoViewIfNeeded();
  await home.waitForTimeout(300);
  await shot(home, "08_home_checker_demo");

  // 02 split view with the checks panel, 03 checks, outline, front matter
  let page = await open(desktop);
  await shot(page, "02_editor_split_view"); // the side panel starts closed below 1536px
  await page.getByRole("button", { name: "Checks" }).click();
  await page.waitForTimeout(300);
  await shot(page, "03_editor_checks_panel");
  await page.getByRole("button", { name: "Outline" }).first().click();
  await page.waitForTimeout(300);
  await shot(page, "04_editor_outline_panel");
  await page.getByRole("button", { name: "Front matter" }).first().click();
  await page.waitForTimeout(300);
  await shot(page, "04_editor_frontmatter_panel");
  await page.getByRole("button", { name: "AI writer" }).click();
  await page.waitForTimeout(400);
  await shot(page, "05_ai_writer_dialog");
  await page.keyboard.press("Escape");

  // 10 the checker rules dialog, with a standard turned on
  await page.getByRole("button", { name: "Checks" }).click();
  await page.getByRole("button", { name: "Rules" }).click();
  const rules = page.getByRole("dialog", { name: "Checker rules" });
  await rules.getByRole("tab", { name: "Standards" }).click();
  await rules.getByRole("switch", { name: "Check title length" }).click();
  await rules.getByRole("switch", { name: "Check required front matter fields" }).click();
  await page.waitForTimeout(300);
  await shot(page, "10_checker_rules");
  await page.keyboard.press("Escape");

  // 11 export menu, which now includes all drafts as a ZIP
  await page.getByRole("button", { name: "Export" }).click();
  await page.waitForTimeout(300);
  await shot(page, "11_export_menu");
  await page.keyboard.press("Escape");

  // 12 history: save a version, change the text, compare it with the current draft
  await page.getByRole("button", { name: "History", exact: true }).click();
  // the first autosave already kept the sample as it is, so change it before saving a version
  await page.locator(".cm-line", { hasText: "## Highlights" }).click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" of this release");
  await page.getByRole("button", { name: "Save a version now" }).click();
  await page.locator(".cm-line", { hasText: "## Highlights" }).click();
  await page.keyboard.press("Home");
  await page.keyboard.insertText("A new paragraph added after the first version was saved.\n\n");
  await page.getByRole("button", { name: /Saved by you/ }).click();
  await page.waitForTimeout(4500); // let the "Version saved" toast go
  await shot(page, "12_history_compare");
  await page.keyboard.press("Escape");
  await page.close();

  // 13 library: folders, tags and search across several drafts
  page = await browser.newPage(desktop);
  await page.goto(`${BASE}/editor`);
  await page.locator(".cm-content").waitFor();
  const drafts = [
    ["Launch checklist", "tags: [launch, docs]", "A short checklist before publishing."],
    ["Weekly notes", "tags: [notes]", "Things that happened this week."],
    ["API guide", "tags: [docs, api]", "How the API works, step by step."],
    ["Release notes", "tags: [changelog, docs]", "What shipped in this release."],
  ];
  for (const [i, [title, tags, body]] of drafts.entries()) {
    if (i > 0) await page.getByRole("button", { name: "New draft" }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(`---\n${tags}\n---\n\n# ${title}\n\n${body}\n`);
    await page.waitForTimeout(500);
  }
  for (const name of ["Writing", "Archive"]) {
    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByLabel("New folder name").fill(name);
    await page.getByRole("button", { name: "Create folder" }).click();
  }
  const nav = page.getByRole("navigation", { name: "Drafts" });
  for (const title of ["API guide", "Release notes"]) {
    await nav
      .getByText(title, { exact: true })
      .dragTo(nav.getByRole("group", { name: "Folder Writing" }));
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);
  await shot(page, "13_library");
  await page.close();

  // 06 phone
  page = await open(
    { viewport: { width: 390, height: 844 }, colorScheme: "light", deviceScaleFactor: 2 },
    { waitForPreview: false },
  );
  await shot(page, "06_mobile_editor_view");
  await page.getByRole("button", { name: "preview view" }).click();
  await page.locator(".md-preview .md-mermaid svg").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await shot(page, "07_mobile_preview_view");
  await page.close();

  // 09 dark
  page = await open({ ...desktop, colorScheme: "dark" });
  await shot(page, "09_editor_dark");
  await page.close();

  // The signed-in screens: sharing, reviewing, and publishing to GitHub. Two accounts, the writer
  // and a reviewer, each in its own browser context.
  const password = "a long enough password";
  const account = async (email, opts = desktop) => {
    const context = await browser.newContext(opts);
    const res = await context.request.post(`${BASE}/api/auth/signup`, {
      data: { email, password },
    });
    if (!res.ok()) throw new Error(`sign-up failed: ${res.status()}`);
    return context;
  };
  const writer = await account("writer@example.com");
  const me = await (await writer.request.get(`${BASE}/api/auth/me`)).json();
  await writer.request.post(`${BASE}/api/sync/push`, {
    data: {
      docs: [
        {
          id: `${me.user.id}:launch`,
          baseVersion: 0,
          title: "Launch plan",
          content: SHARE_DOC,
          createdAt: Date.now(),
          editedAt: Date.now(),
        },
      ],
    },
  });
  const wp = await writer.newPage();
  await wp.goto(`${BASE}/editor`);
  const draftMenu = (title) => wp.getByRole("button", { name: `Options for ${title}` });
  await draftMenu("Launch plan").click({ timeout: 30_000 });
  await wp.getByRole("menuitem", { name: "Share…" }).click();
  const share = wp.getByRole("dialog", { name: "Share" });
  await share.getByRole("combobox", { name: "Who can open it" }).click();
  await wp.getByRole("option", { name: "Only people I invite" }).click();
  await share.getByRole("switch", { name: "Let reviewers comment" }).click();
  await share.getByRole("button", { name: "Publish" }).click();
  const link = share.getByRole("textbox", { name: "Private link" });
  await link.waitFor();
  const url = await link.inputValue();
  await share.getByLabel("Invite by email").fill("reviewer@example.com");
  await share.getByRole("button", { name: "Invite" }).click();
  await share.getByRole("listitem").filter({ hasText: "reviewer@example.com" }).waitFor();
  await wp.waitForTimeout(4500); // let the "Added" toast go
  await shot(wp, "14_share_dialog");
  await wp.keyboard.press("Escape");

  // a signed-out visitor to the private link
  const stranger = await browser.newContext(desktop);
  const sp = await stranger.newPage();
  await sp.goto(url);
  await sp.getByRole("heading", { name: "This document is private" }).waitFor();
  await shot(sp, "18_private_link_gate");
  await stranger.close();

  // the reviewer reads and comments (the comments are made through the API, as the page does)
  const slug = url.split("/s/")[1];
  const reviewer = await account("reviewer@example.com");
  for (const [line, snippet, body] of [
    [
      3,
      "The announcement goes out the same morning",
      "Can we move the announcement to the afternoon? Support is thin in the morning.",
    ],
    [10, "gather feedback from the first users", "How long is the feedback period?"],
  ]) {
    const res = await reviewer.request.post(`${BASE}/api/s/${slug}/comments`, {
      data: { body, line, snippet },
    });
    if (!res.ok()) throw new Error(`comment failed: ${res.status()}`);
  }
  const rp = await reviewer.newPage();
  await rp.goto(url);
  await rp.locator("mark.share-hl").first().waitFor({ timeout: 20_000 });
  await rp.waitForTimeout(800);
  await shot(rp, "16_shared_page_comments");
  await reviewer.close();
  const phone = await account("phone@example.com", {
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    deviceScaleFactor: 2,
  });
  // invite the second reviewer so the private page opens for them too
  await share_invite(writer, me.user.id);
  const pp = await phone.newPage();
  await pp.goto(url);
  await pp.locator("mark.share-hl").first().waitFor({ timeout: 20_000 });
  await pp.waitForTimeout(800);
  await shot(pp, "17_shared_page_phone");
  await phone.close();

  // the writer reads the comments in the editor
  await wp.getByRole("button", { name: "Comments", exact: true }).click();
  await wp.getByText("How long is the feedback period?").waitFor();
  await wp.waitForTimeout(400);
  await shot(wp, "15_comments_panel");
  await wp.getByRole("button", { name: "Comments", exact: true }).click();

  // publishing to GitHub: connecting, then the repository form
  await draftMenu("Launch plan").click();
  await wp.getByRole("menuitem", { name: "Publish to GitHub…" }).click();
  const publish = wp.getByRole("dialog", { name: "Publish to GitHub" });
  await publish.getByRole("button", { name: "Connect GitHub" }).waitFor();
  await wp.waitForTimeout(700); // the menu has closed and the dialog has settled
  await shot(wp, "19_publish_connect");
  await publish.getByRole("button", { name: "Connect GitHub" }).click();
  await publish.getByText("Connected as").waitFor({ timeout: 20_000 });
  await publish.getByRole("combobox", { name: "Repository" }).fill("octo/blog");
  await publish.getByRole("combobox", { name: "Branch" }).filter({ hasText: "main" }).waitFor();
  await publish.getByRole("textbox", { name: "File path" }).fill("posts/launch-plan.md");
  await wp.waitForTimeout(4500); // let the "GitHub connected" toast go
  await shot(wp, "20_publish_github");
} finally {
  await browser.close();
  server.kill();
  github.kill();
}

// invites an address to the writer's private link through the API, for the phone screen
async function share_invite(context, userId) {
  const res = await context.request.post(`${BASE}/api/share/launch/people`, {
    data: { email: "phone@example.com" },
  });
  if (!res.ok()) throw new Error(`invite failed (${userId}): ${res.status()}`);
}
