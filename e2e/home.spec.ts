import { expect, test } from "@playwright/test";
import { chooseTheme } from "./theme";

test.describe("theme toggle", () => {
  test("switches to dark, persists across reloads and paints dark immediately", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);

    await chooseTheme(page, "Dark");
    await expect(html).toHaveClass(/dark/);

    await page.reload();
    await expect(html).toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("mdstudio-theme"))).toBe("dark");

    await chooseTheme(page, "Light");
    await expect(html).not.toHaveClass(/dark/);
  });

  test("System follows the OS again, live, and forgets the earlier choice", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const html = page.locator("html");
    await chooseTheme(page, "Dark");
    await expect(html).toHaveClass(/dark/);
    // one more click goes to System
    await page.getByRole("button", { name: /^Theme:/ }).click();
    await expect(html).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("mdstudio-theme"))).toBeNull();

    // the OS switching to dark is picked up without a reload
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).not.toHaveClass(/dark/);

    // the button shows the current choice and what a click does next
    await expect(
      page.getByRole("button", { name: "Theme: System. Switch to Light" }),
    ).toBeVisible();
  });

  test("an explicit choice ignores the OS", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await chooseTheme(page, "Light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("follows the OS preference until a choice is made", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("live checker demo", () => {
  test("reports issues per target and jumps to the offending line", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto("/");

    const demo = page.locator("#try-it");
    const report = demo.getByRole("list", { name: "Portability report" });
    await expect(report).toBeVisible();
    await expect(report.getByRole("button", { name: /Wiki links/ })).toHaveCount(1);

    // The wiki profile understands wiki-links, so that issue disappears
    await demo.getByRole("radio", { name: /Wiki notes/ }).click();
    await expect(report.getByRole("button", { name: /Wiki links/ })).toHaveCount(0);

    // Clicking an issue selects its line in the editor
    await demo.getByRole("radio", { name: /GFM extended/ }).click();
    await report.getByRole("button", { name: /Wiki links/ }).click();
    const selected = await demo
      .locator("textarea")
      .evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd));
    expect(selected).toBe("See [[Project plan]] for the details.");

    // Fixing the Markdown clears the report
    await demo.locator("textarea").fill("# Clean\n\nJust text.\n");
    await expect(report).toContainText("Nothing to flag");
    expect(errors).toEqual([]);
  });

  test("the page has exactly one h1", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
  });
});

test("the logo links home from the home page and from the editor", async ({ page }) => {
  await page.goto("/");
  const logo = page.getByRole("link", { name: "mdstudio", exact: true });
  await expect(logo.locator("svg")).toBeVisible();
  await expect(logo).toHaveAttribute("href", "/");

  await page.goto("/editor");
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.getByRole("link", { name: "mdstudio", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
