import { expect, test, type APIRequestContext } from "@playwright/test";
import { SITE, asVisitor, linkIn, mailTo, password, sentTo, signUp, unique } from "./mail-server";

// These specs run against the server that sends mail (see playwright.config.ts).
test.use({ baseURL: SITE });

const CONFIRM = /confirm your new email/i;
const NOTICE = /email was changed/i;
const ask = (request: APIRequestContext, email: string, current = password) =>
  request.post("/api/auth/email", { data: { email, current } });
const login = (request: APIRequestContext, email: string) =>
  request.post("/api/auth/login", { data: { email, password }, headers: asVisitor() });

test("a link to the new address changes it, tells the old one, and ends other devices", async ({
  request,
  playwright,
}) => {
  const old = `old-${unique()}@example.com`;
  const fresh = `fresh-${unique()}@example.com`;
  await signUp(request, old);
  const other = await playwright.request.newContext({ baseURL: SITE });
  expect((await login(other, old)).status()).toBe(200);

  // the password is checked, and nothing is sent for a wrong one
  const wrong = await ask(request, fresh, "not the password at all");
  expect(wrong.status()).toBe(401);
  expect((await wrong.json()).error).toBe("wrong_password");
  expect(await sentTo(fresh, CONFIRM)).toBe(0);

  expect((await ask(request, fresh)).status()).toBe(200);
  const link = linkIn(await mailTo(fresh, CONFIRM));
  expect(link.pathname).toBe("/api/auth/email/confirm");
  // nothing has changed yet
  expect((await login(other, old)).status()).toBe(200);

  const opened = await request.get(link.pathname + link.search, { maxRedirects: 0 });
  expect(opened.status()).toBe(302);
  expect(opened.headers()["location"]).toContain("email_changed=1");
  await mailTo(old, NOTICE);

  expect((await login(request, old)).status()).toBe(401);
  expect((await login(request, fresh)).status()).toBe(200);
  // this browser (which opened the link) stays signed in; the other device was signed out
  const me = await (await request.get("/api/auth/me")).json();
  expect(me.user.email).toBe(fresh);
  expect((await (await other.get("/api/auth/me")).json()).user).toBeNull();

  const again = await request.get(link.pathname + link.search, { maxRedirects: 0 });
  expect(again.headers()["location"]).toContain("auth_error=email_change_failed");
  await other.dispose();
});

test("an address another account has, or one's own, is refused", async ({ request }) => {
  const mine = `mine-${unique()}@example.com`;
  const theirs = `theirs-${unique()}@example.com`;
  await signUp(request, theirs);
  await request.post("/api/auth/logout");
  await signUp(request, mine);
  const taken = await ask(request, theirs);
  expect(taken.status()).toBe(409);
  expect((await taken.json()).error).toBe("email_taken");
  const same = await ask(request, mine.toUpperCase());
  expect((await same.json()).error).toBe("same_email");
  expect(await sentTo(theirs, CONFIRM)).toBe(0);
});

test("in the app: the Email row sends the link, and opening it shows the new address", async ({
  page,
}) => {
  const old = `app-old-${unique()}@example.com`;
  const fresh = `app-fresh-${unique()}@example.com`;
  await page.setExtraHTTPHeaders(asVisitor());
  await signUp(page.request, old);
  await page.goto("/settings?tab=account");
  await page
    .getByText("Email", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'justify-between')][1]")
    .getByRole("button", { name: "Edit" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Change email" });
  await dialog.getByLabel("New email address").fill(fresh);
  await dialog.getByLabel("Current password").fill(password);
  await dialog.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByText("Check your new inbox")).toBeVisible();

  await page.goto(linkIn(await mailTo(fresh, CONFIRM)).toString());
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByText("Email changed")).toBeVisible();
  await expect(page.getByRole("region", { name: "Account" })).toContainText(fresh);
});
