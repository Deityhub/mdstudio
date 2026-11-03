// Regenerates docs/ui-screenshots/*.png (used by the README and docs/UI_SPEC.md) from the
// production self-hosted build, so they always show the current UI. Run it whenever the UI
// changes, look at every image, and commit them with the docs that describe them.
//   bun run screenshots
import { spawn, execSync } from "node:child_process";
import { chromium } from "@playwright/test";

const PORT = 4175;
const BASE = `http://localhost:${PORT}`;
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

execSync("NITRO_PRESET=node-server bun run build", { stdio: "ignore" });
const server = spawn("node", [".output/server/index.mjs"], {
  env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
  stdio: "ignore",
});
for (let i = 0; i < 60; i++) {
  if (
    await fetch(BASE).then(
      (r) => r.ok,
      () => false,
    )
  )
    break;
  await new Promise((r) => setTimeout(r, 500));
}

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
} finally {
  await browser.close();
  server.kill();
}
