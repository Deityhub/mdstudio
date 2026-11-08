import { expect, test, type Browser, type Page } from "@playwright/test";
import { SITE, asVisitor, password, unique } from "./mail-server";
import { account, shareDraft } from "./review-helpers";

// The share page for readers: the private-link gate and comments, with real accounts on the server
// that confirms email addresses (see playwright.config.ts).
test.use({ baseURL: SITE });

const body = (page: Page) => page.locator(".md-preview");
async function reader(browser: Browser) {
  const context = await browser.newContext({ baseURL: SITE, extraHTTPHeaders: asVisitor() });
  return { context, page: await context.newPage() };
}
/** Selects words in the page the way a reader does, so the Comment button offers itself. */
async function selectWords(page: Page, words: string) {
  await page.evaluate((text) => {
    const root = document.querySelector(".md-preview")!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent!.indexOf(text);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(n, at);
      range.setEnd(n, at + text.length);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    throw new Error(`no text: ${text}`);
  }, words);
}
/** Signs in through the page's own dialog. */
async function signInOnPage(page: Page, email: string) {
  await page.getByRole("dialog").getByLabel("Email").fill(email);
  await page.getByRole("dialog").getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("dialog").getByRole("button", { name: "Sign in", exact: true }).click();
}

test("a private link shows a stranger a sign-in page and none of the text, then opens for the invited", async ({
  playwright,
  browser,
}) => {
  const owner = await account(playwright, "gate-owner");
  const invited = await account(playwright, "gate-invited");
  const { id, slug } = await shareDraft(owner, { access: "people" });
  await owner.request.post(`/api/share/${id}/people`, { data: { email: invited.email } });

  const { context, page } = await reader(browser);
  const response = await page.goto(`/s/${slug}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByRole("heading", { name: "This document is private" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect(await page.content()).not.toContain("Ship on Friday");

  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await signInOnPage(page, invited.email);
  await expect(body(page).getByRole("heading", { name: "Quarterly plan" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Only the people the writer named can open this")).toBeVisible();
  await context.close();
});

test("someone signed in who was not invited gets a plain not-found page", async ({
  playwright,
  browser,
}) => {
  const owner = await account(playwright, "nf-owner");
  const outsider = await account(playwright, "nf-outsider");
  const { slug } = await shareDraft(owner, { access: "people" });
  const { context, page } = await reader(browser);
  await page.goto(`/s/${slug}`);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await signInOnPage(page, outsider.email);
  await expect(page.getByText("Signed in", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Ship on Friday")).toHaveCount(0);
  expect((await page.goto(`/s/${slug}`))?.status()).toBe(404);
  await context.close();
});

test("readers sign in to comment on selected words, reply, and take a comment back, in plain text", async ({
  playwright,
  browser,
}) => {
  const owner = await account(playwright, "cm-owner");
  const reviewer = await account(playwright, "cm-reviewer");
  const { slug } = await shareDraft(owner, { comments: true });

  const { context, page } = await reader(browser);
  await page.goto(`/s/${slug}`);
  await expect(body(page).getByText("Ship on Friday.")).toBeVisible();
  // a stranger can read the page, and is asked to sign in for the comments
  await expect(page.getByText("The writer is taking comments.")).toBeVisible();
  await page.getByRole("button", { name: "Sign in to read and write comments" }).click();
  await signInOnPage(page, reviewer.email);
  await expect(page.getByText("The writer is taking comments.")).toBeHidden({ timeout: 20_000 });

  await selectWords(page, "Friday");
  await page.getByRole("button", { name: "Comment on selection" }).click();
  await page.getByLabel("Add a comment").fill("<img src=x onerror=window.__x=1> Which Friday?");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const mine = page.getByText("Which Friday?");
  await expect(mine).toBeVisible();
  await expect(page.locator("img[src='x']")).toHaveCount(0); // text, not markup
  expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
  // the words it is about stay highlighted
  await expect(body(page).locator("mark.share-hl")).toHaveText("Friday");

  // it is still there after a reload, under the same block
  await page.reload();
  await expect(page.getByText("Which Friday?")).toBeVisible({ timeout: 20_000 });

  // the column can be hidden, and a click on the highlighted words brings it back
  await page.getByRole("button", { name: "Hide comments" }).click();
  await expect(page.getByText("Which Friday?")).toBeHidden();
  await body(page).locator("mark.share-hl").click();
  await expect(page.getByText("Which Friday?")).toBeVisible();

  await page.getByRole("button", { name: "Reply" }).click();
  await page.getByLabel("Write a reply").fill("The 14th");
  await page.getByRole("button", { name: "Reply", exact: true }).last().click();
  await expect(page.getByText("The 14th")).toBeVisible();

  // the owner, who is also a reader here, sees both and the author names are not addresses
  await expect(page.locator("body")).not.toContainText(reviewer.email);

  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("Which Friday?")).toHaveCount(0);
  await expect(page.getByText("The 14th")).toHaveCount(0); // the reply went with it
  await context.close();
});

test("a new account is asked to confirm its email before it can comment", async ({
  playwright,
  browser,
}) => {
  const owner = await account(playwright, "uc-owner");
  const { slug } = await shareDraft(owner, { comments: true });
  const { context, page } = await reader(browser);
  await page.goto(`/s/${slug}`);
  await page.getByRole("button", { name: "Sign in to read and write comments" }).click();
  await page.getByRole("dialog").getByRole("tab", { name: "Create account" }).click();
  await page.getByRole("dialog").getByLabel("Email").fill(`uc-${unique()}@example.com`);
  await page.getByRole("dialog").getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByText("Confirm your email address to read and write them.")).toBeVisible({
    timeout: 20_000,
  });
  await context.close();
});

test("a comment from an earlier copy is marked once the writer publishes an update", async ({
  playwright,
  browser,
}) => {
  const owner = await account(playwright, "od-owner");
  const reviewer = await account(playwright, "od-reviewer");
  const { id, slug } = await shareDraft(owner, { comments: true });
  expect(
    (
      await reviewer.request.post(`/api/s/${slug}/comments`, {
        data: { body: "Check this", line: 3, snippet: "Ship on Friday." },
      })
    ).status(),
  ).toBe(200);

  // the writer rewrites the text so the block moves down, and publishes the update
  await owner.request.post("/api/sync/push", {
    data: {
      docs: [
        {
          id: `${owner.id}:${id}`,
          baseVersion: 1,
          title: "Quarterly plan",
          content: "# Quarterly plan\n\nA new opening paragraph.\n\nShip on Friday.",
          createdAt: Date.now(),
          editedAt: Date.now() + 1000,
        },
      ],
    },
  });
  expect((await owner.request.post("/api/share", { data: { id } })).status()).toBe(200);

  const { context, page } = await reader(browser);
  await page.goto(`/s/${slug}`);
  await page.getByRole("button", { name: "Sign in to read and write comments" }).click();
  await signInOnPage(page, reviewer.email);
  await expect(page.getByText("Check this")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Earlier version")).toBeVisible();
  await context.close();
});
