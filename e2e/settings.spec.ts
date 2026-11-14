import { expect, test } from "@playwright/test";
import { startDraft } from "./draft";
import { account, skipPicker } from "./sync-helpers";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test("signed out, the settings page offers the editor and AI sections and keeps a choice", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(page.getByRole("tab", { name: "Editor" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "AI" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Account" })).toHaveCount(0);

  await page.getByLabel("Target platform").selectOption("commonmark");
  await page.getByRole("switch", { name: "Normalize on export" }).click();
  await page.reload();
  await expect(page.getByLabel("Target platform")).toHaveValue("commonmark");
  await expect(page.getByRole("switch", { name: "Normalize on export" })).toBeChecked();

  // a signed-in section is not reachable by address either
  await page.goto("/settings?tab=account");
  await expect(page.getByRole("tab", { name: "Editor", selected: true })).toBeVisible();
});

test("the account menu opens settings, which show the account and its connections", async ({
  page,
}) => {
  const address = `settings-${unique()}@example.com`;
  await account(page, "Create account", address);
  await skipPicker(page);
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Account", exact: true }).click();

  await expect(page).toHaveURL(/\/settings\?tab=account/);
  await expect(page.getByRole("tab", { name: "Account", selected: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Account" })).toContainText(address);

  await page.getByRole("tab", { name: "Connections" }).click();
  await expect(page).toHaveURL(/tab=connections/);
  await page.getByRole("button", { name: "Choose drafts…" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("the settings page is reachable from the editor and the public pages without signing in", async ({
  page,
}) => {
  await startDraft(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByRole("tab", { name: "Editor", selected: true })).toBeVisible();

  await page.goto("/guides");
  await page.getByRole("link", { name: "Settings", exact: true }).first().click();
  await expect(page).toHaveURL(/\/settings/);
});

test("the account menu has a Settings item that opens the editor section", async ({ page }) => {
  await account(page, "Create account", `settings-${unique()}@example.com`);
  await skipPicker(page);
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Editor", selected: true })).toBeVisible();
});
