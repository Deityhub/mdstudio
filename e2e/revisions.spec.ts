import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { startDraft } from "./draft";

// The first server keeps a version at every sync and only the last 3 (see playwright.config.ts).
const password = "a long enough password";
const email = () => `rev-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function signUp(request: APIRequestContext) {
  await request.post("/api/auth/signup", { data: { email: email(), password } });
  return (await (await request.get("/api/auth/me")).json()).user.id as string;
}
const push = (
  request: APIRequestContext,
  id: string,
  baseVersion: number,
  content: string,
  extra = {},
) =>
  request.post("/api/sync/push", {
    data: {
      docs: [
        { id, baseVersion, title: "Notes", content, createdAt: 1, editedAt: Date.now(), ...extra },
      ],
    },
  });
const revisionsUrl = (id: string) => `/api/documents/${encodeURIComponent(id)}/revisions`;

test("the cloud keeps the text each push replaces, newest first, only the last few", async ({
  request,
  playwright,
}) => {
  expect((await request.get(revisionsUrl("x:y"))).status()).toBe(401);
  const me = await signUp(request);
  const id = `${me}:doc1`;
  await push(request, id, 0, "# Draft\n\nversion one");
  for (let v = 1; v <= 5; v++) await push(request, id, v, `# Draft\n\nversion ${v + 1}`);

  const listed = await (await request.get(revisionsUrl(id))).json();
  // six versions were written; the document is the sixth, and only the last 3 earlier ones stay
  expect(listed.max).toBe(3);
  expect(listed.revisions.map((r: { version: number }) => r.version)).toEqual([5, 4, 3]);
  expect(listed.revisions[0]).not.toHaveProperty("content");

  const one = await (await request.get(`${revisionsUrl(id)}/${listed.revisions[0].id}`)).json();
  expect(one.revision.content).toBe("# Draft\n\nversion 5");

  // nobody else can read them, whatever id they ask for
  const other = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signUp(other);
  expect((await (await other.get(revisionsUrl(id))).json()).revisions).toEqual([]);
  expect((await other.get(`${revisionsUrl(id)}/${listed.revisions[0].id}`)).status()).toBe(404);
  await other.dispose();

  // deleting the draft deletes its history
  await push(request, id, 6, "", { deleted: true });
  expect((await (await request.get(revisionsUrl(id))).json()).revisions).toEqual([]);
});

const editor = (page: Page) => page.locator(".cm-content");
async function replaceText(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}

test("History lists the cloud's versions of a cloud draft, and one can be compared and restored", async ({
  page,
}) => {
  const address = email();
  await startDraft(page);
  await expect(editor(page)).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("button", { name: "Not now" }).click();

  await replaceText(page, "# Cloudy\n\nfirst words");
  await page.getByRole("button", { name: "Options for Cloudy" }).click();
  await page.getByRole("menuitem", { name: "Save to cloud" }).click();
  await expect(page.getByLabel("Stored in your cloud")).toBeVisible();
  const pulled = async () => (await (await page.request.get("/api/sync/pull")).json()).docs;
  // a sync round starts a few seconds after an edit, and takes longer on a busy machine
  const onCloud = (words: string) =>
    expect
      .poll(
        async () => (await pulled()).some((d: { content: string }) => d.content.includes(words)),
        {
          timeout: 30_000,
        },
      )
      .toBe(true);
  await onCloud("first words");

  await replaceText(page, "# Cloudy\n\nsecond words");
  await onCloud("second words");
  await replaceText(page, "# Cloudy\n\nthird words");
  await onCloud("third words");

  await page.getByRole("button", { name: "History", exact: true }).click();
  const cloud = page.getByRole("region", { name: "Versions in your cloud" });
  // at least the first and second texts (a sync can also catch a draft mid-edit), at most the 3 kept
  await expect
    .poll(async () => await cloud.getByRole("button").count(), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(2);
  expect(await cloud.getByRole("button").count()).toBeLessThanOrEqual(3);
  // newest first: the second text, then the first (the draft may also have been caught earlier)
  await cloud.getByRole("button").nth(1).click();
  const dialog = page.getByRole("dialog", { name: "Compare with the current draft" });
  await expect(dialog.getByLabel("Line differences")).toContainText("first words");
  await dialog.getByRole("button", { name: "Restore this version" }).click();
  await expect(editor(page)).toContainText("first words");
});
