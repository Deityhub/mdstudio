import { expect, test, type APIRequestContext } from "@playwright/test";
import { SITE, asVisitor, linkIn, mailTo, password, sentTo, signUp, unique } from "./mail-server";

// These specs run against the server that confirms email addresses (see playwright.config.ts).
test.use({ baseURL: SITE });

const askForLink = (request: APIRequestContext, force = false) =>
  request.post("/api/auth/verify/resend", { data: { force } });
const pull = (request: APIRequestContext) => request.get("/api/sync/pull");

test("the cloud stays closed until the emailed link is used, once", async ({ request }) => {
  const email = `verify-${unique()}@example.com`;
  expect((await signUp(request, email)).status()).toBe(200);
  expect((await (await request.get("/api/auth/me")).json()).user).toMatchObject({
    emailVerified: false,
  });
  expect((await (await request.get("/api/auth/me")).json()).providers.email).toBe(true);

  const closed = await pull(request);
  expect(closed.status()).toBe(403);
  expect((await closed.json()).error).toBe("email_unverified");
  // signing up sends nothing; the first try at the cloud sends one, and asking again does not
  await new Promise((r) => setTimeout(r, 400));
  expect(sentTo(email)).toBe(0);
  expect((await (await askForLink(request)).json()).sent).toBe(true);
  expect((await (await askForLink(request)).json()).sent).toBe(false);
  const mail = await mailTo(email);
  expect(sentTo(email)).toBe(1);
  expect(mail.subject).toMatch(/confirm/i);
  const link = linkIn(mail);
  const confirmed = await request.get(link.pathname + link.search, { maxRedirects: 0 });
  expect(confirmed.status()).toBe(302);
  expect(confirmed.headers()["location"]).toBe("/editor?verified=1");
  expect((await pull(request)).status()).toBe(200);

  // a link is good once
  const again = await request.get(link.pathname + link.search, { maxRedirects: 0 });
  expect(again.headers()["location"]).toBe("/editor?auth_error=verify_failed");
});

test("one inbox is one account, however it is spelled", async ({ request }) => {
  const base = `inbox${unique().replaceAll("-", "")}`;
  expect((await signUp(request, `${base}@gmail.com`)).status()).toBe(200);
  for (const alias of [`${base}+shop@gmail.com`, `${base.toUpperCase()}@googlemail.com`])
    expect((await signUp(request, alias)).status(), alias).toBe(409);
  // any spelling reaches the same account with the right password
  const login = await request.post("/api/auth/login", {
    data: { email: `${base}+anything@gmail.com`, password },
    headers: asVisitor(),
  });
  expect(login.status()).toBe(200);
});

test("sign-ups are limited per address, and the limit says when to come back", async ({
  request,
}) => {
  const headers = asVisitor();
  for (let n = 0; n < 5; n++)
    expect((await signUp(request, `many-${unique()}@example.com`, headers)).status()).toBe(200);
  const sixth = await signUp(request, `many-${unique()}@example.com`, headers);
  expect(sixth.status()).toBe(429);
  expect(Number(sixth.headers()["retry-after"])).toBeGreaterThan(0);
  expect((await sixth.json()).error).toBe("rate_limited");
  // someone else, from another address, is unaffected
  expect((await signUp(request, `other-${unique()}@example.com`)).status()).toBe(200);
});

test("too many wrong passwords lock the account for a while, even for the right one", async ({
  request,
}) => {
  const email = `lock-${unique()}@example.com`;
  await signUp(request, email);
  const attempt = (pw: string) =>
    request.post("/api/auth/login", { data: { email, password: pw }, headers: asVisitor() });
  for (let n = 0; n < 10; n++) expect((await attempt("wrong wrong wrong")).status()).toBe(401);
  const locked = await attempt(password);
  expect(locked.status()).toBe(429);
  expect(Number(locked.headers()["retry-after"])).toBeGreaterThan(0);
});

test("a confirmation email can be asked for again, three times an hour", async ({ request }) => {
  const email = `resend-${unique()}@example.com`;
  await signUp(request, email);
  for (let n = 0; n < 3; n++) expect((await askForLink(request, true)).status()).toBe(200);
  expect((await askForLink(request, true)).status()).toBe(429);
  expect(sentTo(email)).toBe(3);
  // only the newest link works
  const link = linkIn(await mailTo(email));
  expect(
    (await request.get(link.pathname + link.search, { maxRedirects: 0 })).headers()["location"],
  ).toBe("/editor?verified=1");
});

test("in the app: nothing is sent at sign-up, the first try at the cloud sends the link", async ({
  page,
}) => {
  const email = `ui-${unique()}@example.com`;
  await page.setExtraHTTPHeaders(asVisitor());
  await page.goto("/editor");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: `Account: ${email}` })).toBeVisible();
  // no cloud picker, no "check your inbox", and no email
  await expect(page.getByRole("button", { name: "Not now" })).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(sentTo(email)).toBe(0);

  // saving a draft to the cloud is the first try: it asks to confirm, and sends the link
  await page
    .getByRole("button", { name: /Options for/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Save to cloud" }).click();
  await expect(page.getByRole("dialog", { name: "Confirm your email" })).toBeVisible();
  const link = linkIn(await mailTo(email));
  expect(sentTo(email)).toBe(1);
  await page.keyboard.press("Escape");

  // the menu route asks the same thing, without sending a second email
  await page.getByRole("button", { name: `Account: ${email}` }).click();
  await page.getByRole("menuitem", { name: "Choose drafts for the cloud…" }).click();
  await expect(page.getByRole("dialog", { name: "Confirm your email" })).toBeVisible();
  await page.waitForTimeout(500);
  expect(sentTo(email)).toBe(1);
  await page.keyboard.press("Escape");

  await page.goto(link.toString());
  await expect(page.getByText("Email confirmed")).toBeVisible();
  await page.getByRole("button", { name: `Account: ${email}` }).click();
  await page.getByRole("menuitem", { name: "Choose drafts for the cloud…" }).click();
  await expect(
    page.getByRole("dialog", { name: "Choose what to store in your cloud" }),
  ).toBeVisible();
});
