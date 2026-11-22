import { expect, test, type Page } from "@playwright/test";
import { SITE } from "./mail-server";
import { fileOn, publish, unique, writer } from "./github-helpers";

// The Publish to GitHub dialog in the editor, against the fake GitHub (see playwright.config.ts).
test.use({ baseURL: SITE });

async function openPublish(page: Page) {
  await page.goto("/editor");
  // the cloud draft arrives with the first sync
  await page.getByRole("button", { name: "Options for Notes" }).click({ timeout: 20_000 });
  await page.getByRole("menuitem", { name: "Publish", exact: true }).click();
  return page.getByRole("dialog", { name: "Publish to GitHub" });
}
async function fillTarget(dialog: ReturnType<Page["getByRole"]>, page: Page, path: string) {
  await dialog.getByRole("combobox", { name: "Repository" }).click();
  await page.getByRole("option", { name: "octo/blog" }).click();
  await expect(dialog.getByRole("combobox", { name: "Branch" })).toContainText("main");
  await dialog.getByRole("textbox", { name: "File path" }).fill(path);
}

test("a writer connects GitHub from the dialog, comes back to it, and commits the draft", async ({
  playwright,
  browser,
}) => {
  const { context, page, content } = await writer(playwright, browser, "gu-commit", {
    connect: false,
  });
  const dialog = await openPublish(page);
  await expect(dialog.getByRole("button", { name: "Connect GitHub" })).toBeVisible();
  await dialog.getByRole("button", { name: "Connect GitHub" }).click();

  // back from GitHub, the dialog opens again on the same draft
  await expect(page.getByRole("dialog", { name: "Publish to GitHub" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(dialog.getByText("octo")).toBeVisible();

  const path = `ui/${unique()}.md`;
  await fillTarget(dialog, page, path);
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(dialog.getByText("Published", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "View the file" })).toHaveAttribute(
    "href",
    new RegExp(`/octo/blog/blob/main/${path}$`),
  );
  expect((await fileOn("octo/blog", "main", path))?.content).toBe(content);
  await context.close();
});

test("it can open a pull request, and shows what the GitHub check finds", async ({
  playwright,
  browser,
}) => {
  const { context, page, id } = await writer(playwright, browser, "gu-pr");
  const dialog = await openPublish(page);
  // the draft has a local image that is not in this browser: the GitHub profile says so
  await expect(dialog.getByLabel("Checks for GitHub")).toBeVisible({ timeout: 20_000 });
  const path = `ui-pr-${unique()}.md`;
  await fillTarget(dialog, page, path);
  await dialog.getByLabel("Open a pull request").check();
  await dialog.getByRole("button", { name: "Open pull request" }).click();
  await expect(dialog.getByRole("link", { name: "Open the pull request" })).toBeVisible();
  expect(await fileOn("octo/blog", "main", path)).toBeNull();
  // what was published is remembered for the next time
  const saved = await (await page.request.get(`/api/github/publications/${id}`)).json();
  expect(saved.publications).toMatchObject([{ kind: "file", path }]);
  await context.close();
});

test("a file that is already there is only replaced after the writer agrees", async ({
  playwright,
  browser,
}) => {
  const other = await writer(playwright, browser, "gu-other");
  const path = `ui-taken-${unique()}.md`;
  expect(
    (
      await publish(other.page, {
        target: "file",
        id: other.id,
        repo: "octo/blog",
        branch: "main",
        path,
        mode: "commit",
      })
    ).status(),
  ).toBe(200);

  const { context, page, content } = await writer(playwright, browser, "gu-replace");
  const dialog = await openPublish(page);
  await fillTarget(dialog, page, path);
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("is already in octo/blog");
  await dialog.getByRole("button", { name: "Replace it" }).click();
  await expect(dialog.getByText("Published", { exact: true })).toBeVisible();
  expect((await fileOn("octo/blog", "main", path))?.content).toBe(content);
  await Promise.all([context.close(), other.context.close()]);
});

test("a gist is created from the Gist tab, and the connection can be ended", async ({
  playwright,
  browser,
}) => {
  const { context, page } = await writer(playwright, browser, "gu-gist");
  const dialog = await openPublish(page);
  await dialog.getByRole("tab", { name: "Gist" }).click();
  await dialog.getByRole("button", { name: "Create gist" }).click();
  await expect(dialog.getByRole("link", { name: "View the gist" })).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  const again = await (async () => {
    await page.getByRole("button", { name: "Options for Notes" }).click();
    await page.getByRole("menuitem", { name: "Publish", exact: true }).click();
    return page.getByRole("dialog", { name: "Publish to GitHub" });
  })();
  // the gist is remembered, so the next publish updates it
  await expect(again.getByRole("button", { name: "Update gist" })).toBeVisible();
  await again.getByRole("button", { name: "Disconnect" }).click();
  await expect(again.getByRole("button", { name: "Connect GitHub" })).toBeVisible();
  await context.close();
});
