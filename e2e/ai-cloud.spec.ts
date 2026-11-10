import { expect, test, type Page } from "@playwright/test";
import { password, startDraft } from "./draft";

const address = () => `ai-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function openWriter(page: Page) {
  await page.getByRole("button", { name: "AI writer" }).click();
}
async function addOllama(page: Page) {
  await page.getByRole("button", { name: "Set up an integration" }).click();
  await page.getByLabel("AI provider").click();
  await page.getByRole("option", { name: /Ollama/ }).click();
  await page.getByLabel("Name (optional)").fill("My local");
  await page.getByLabel("Model IDs").fill("llama3.2");
  await page.getByRole("button", { name: "Add integration" }).click();
}
const localItems = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("mdstudio-ai-integrations") ?? "{}").items ?? [],
  );

test("integrations live in the browser until sign-in, then in the account", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const email = address();
  await startDraft(page);

  // signed out: kept in this browser
  await openWriter(page);
  await addOllama(page);
  await expect(page.getByRole("combobox", { name: "AI integration" })).toContainText("My local");
  expect(await localItems(page)).toHaveLength(1);
  await page.getByRole("button", { name: "Close" }).click();

  // signing in moves it into the account, and this browser no longer holds the account's list
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("button", { name: "Not now" }).click();
  await openWriter(page);
  await expect(page.getByRole("combobox", { name: "AI integration" })).toContainText("My local");
  const cloud = await (await page.request.get("/api/ai/integrations")).json();
  expect(cloud.integrations).toHaveLength(1);
  expect(cloud.integrations[0]).toMatchObject({ name: "My local", provider: "ollama" });
  expect(JSON.stringify(cloud)).not.toMatch(/apiKey|api_key/);
  await expect.poll(() => localItems(page)).toEqual([]);

  // new ones are saved to the account
  await page.getByRole("button", { name: "Manage AI integrations" }).click();
  await page.getByRole("button", { name: "Add integration" }).click();
  await page.getByLabel("AI provider").click();
  await page.getByRole("option", { name: "Anthropic" }).click();
  await page.getByLabel("API key").fill("only-in-memory");
  await page.getByRole("button", { name: "Add integration" }).click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/ai/integrations")).json()).integrations.length,
    )
    .toBe(2);
  await page.getByRole("button", { name: "Close" }).click();

  // signed out: the account's integrations are gone from view
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: `Account: ${email}` }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await openWriter(page);
  await expect(page.getByRole("button", { name: "Set up an integration" })).toBeVisible();
  expect(await localItems(page)).toEqual([]);
  await page.getByRole("button", { name: "Close" }).click();

  // signing back in brings them back, with the key needed again for the one that had one
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Not now" }).click();
  await openWriter(page);
  await page.getByRole("combobox", { name: "AI integration" }).click();
  await expect(page.getByRole("option", { name: "My local" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Anthropic" })).toBeVisible();
});

test("the account's list is not read until something shows integrations", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const requests: string[] = [];
  page.on("request", (r) => r.url().includes("/api/ai/integrations") && requests.push(r.method()));
  await startDraft(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(address());
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("button", { name: "Not now" }).click();
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);
  await openWriter(page);
  await expect(page.getByRole("button", { name: "Set up an integration" })).toBeVisible();
  expect(requests).toEqual(["GET"]);
});
