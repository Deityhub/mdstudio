import { chooseTheme } from "./theme";
import { expect, test } from "@playwright/test";

test("Mermaid diagrams re-render when the theme changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/editor");
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("```mermaid\ngraph TD\n  A --> B\n```\n");

  const diagram = page.locator(".md-preview .md-mermaid svg");
  await expect(diagram).toBeVisible({ timeout: 20_000 });
  const light = await diagram.innerHTML();

  await chooseTheme(page, "Dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect.poll(() => diagram.innerHTML(), { timeout: 20_000 }).not.toBe(light);
  await expect(page.locator(".md-preview .md-mermaid-stale")).toHaveCount(0);

  // going back reuses the cached light render
  await chooseTheme(page, "Light");
  await expect.poll(() => diagram.innerHTML(), { timeout: 20_000 }).toBe(light);
});
