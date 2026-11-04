import { expect, test, type Page } from "@playwright/test";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const editor = (page: Page) => page.locator(".cm-content");

async function signedIn(page: Page) {
  const address = `pics-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto("/editor");
  await expect(editor(page)).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password", { exact: true }).fill("a long enough password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("button", { name: "Not now" }).click();
  return address;
}

async function replaceText(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}

const addPng = (page: Page, name = "photo.png") =>
  page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name, mimeType: "image/png", buffer: PNG });

async function toCloud(page: Page, title: string) {
  await page.getByRole("button", { name: `Options for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Save to cloud" }).click();
  await expect(page.getByLabel("Stored in your cloud")).toBeVisible();
}

test("an image added to a cloud draft is hosted and linked by address", async ({ page }) => {
  const address = await signedIn(page);
  await replaceText(page, "# Pictures\n\n");
  await toCloud(page, "Pictures");

  await addPng(page);
  await expect(editor(page)).toContainText("/a/", { timeout: 15_000 });
  const text = await editor(page).innerText();
  const url = text.match(/\((https?:\/\/[^)]+\/a\/[0-9a-f]{32}\.png)\)/)?.[1];
  expect(url).toBeTruthy();
  // the link works for anyone, and nothing was kept in the draft
  expect((await page.request.get(url!)).status()).toBe(200);
  await expect(editor(page)).not.toContainText("./images/");

  await page.getByRole("button", { name: `Account: ${address}` }).click();
  await page.getByRole("menuitem", { name: "Manage images…" }).click();
  const dialog = page.getByRole("dialog", { name: "Your hosted images" });
  await expect(dialog.getByTestId("image-usage")).toContainText("1 of 10 images");
  await expect(dialog.getByText("photo.png")).toBeVisible();

  await dialog.getByRole("button", { name: "Delete photo.png" }).click();
  await expect(
    dialog.getByText("Posts that link to this image will stop showing it."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog.getByTestId("image-usage")).toContainText("0 of 10 images");
  expect((await page.request.get(url!)).status()).toBe(404);
});

test("a draft that is not in the cloud keeps its images, and they can be hosted later", async ({
  page,
}) => {
  await signedIn(page);
  await replaceText(page, "# Later\n\n");
  await addPng(page);
  await expect(editor(page)).toContainText("./images/photo.png");

  // moving the draft to the cloud does not touch the text; hosting is a separate, explicit step
  await toCloud(page, "Later");
  await expect(editor(page)).toContainText("./images/photo.png");
  await page.getByRole("button", { name: "Options for Later" }).click();
  await page.getByRole("menuitem", { name: "Host images (1)" }).click();
  await expect(editor(page)).toContainText("/a/", { timeout: 15_000 });
  await expect(editor(page)).not.toContainText("./images/");
  await page.getByRole("button", { name: "Options for Later" }).click();
  await expect(page.getByRole("menuitem", { name: /Host images/ })).toHaveCount(0);
});
