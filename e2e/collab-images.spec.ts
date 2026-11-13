import { expect, test } from "@playwright/test";
import { bothInDraft } from "./collab-people";
import { editor } from "./sync-helpers";

// Images added from a computer to a draft edited together stay in that browser: the others are told.

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("a local image is warned about for the one who added it and for the others, and hosting fixes both", async ({
  browser,
}) => {
  const { a, b, contexts } = await bothInDraft(browser);
  // Bea's draft is not in her own cloud list, so her image stays on her computer
  await b
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
  await expect(b.getByText("Only you can see this image")).toBeVisible({ timeout: 15_000 });
  await expect(b.getByTestId("local-images-note")).toHaveText("1 image only you can see");
  await expect(editor(a)).toContainText("./images/photo.png");

  // the owner is told the image is not shared with them, and the preview marks it
  await expect(a.getByTestId("missing-images-note")).toHaveText("1 image isn't shared with you");
  await expect(a.locator(".md-preview img[data-unshared]")).toHaveCount(1);
  await a.getByTestId("missing-images-note").click();
  await expect(a.getByRole("dialog")).toContainText("Ask them to host the images");
  await a.keyboard.press("Escape");

  // Bea hosts it: the text points at the hosted copy and both warnings go
  await b.getByTestId("local-images-note").click();
  await b.getByRole("button", { name: "Host these images" }).click();
  await expect(b.getByTestId("local-images-note")).toHaveCount(0, { timeout: 20_000 });
  await expect(editor(a)).toContainText("/a/", { timeout: 20_000 });
  await expect(a.getByTestId("missing-images-note")).toHaveCount(0);
  await expect(a.locator(".md-preview img[data-unshared]")).toHaveCount(0);
  for (const c of contexts) await c.close();
});

test("a draft with no local images shows no image notes", async ({ browser }) => {
  const { a, b, contexts } = await bothInDraft(browser);
  await expect(a.getByTestId("local-images-note")).toHaveCount(0);
  await expect(b.getByTestId("missing-images-note")).toHaveCount(0);
  for (const c of contexts) await c.close();
});
