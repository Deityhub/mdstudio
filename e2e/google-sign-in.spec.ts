import { expect, test, type APIRequestContext } from "@playwright/test";
import { SITE, asVisitor, password, signUp, unique } from "./mail-server";

// The mail server is set up for Google against e2e/fake-google.ts. A callback is made by hand: the
// start gives this browser its state, and the "code" is the profile the fake will answer with.
const profile = (email: string, extra: object = {}) =>
  Buffer.from(
    JSON.stringify({ sub: `g-${unique()}`, email, email_verified: true, name: "Ada", ...extra }),
  ).toString("base64url");

async function viaGoogle(request: APIRequestContext, code: string) {
  const start = await request.get("/api/auth/google", { maxRedirects: 0 });
  expect(new URL(start.headers()["location"]!).searchParams.get("code_challenge")).toBeTruthy();
  const state = new URL(start.headers()["location"]!).searchParams.get("state")!;
  return request.get(`/api/auth/google/callback?${new URLSearchParams({ code, state })}`, {
    maxRedirects: 0,
  });
}

test.use({ baseURL: SITE });

test("signs up with Google, then signs in again as the same account", async ({ playwright }) => {
  const address = `g-${unique()}@example.com`;
  const sub = `sub-${unique()}`;
  const code = profile(address, { sub });
  const request = await playwright.request.newContext({ baseURL: SITE });
  const first = await viaGoogle(request, code);
  expect(first.headers()["location"]).toBe("/editor");
  expect(first.headers()["set-cookie"]).toContain("mdstudio_session=");
  const me = await (await request.get("/api/auth/me")).json();
  expect(me).toMatchObject({ user: { email: address, emailVerified: true } });

  await request.post("/api/auth/logout");
  const again = await viaGoogle(request, code);
  expect(again.headers()["location"]).toBe("/editor");
  expect(await (await request.get("/api/auth/me")).json()).toMatchObject({
    user: { id: me.user.id },
  });
});

test("links to an account made with a password: the same account either way", async ({
  playwright,
}) => {
  const address = `g-${unique()}@example.com`;
  const request = await playwright.request.newContext({ baseURL: SITE });
  // the mail server leaves a new password account unconfirmed
  const made = await signUp(request, address);
  expect(made.status()).toBe(200);
  const id = (await (await request.get("/api/auth/me")).json()).user.id;
  await request.post("/api/auth/logout");

  expect((await viaGoogle(request, profile(address))).headers()["location"]).toBe("/editor");
  expect(await (await request.get("/api/auth/me")).json()).toMatchObject({
    user: { id, email: address, emailVerified: true },
  });
  // the unconfirmed password was removed when Google proved the inbox
  await request.post("/api/auth/logout");
  const login = await request.post("/api/auth/login", {
    data: { email: address, password },
    headers: asVisitor(),
  });
  expect(login.status()).toBe(401);
});

test("refuses an email Google has not verified, and a cancelled sign-in", async ({
  playwright,
}) => {
  const request = await playwright.request.newContext({ baseURL: SITE });
  const unverified = await viaGoogle(
    request,
    profile(`g-${unique()}@example.com`, { email_verified: false }),
  );
  expect(unverified.headers()["location"]).toBe("/editor?auth_error=no_verified_email");
  expect(unverified.headers()["set-cookie"] ?? "").not.toContain("mdstudio_session=");

  const start = await request.get("/api/auth/google", { maxRedirects: 0 });
  const state = new URL(start.headers()["location"]!).searchParams.get("state")!;
  const denied = await request.get(`/api/auth/google/callback?error=access_denied&state=${state}`, {
    maxRedirects: 0,
  });
  expect(denied.headers()["location"]).toBe("/editor?auth_error=google_denied");
});

test("the account dialog offers Google when the server has it", async ({ page }) => {
  await page.goto("/editor");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: /Continue with Google/ })).toHaveAttribute(
    "href",
    "/api/auth/google",
  );
});
