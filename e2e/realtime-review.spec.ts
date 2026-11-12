import { expect, test, type Browser, type Page } from "@playwright/test";
import { cloudDraft, openShare, password, signIn } from "./draft";

// Review comments and the link's own changes over the real-time channel: what a reader does shows
// in the writer's open panel, and what the writer does shows on the reader's open page, with no
// reload and no request from the page (the minute poll cannot account for any of it).

async function reader(browser: Browser) {
  const context = await browser.newContext();
  const email = `rev-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  expect(
    (await context.request.post("/api/auth/signup", { data: { email, password } })).status(),
  ).toBe(200);
  return { context, page: await context.newPage() };
}

/** Writes a draft, shares it with comments on, and opens the comments panel. */
async function sharedWithComments(page: Page, title: string, body: string) {
  await signIn(page);
  await cloudDraft(page, title, body);
  const dialog = await openShare(page, title);
  await dialog.getByRole("switch", { name: "Let reviewers comment" }).click();
  await dialog.getByRole("button", { name: "Publish" }).click();
  const link = await dialog.getByRole("textbox", { name: "Public link" }).inputValue();
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  return link.split("/s/")[1]!;
}

const say = async (page: Page, slug: string, body: string, line = 3) => {
  const res = await page.request.post(`/api/s/${slug}/comments`, {
    data: { body, line, snippet: "Intro paragraph" },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).comment.id as string;
};

test("a reader's comment, and its removal, show in the writer's open panel at once", async ({
  page,
  browser,
}) => {
  const slug = await sharedWithComments(page, "Live review", "Intro paragraph");
  const guest = await reader(browser);
  await guest.page.goto(`/s/${slug}`);
  await expect(guest.page.locator(".md-preview")).toContainText("Intro paragraph");

  const panel = page.getByRole("complementary");
  await expect(panel.getByText("No comments yet")).toBeVisible();
  const id = await say(guest.page, slug, "Tighten the intro");
  await expect(panel.getByText("Tighten the intro")).toBeVisible({ timeout: 8_000 });

  const reply = await guest.page.request.delete(`/api/s/${slug}/comments/${id}`);
  expect(reply.status()).toBe(200);
  await expect(panel.getByText("Tighten the intro")).toBeHidden({ timeout: 8_000 });
  await guest.context.close();
});

test("the writer resolving and deleting a comment reaches the reader's open page", async ({
  page,
  browser,
}) => {
  const slug = await sharedWithComments(page, "Live replies", "Intro paragraph");
  const guest = await reader(browser);
  await guest.page.goto(`/s/${slug}`);
  const aside = guest.page.getByRole("complementary", { name: "Comments" });
  await say(guest.page, slug, "Is this still right?");
  const panel = page.getByRole("complementary");
  await expect(panel.getByText("Is this still right?")).toBeVisible({ timeout: 8_000 });
  await expect(aside.getByText("Is this still right?")).toBeVisible({ timeout: 8_000 });

  await panel.getByRole("button", { name: "Resolve" }).click();
  await expect(aside.getByText("Resolved", { exact: true })).toBeVisible({ timeout: 8_000 });

  await panel.getByRole("button", { name: "Delete" }).click();
  await expect(aside.getByText("Is this still right?")).toBeHidden({ timeout: 8_000 });
  await guest.context.close();
});

test("two readers see each other's comments as they are written", async ({ page, browser }) => {
  const slug = await sharedWithComments(page, "Two readers", "Intro paragraph");
  const one = await reader(browser);
  const two = await reader(browser);
  for (const r of [one, two]) await r.page.goto(`/s/${slug}`);
  await say(one.page, slug, "From the first reader");
  await expect(
    two.page.getByRole("complementary", { name: "Comments" }).getByText("From the first reader"),
  ).toBeVisible({ timeout: 8_000 });
  await one.context.close();
  await two.context.close();
});

test("publishing an update tells the reader's open page and marks the comments as on an earlier copy", async ({
  page,
  browser,
}) => {
  const slug = await sharedWithComments(page, "Updated post", "Intro paragraph");
  const guest = await reader(browser);
  await guest.page.goto(`/s/${slug}`);
  await say(guest.page, slug, "A note on the first copy");
  const panel = page.getByRole("complementary");
  await expect(panel.getByText("A note on the first copy")).toBeVisible({ timeout: 8_000 });
  await expect(panel.getByText("Written on an earlier published copy.")).toBeHidden();

  const shares = (await (await page.request.get("/api/share")).json()).shares as { id: string }[];
  expect((await page.request.post("/api/share", { data: { id: shares[0]!.id } })).status()).toBe(
    200,
  );
  await expect(guest.page.getByText("The writer published an update.")).toBeVisible({
    timeout: 8_000,
  });
  await expect(panel.getByText("Written on an earlier published copy.")).toBeVisible({
    timeout: 8_000,
  });
  await guest.context.close();
});

test("withdrawing a link tells the reader's open page", async ({ page, browser }) => {
  const slug = await sharedWithComments(page, "Withdrawn post", "Intro paragraph");
  const guest = await reader(browser);
  await guest.page.goto(`/s/${slug}`);
  await expect(guest.page.locator(".md-preview")).toContainText("Intro paragraph");
  const shares = (await (await page.request.get("/api/share")).json()).shares as { id: string }[];
  expect((await page.request.delete(`/api/share/${shares[0]!.id}`)).status()).toBe(200);
  await expect(guest.page.getByText("The writer has stopped sharing this page.")).toBeVisible({
    timeout: 8_000,
  });
  await guest.context.close();
});

test("a link published on one device shows as shared on the writer's other device", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await cloudDraft(page, "Two devices", "Intro paragraph");
  // the second device: the same account, its list of links read once (by opening Share)
  const other = await browser.newContext({ storageState: await page.context().storageState() });
  const second = await other.newPage();
  await second.goto("/editor");
  await expect(
    second.getByRole("navigation", { name: "Drafts" }).getByText("Two devices"),
  ).toBeVisible({ timeout: 20_000 });
  const looked = await openShare(second, "Two devices");
  await expect(looked.getByRole("button", { name: "Publish" })).toBeVisible();
  await looked.getByRole("button", { name: "Close" }).first().click();
  await expect(second.getByLabel("Shared publicly")).toHaveCount(0);

  const dialog = await openShare(page, "Two devices");
  await dialog.getByRole("button", { name: "Publish" }).click();
  await expect(dialog.getByRole("textbox", { name: "Public link" })).toBeVisible();
  await expect(second.getByLabel("Shared publicly")).toBeVisible({ timeout: 8_000 });
  await other.close();
});
