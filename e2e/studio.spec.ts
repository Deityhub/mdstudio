import { expect, test, type Page } from "@playwright/test";

const editor = (page: Page) => page.locator(".cm-content");

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/editor");
  await expect(editor(page)).toBeVisible();
  return errors;
}

async function replaceText(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}

test("home page renders and links to the editor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page
    .getByRole("link", { name: /editor|start writing|open/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/editor/);
  await expect(editor(page)).toBeVisible();
});

test("typing updates the preview, with no console errors under the CSP", async ({ page }) => {
  const errors = await open(page);
  await replaceText(page, "# Hello e2e\n\nSome **bold** text.");
  const preview = page.locator(".md-preview");
  await expect(preview.getByRole("heading", { name: "Hello e2e" })).toBeVisible();
  await expect(preview.locator("strong")).toHaveText("bold");
  expect(errors).toEqual([]);
});

test("a draft survives a reload (real IndexedDB)", async ({ page }) => {
  await open(page);
  await replaceText(page, "# Persisted heading\n\nbody");
  await expect(page.getByRole("status")).toHaveText("Saved in this browser");
  await page.reload();
  await expect(editor(page)).toContainText("Persisted heading");
  await expect(
    page.locator(".md-preview").getByRole("heading", { name: "Persisted heading" }),
  ).toBeVisible();
});

test("unsafe HTML never reaches the preview", async ({ page }) => {
  await open(page);
  await replaceText(
    page,
    '<script>window.__pwned = 1</script>\n\n<img src=x onerror="window.__pwned = 1">',
  );
  await expect(page.locator(".md-preview")).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
  ).toBeUndefined();
  await expect(page.locator(".md-preview script")).toHaveCount(0);
  await expect(page.locator(".md-preview [onerror]")).toHaveCount(0);
});

test("renders math and Mermaid", async ({ page }) => {
  await open(page);
  await replaceText(page, "$$\nx^2 + y^2\n$$\n\n```mermaid\ngraph TD\n  A --> B\n```\n");
  await expect(page.locator(".md-preview .katex").first()).toBeVisible();
  await expect(page.locator(".md-preview .md-mermaid svg")).toBeVisible({ timeout: 20_000 });
});
