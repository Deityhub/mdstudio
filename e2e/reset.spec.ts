import { expect, test, type APIRequestContext } from "@playwright/test";
import { SITE, asVisitor, linkIn, mailTo, password, sentTo, signUp, unique } from "./mail-server";

// These specs run against the server that sends mail (see playwright.config.ts).
test.use({ baseURL: SITE });

const RESET = /reset your/i;
const newPassword = "a brand new long password";
const forgot = (request: APIRequestContext, email: string, headers = asVisitor()) =>
  request.post("/api/auth/forgot", { data: { email }, headers });
const tokenOf = (link: URL) => link.searchParams.get("token")!;
const login = (request: APIRequestContext, email: string, pw: string) =>
  request.post("/api/auth/login", { data: { email, password: pw }, headers: asVisitor() });

test("a reset link sets a new password, signs every device out, and works once", async ({
  request,
  playwright,
}) => {
  const email = `reset-${unique()}@example.com`;
  await signUp(request, email); // this browser stays signed in until the reset
  const other = await playwright.request.newContext({ baseURL: SITE });
  expect((await login(other, email, password)).status()).toBe(200);

  expect((await forgot(request, email)).status()).toBe(200);
  const mail = await mailTo(email, RESET);
  const link = linkIn(mail);
  expect(link.pathname).toBe("/reset-password"); // a page, not a state-changing GET
  const token = tokenOf(link);

  // a weak password is turned away and does not use the link up
  const weak = await request.post("/api/auth/reset", { data: { token, password: "short" } });
  expect(weak.status()).toBe(400);
  expect((await weak.json()).error).toBe("invalid");

  expect(
    (await request.post("/api/auth/reset", { data: { token, password: newPassword } })).status(),
  ).toBe(200);
  // every session is gone, the old password stopped working, the new one works
  expect((await (await request.get("/api/auth/me")).json()).user).toBeNull();
  expect((await (await other.get("/api/auth/me")).json()).user).toBeNull();
  expect((await login(request, email, password)).status()).toBe(401);
  expect((await login(request, email, newPassword)).status()).toBe(200);

  const again = await request.post("/api/auth/reset", {
    data: { token, password: "yet another long one" },
  });
  expect(again.status()).toBe(400);
  expect((await again.json()).error).toBe("invalid_token");
  await other.dispose();
});

test("asking for a reset never shows whether an address has an account", async ({ request }) => {
  const known = `known-${unique()}@example.com`;
  const stranger = `stranger-${unique()}@example.com`;
  await signUp(request, known);
  const a = await forgot(request, known);
  const b = await forgot(request, stranger);
  expect(a.status()).toBe(200);
  expect(b.status()).toBe(a.status());
  expect(await b.json()).toEqual(await a.json());
  await mailTo(known, RESET);
  await new Promise((r) => setTimeout(r, 500));
  expect(sentTo(stranger)).toBe(0);
  // an address that is not an address looks the same too
  expect((await forgot(request, "not an address")).status()).toBe(200);
});

test("a reset link is limited per inbox, and per visitor", async ({ request }) => {
  const email = `limit-${unique()}@example.com`;
  await signUp(request, email);
  for (let n = 0; n < 4; n++) expect((await forgot(request, email)).status()).toBe(200);
  await mailTo(email, RESET);
  await new Promise((r) => setTimeout(r, 500));
  expect(sentTo(email, RESET)).toBe(3); // the fourth was quietly not sent

  const headers = asVisitor();
  for (let n = 0; n < 5; n++)
    expect((await forgot(request, `nobody-${unique()}@example.com`, headers)).status()).toBe(200);
  const sixth = await forgot(request, `nobody-${unique()}@example.com`, headers);
  expect(sixth.status()).toBe(429);
  expect(Number(sixth.headers()["retry-after"])).toBeGreaterThan(0);
});

test("a confirmation link cannot reset a password", async ({ request }) => {
  const email = `cross-${unique()}@example.com`;
  await signUp(request, email);
  await request.post("/api/auth/verify/resend", { data: { force: true } });
  const confirm = tokenOf(linkIn(await mailTo(email, /confirm/i)));
  const res = await request.post("/api/auth/reset", {
    data: { token: confirm, password: newPassword },
  });
  expect(res.status()).toBe(400);
  expect((await login(request, email, newPassword)).status()).toBe(401);
});

test("in the app: forgot password, the emailed page, a new password, signed in again", async ({
  page,
}) => {
  const email = `app-${unique()}@example.com`;
  await page.setExtraHTTPHeaders(asVisitor());
  await signUp(page.request, email);
  await page.request.post("/api/auth/logout");

  await page.goto("/editor");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");

  const link = linkIn(await mailTo(email, RESET));
  await page.goto(link.toString());
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  // the secret is not left in the address bar
  await expect.poll(() => new URL(page.url()).search).toBe("");
  await page.getByLabel("New password").fill("short");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByLabel("New password")).toHaveJSProperty("validity.tooShort", true);
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible();

  await page.getByRole("link", { name: "Open the editor" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // resetting counted as confirming the address, so the cloud picker opens straight away
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("button", { name: `Account: ${email}` })).toBeVisible();
});

test("a used or invalid reset page says so", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "This link doesn't work" })).toBeVisible();
  await page.goto("/reset-password?token=made-up");
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert")).toContainText("invalid or has expired");
});
