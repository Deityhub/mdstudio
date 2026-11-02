// Regenerates docs/ui-screenshots/*.png (used by the README and docs/UI_SPEC.md) from the
// production self-hosted build, so they always show the current UI.
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
  await shot(page, "02_editor_split_view");
  await shot(page, "03_editor_checks_panel"); // the Checks panel is open by default
  await page.getByRole("button", { name: "Outline" }).first().click();
  await page.waitForTimeout(300);
  await shot(page, "04_editor_outline_panel");
  await page.getByRole("button", { name: "Front matter" }).first().click();
  await page.waitForTimeout(300);
  await shot(page, "04_editor_frontmatter_panel");
  await page.getByRole("button", { name: "AI writer" }).click();
  await page.waitForTimeout(400);
  await shot(page, "05_ai_writer_dialog");
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
