import { expect, test, type Browser } from "@playwright/test";
import { cloudDraft, openShare, password, signIn } from "./draft";

/** A second, signed-in account in its own browser context (the e2e server confirms everyone). */
async function reviewer(browser: Browser) {
  const context = await browser.newContext();
  const email = `rev-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const signup = await context.request.post("/api/auth/signup", { data: { email, password } });
  expect(signup.status()).toBe(200);
  return { context, email, page: await context.newPage() };
}

test("a link made for named people is private from the first moment, and they are managed in the dialog", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await cloudDraft(page, "Contract draft", "Clause one");
  const dialog = await openShare(page, "Contract draft");

  // chosen before publishing, so the link is never public first
  await dialog.getByRole("combobox", { name: "Who can open it" }).click();
  await page.getByRole("option", { name: "Only people I invite" }).click();
  await dialog.getByRole("switch", { name: "Let reviewers comment" }).click();
  await dialog.getByRole("button", { name: "Publish" }).click();
  const link = dialog.getByRole("textbox", { name: "Private link" });
  await expect(link).toHaveValue(/\/s\/[\w-]{12}$/);
  const url = await link.inputValue();

  // a stranger is asked to sign in and sees none of the text
  const stranger = await browser.newContext();
  const outsider = await stranger.newPage();
  await outsider.goto(url);
  await expect(outsider.getByText("Clause one")).toBeHidden();
  await expect(outsider.getByRole("button", { name: /sign in/i }).first()).toBeVisible();

  // invite and remove
  const guest = await reviewer(browser);
  await dialog.getByLabel("Invite by email").fill(guest.email);
  await dialog.getByRole("button", { name: "Invite" }).click();
  const row = dialog.getByRole("listitem").filter({ hasText: guest.email });
  await expect(row).toBeVisible();
  await guest.page.goto(url);
  await expect(guest.page.locator(".md-preview")).toContainText("Clause one");

  await row.getByRole("button", { name: `Remove ${guest.email}` }).click();
  await expect(row).toBeHidden();
  await guest.page.reload();
  await expect(guest.page.getByText("Clause one")).toBeHidden();

  // back to anyone with the link
  await dialog.getByRole("combobox", { name: "Who can open it" }).click();
  await page.getByRole("option", { name: "Anyone with the link" }).click();
  await expect(dialog.getByRole("textbox", { name: "Public link" })).toBeVisible();
  await outsider.reload();
  await expect(outsider.locator(".md-preview")).toContainText("Clause one");

  await stranger.close();
  await guest.context.close();
});

test("the writer reads, resolves and deletes the comments left on a link from the editor", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await cloudDraft(page, "Launch post", "Intro paragraph");
  const dialog = await openShare(page, "Launch post");
  await dialog.getByRole("switch", { name: "Let reviewers comment" }).click();
  await dialog.getByRole("button", { name: "Publish" }).click();
  const slug = (await dialog.getByRole("textbox", { name: "Public link" }).inputValue()).split(
    "/s/",
  )[1]!;
  await dialog.getByRole("button", { name: "Close" }).first().click();

  const guest = await reviewer(browser);
  const said = await guest.context.request.post(`/api/s/${slug}/comments`, {
    data: { body: "Tighten the intro", line: 3, snippet: "Intro paragraph" },
  });
  expect(said.status()).toBe(200);

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const panel = page.getByRole("complementary");
  await expect(panel.getByText("Tighten the intro")).toBeVisible();
  await expect(panel.getByText("Line 3")).toBeVisible();

  await panel.getByRole("button", { name: "Resolve" }).click();
  await expect(panel.getByRole("button", { name: "Reopen" })).toBeVisible();
  await panel.getByRole("button", { name: "Delete" }).click();
  await expect(panel.getByText("Tighten the intro")).toBeHidden();
  await expect(panel.getByText("No comments yet")).toBeVisible();

  await guest.context.close();
});

test("share and comment requests are made only when the writer asks for them", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith("/api/share")) calls.push(`${r.method()} ${path}`);
  });
  await signIn(page);
  await cloudDraft(page, "Quiet draft", "Nothing shared yet");
  await page.waitForTimeout(1500);
  expect(calls).toEqual([]);

  const dialog = await openShare(page, "Quiet draft");
  await expect(dialog.getByRole("button", { name: "Publish" })).toBeVisible();
  expect(calls).toEqual(["GET /api/share"]);
  await dialog.getByRole("button", { name: "Close" }).first().click();

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.getByText("Share this draft with comments turned on")).toBeVisible();
  // the links were already read, so only the comments are asked for
  expect(calls.filter((c) => c === "GET /api/share")).toHaveLength(1);
});
