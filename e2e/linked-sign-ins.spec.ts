import { expect, test, type APIRequestContext } from "@playwright/test";
import { SITE, password, signUp, unique } from "./mail-server";

// The mail server is set up for Google against e2e/fake-google.ts: the "code" is the profile the
// fake answers with. A callback is made by hand, after a start that gives this browser its state.
test.use({ baseURL: SITE });

const profile = (email: string, sub = `g-${unique()}`) =>
  Buffer.from(JSON.stringify({ sub, email, email_verified: true, name: "Ada" })).toString(
    "base64url",
  );

async function viaGoogle(request: APIRequestContext, code: string, link: boolean) {
  const start = await request.get(`/api/auth/google${link ? "?link=1" : ""}`, { maxRedirects: 0 });
  const location = start.headers()["location"]!;
  if (!location.includes("code_challenge")) return start; // refused before leaving the app
  const state = new URL(location).searchParams.get("state")!;
  return request.get(`/api/auth/google/callback?${new URLSearchParams({ code, state })}`, {
    maxRedirects: 0,
  });
}
const me = async (request: APIRequestContext) =>
  (await (await request.get("/api/auth/me")).json()).user;

test("links Google to a password account, whatever its email, and signs in with it", async ({
  request,
  playwright,
}) => {
  await signUp(request, `link-${unique()}@example.com`);
  const id = (await me(request)).id;
  const sub = `sub-${unique()}`;
  const code = profile(`other-${unique()}@example.org`, sub);

  const linked = await viaGoogle(request, code, true);
  expect(linked.headers()["location"]).toBe("/settings?tab=account&linked=google");
  expect(await me(request)).toMatchObject({ id, linked: ["google"] });

  // a fresh browser signing in with that Google account reaches the same account
  const other = await playwright.request.newContext({ baseURL: SITE });
  expect((await viaGoogle(other, code, false)).headers()["location"]).toBe("/editor");
  expect(await me(other)).toMatchObject({ id });
  await other.dispose();
});

test("a link needs a signed-in browser, and an identity belongs to one account", async ({
  request,
  playwright,
}) => {
  const signedOut = await viaGoogle(
    await playwright.request.newContext({ baseURL: SITE }),
    "x",
    true,
  );
  expect(signedOut.headers()["location"]).toContain("auth_error=unauthorized");

  const code = profile(`shared-${unique()}@example.org`);
  await signUp(request, `first-${unique()}@example.com`);
  expect((await viaGoogle(request, code, true)).headers()["location"]).toContain("linked=google");
  const second = await playwright.request.newContext({ baseURL: SITE });
  await signUp(second, `second-${unique()}@example.com`);
  expect((await viaGoogle(second, code, true)).headers()["location"]).toContain(
    "auth_error=already_linked",
  );
  expect(await me(second)).toMatchObject({ linked: [] });
  await second.dispose();
});

test("unlinking keeps the last way to sign in, until a password is set", async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL: SITE });
  // an account made with Google alone has no password
  await viaGoogle(request, profile(`only-${unique()}@example.com`), false);
  expect(await me(request)).toMatchObject({ hasPassword: false, linked: ["google"] });

  const refused = await request.delete("/api/auth/links/google");
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error).toBe("last_method");

  const set = await request.post("/api/auth/password", { data: { next: password } });
  expect(set.status()).toBe(200);
  expect((await request.delete("/api/auth/links/google")).status()).toBe(200);
  expect(await me(request)).toMatchObject({ linked: [] });
  expect((await request.delete("/api/auth/links/google")).status()).toBe(404);
  await request.dispose();
});

test("in the app: the Account tab links and unlinks Google", async ({ page }) => {
  await signUp(page.request, `ui-${unique()}@example.com`);
  await page.goto("/settings?tab=account");
  const row = page
    .getByText("Sign in with Google", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'justify-between')][1]");
  await expect(row.getByRole("link", { name: "Link" })).toBeVisible();

  await viaGoogle(page.request, profile(`ui-other-${unique()}@example.org`), true);
  await page.reload();
  await row.getByRole("button", { name: "Unlink" }).click();
  await expect(page.getByText("Google unlinked")).toBeVisible();
  await expect(row.getByRole("link", { name: "Link" })).toBeVisible();
});
