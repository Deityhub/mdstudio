import type { Page } from "@playwright/test";

/** Clicks the theme button until it shows Light, Dark or System (it cycles through them). */
export async function chooseTheme(page: Page, name: "Light" | "Dark" | "System") {
  const button = page.getByRole("button", { name: /^Theme:/ });
  for (let i = 0; i < 3; i++) {
    if (((await button.getAttribute("aria-label")) ?? "").startsWith(`Theme: ${name}.`)) return;
    await button.click();
  }
  throw new Error(`The theme button never showed ${name}`);
}
