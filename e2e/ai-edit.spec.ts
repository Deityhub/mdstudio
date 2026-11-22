import { expect, test, type Page } from "@playwright/test";
import { startDraft } from "./draft";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST, OPTIONS",
};

/** A local Ollama that answers every request with the same words, so nothing leaves the test. */
async function fakeOllama(page: Page, answer: string) {
  const seen: unknown[] = [];
  await page.route("http://localhost:11434/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (request.method() === "GET")
      return route.fulfill({
        status: 200,
        headers: { ...CORS, "content-type": "application/json" },
        body: JSON.stringify({ data: [{ id: "llama3.2" }, { id: "qwen3" }] }),
      });
    seen.push(request.postDataJSON());
    const chunk = (delta: object, finish?: string) =>
      `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish ?? null }] })}\n\n`;
    await route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": "text/event-stream" },
      body: chunk({ content: answer }) + chunk({}, "stop"),
    });
  });
  return seen;
}

/** Sets up a local Ollama integration in the dialog that is open on its form. */
async function addOllama(page: Page) {
  await page.getByLabel("AI provider").click();
  await page.getByRole("option", { name: /Ollama/ }).click();
  await page.getByLabel("Model IDs").fill("llama3.2");
  await page.getByRole("button", { name: "Add integration" }).click();
}

async function selectAll(page: Page) {
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
}

test("an AI action on the selection shows a diff and changes nothing until it is accepted", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const seen = await fakeOllama(page, "A short sentence.");
  await startDraft(page);
  await selectAll(page);
  await page.keyboard.insertText("A very long and wordy sentence that goes on and on.");
  await selectAll(page);
  // on a wide screen a small AI button also appears over the selection
  await expect(page.getByRole("button", { name: "AI actions on the selection" })).toBeVisible();

  await page.getByRole("button", { name: "AI actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Make shorter" }).click();
  // first use: set one up in a second dialog, then come back with it selected
  await page.getByRole("button", { name: "Set up an integration" }).click();
  await addOllama(page);
  await expect(page.getByRole("dialog", { name: "AI integrations" })).toBeHidden();
  await expect(page.getByRole("combobox", { name: "AI integration" })).toContainText("Ollama");
  await expect(page.getByRole("combobox", { name: "Model" })).toContainText("llama3.2");
  await page.getByRole("button", { name: "Run", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Line differences")).toContainText("A short sentence.");
  expect(JSON.stringify(seen[0])).toContain("A very long and wordy sentence");
  await expect(page.locator(".cm-content")).toContainText("A very long and wordy");

  await dialog.getByRole("button", { name: "Accept" }).click();
  await expect(page.locator(".cm-content")).toContainText("A short sentence.");
  await expect(page.locator(".cm-content")).not.toContainText("wordy");

  // one undo puts the old text back
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".cm-content")).toContainText("A very long and wordy");
});

test("discarding leaves the draft alone, and the connection is remembered for next time", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await fakeOllama(page, "Bonjour.");
  await startDraft(page);
  await selectAll(page);
  await page.keyboard.insertText("Hello.");
  await selectAll(page);

  await page.getByRole("button", { name: "AI actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "AI integrations" }).click();
  await addOllama(page);
  await expect(page.getByText("Ready")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await selectAll(page);

  await page.getByRole("button", { name: "AI actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Translate" }).click();
  await page.getByLabel("Translate into").fill("French");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByLabel("Line differences")).toContainText("Bonjour.");
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.locator(".cm-content")).toContainText("Hello.");

  await page.reload();
  await page.getByRole("button", { name: "AI actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "AI integrations" }).click();
  await expect(page.getByText("Ollama (this computer)").first()).toBeVisible();
});

test("a saved integration with a key asks for the key again after a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await startDraft(page);
  await page.getByRole("button", { name: "AI writer" }).click();
  await page.getByRole("button", { name: "Set up an integration" }).click();
  await page.getByLabel("API key").fill("a-test-key");
  await page.getByRole("button", { name: "Add integration" }).click();
  // a built-in list of models is offered for a hosted provider
  await page.getByRole("combobox", { name: "Model" }).click();
  expect(await page.getByRole("option").count()).toBeGreaterThan(1);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("a-test-key");

  await page.reload();
  await page.getByRole("button", { name: "AI writer" }).click();
  await expect(page.getByText("needs its API key again")).toBeVisible();
  await page.getByRole("button", { name: "Add key" }).click();
  await expect(page.getByLabel("API key")).toHaveValue("");
});

test("the AI writer keeps its buttons in view, and forgets a suggestion once it is applied", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 600 });
  await fakeOllama(page, JSON.stringify({ title: "Better title", description: "D", tags: ["a"] }));
  await startDraft(page);
  await page.getByRole("button", { name: "AI writer" }).click();
  await page.getByRole("button", { name: "Set up an integration" }).click();
  await addOllama(page);
  await page.getByRole("button", { name: "Suggest metadata" }).click();
  const apply = page.getByRole("button", { name: "Apply to current draft" });
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Better title");
  // the footer stays put however long the result is
  await expect(apply).toBeInViewport();
  await apply.click();
  await expect(page.getByLabel("Title", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "AI writer" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
});

test("an action with nothing selected asks for a selection", async ({ page }) => {
  await startDraft(page);
  await page.getByRole("button", { name: "AI actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Make shorter" }).click();
  await expect(page.getByText("Select some text first")).toBeVisible();
});

test("choosing an action sends nothing until the writer presses Run", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const seen = await fakeOllama(page, "Shorter.");
  await startDraft(page);
  await selectAll(page);
  await page.keyboard.insertText("A long sentence.");
  await selectAll(page);
  await page.getByRole("button", { name: "AI actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "AI integrations" }).click();
  await addOllama(page);
  await page.getByRole("button", { name: "Close" }).click();
  await selectAll(page);

  await page.getByRole("button", { name: "AI actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Make shorter" }).click();
  await expect(page.getByRole("combobox", { name: "AI integration" })).toBeVisible();
  const run = page.getByRole("button", { name: "Run", exact: true });
  await expect(run).toBeEnabled();
  expect(seen).toHaveLength(0);
  await run.click();
  await expect(page.getByLabel("Line differences")).toContainText("Shorter.");
  expect(seen).toHaveLength(1);
});

test("a flagged check can be fixed with AI, reviewed and applied", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const seen = await fakeOllama(page, "Hello **world**");
  await startDraft(page);
  await selectAll(page);
  await page.keyboard.insertText("Hello <b>world</b>");
  await page.getByRole("button", { name: "Checks", exact: true }).click();
  await page.getByRole("button", { name: "Fix with AI" }).first().click();
  await page.getByRole("button", { name: "Set up an integration" }).click();
  await addOllama(page);
  expect(seen).toHaveLength(0);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByLabel("Line differences")).toContainText("Hello **world**");
  expect(JSON.stringify(seen[0])).toContain("Raw HTML");
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.locator(".cm-content")).toContainText("Hello **world**");
  await expect(page.locator(".cm-content")).not.toContainText("<b>");
});

test("a missing alt text offers to suggest one", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await fakeOllama(page, "![A sunrise over the sea](sunrise.png)");
  await startDraft(page);
  await selectAll(page);
  await page.keyboard.insertText("![](sunrise.png)");
  await page.getByRole("button", { name: "Checks", exact: true }).click();
  await page.getByRole("button", { name: "Suggest alt text" }).click();
  await page.getByRole("button", { name: "Set up an integration" }).click();
  await addOllama(page);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.locator(".cm-content")).toContainText("A sunrise over the sea");
});

test("refreshing lists the models a local Ollama has, and a connection can be tested", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await fakeOllama(page, "x");
  await startDraft(page);
  await page.getByRole("button", { name: "AI writer" }).click();
  await page.getByRole("button", { name: "Set up an integration" }).click();
  await page.getByLabel("AI provider").click();
  await page.getByRole("option", { name: /Ollama/ }).click();
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("status").filter({ hasText: "It works. 2 models" })).toBeVisible();
  await page.getByRole("button", { name: "Add integration" }).click();
  await expect(page.getByRole("combobox", { name: "Model" })).toContainText("No models yet");
  await page.getByRole("button", { name: "Refresh models" }).click();
  await page.getByRole("combobox", { name: "Model" }).click();
  await expect(page.getByRole("option", { name: "qwen3" })).toBeVisible();
});

test("presets fill in a custom endpoint", async ({ page }) => {
  await startDraft(page);
  await page.getByRole("button", { name: "AI writer" }).click();
  await page.getByRole("button", { name: "Set up an integration" }).click();
  await page.getByLabel("AI provider").click();
  await page.getByRole("option", { name: /Custom/ }).click();
  await page.getByRole("button", { name: "Groq" }).click();
  await expect(page.getByLabel("API base URL")).toHaveValue("https://api.groq.com/openai/v1");
  await expect(page.getByLabel("Name (optional)")).toHaveValue("Groq");
});

