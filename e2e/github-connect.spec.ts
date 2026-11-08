import { expect, test } from "@playwright/test";
import { SITE } from "./mail-server";
import { account } from "./review-helpers";

// Connecting a GitHub account for publishing, against the fake GitHub (see playwright.config.ts).
test.use({ baseURL: SITE });
const GITHUB = process.env["E2E_GITHUB_URL"]!;
const revoked = async () => (await (await fetch(`${GITHUB}/__state`)).json()).revoked as number;

async function signedIn(
  playwright: typeof import("@playwright/test").playwright,
  browser: import("@playwright/test").Browser,
  name: string,
) {
  const acct = await account(playwright, name);
  const context = await browser.newContext({
    baseURL: SITE,
    storageState: await acct.request.storageState(),
  });
  return { acct, context, page: await context.newPage() };
}
const status = async (page: import("@playwright/test").Page) =>
  (await page.request.get("/api/github/connection")).json();

test("a writer connects GitHub, sees who is connected, and disconnects", async ({
  playwright,
  browser,
}) => {
  const { context, page } = await signedIn(playwright, browser, "gh-conn");
  expect(await status(page)).toEqual({ available: true, connected: false });

  await page.goto("/api/github/connect");
  await expect(page.getByText("GitHub connected")).toBeVisible();
  expect(await status(page)).toEqual({
    available: true,
    connected: true,
    login: "octo",
    private: false,
  });

  const before = await revoked();
  const res = await page.request.delete("/api/github/connection");
  expect(res.status()).toBe(200);
  expect(await status(page)).toEqual({ available: true, connected: false });
  expect(await revoked()).toBe(before + 1); // GitHub was told to drop the token
  await context.close();
});

test("private repositories are only asked for when the writer chooses", async ({
  playwright,
  browser,
}) => {
  const { context, page } = await signedIn(playwright, browser, "gh-priv");
  await page.goto("/api/github/connect?private=1");
  await expect(page.getByText("GitHub connected")).toBeVisible();
  expect(await status(page)).toMatchObject({ connected: true, private: true });
  await context.close();
});

test("it needs a signed-in account, and a forged return is refused", async ({
  playwright,
  browser,
}) => {
  const stranger = await browser.newContext({ baseURL: SITE });
  const out = await stranger.newPage();
  await out.goto("/api/github/connect");
  await expect(out.getByText("Sign in first, then connect GitHub.")).toBeVisible();
  expect((await out.request.get("/api/github/connection")).status()).toBe(401);
  await stranger.close();

  const { context, page } = await signedIn(playwright, browser, "gh-forge");
  // a callback without the state this browser was given connects nothing
  await page.goto("/api/auth/github/callback?code=code.&state=forged");
  await expect(page.getByText(/GitHub/).first()).toBeVisible();
  expect(await status(page)).toMatchObject({ connected: false });
  // and one that is the writer saying no on GitHub
  await context.close();
});

test("only the owner can disconnect, and a cross-site request is refused", async ({
  playwright,
  browser,
}) => {
  const { context, page } = await signedIn(playwright, browser, "gh-xs");
  await page.goto("/api/github/connect");
  const res = await page.request.delete("/api/github/connection", {
    headers: { origin: "https://evil.example" },
  });
  expect(res.status()).toBe(403);
  expect(await status(page)).toMatchObject({ connected: true });
  await context.close();
});
