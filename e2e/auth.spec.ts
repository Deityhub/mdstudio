import { expect, test } from "@playwright/test";

const email = () => `writer-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
const password = "a long enough password";

test("signs up, stays signed in, signs out and back in", async ({ request }) => {
  const address = email();
  const signup = await request.post("/api/auth/signup", { data: { email: address, password } });
  expect(signup.status()).toBe(200);
  expect(signup.headers()["set-cookie"]).toMatch(/HttpOnly.*SameSite=Lax/i);

  // The request context keeps the cookie, like a browser.
  expect(await (await request.get("/api/auth/me")).json()).toMatchObject({
    user: { email: address },
  });

  await request.post("/api/auth/logout");
  expect(await (await request.get("/api/auth/me")).json()).toMatchObject({ user: null });

  const login = await request.post("/api/auth/login", { data: { email: address, password } });
  expect(login.status()).toBe(200);
  expect(await (await request.get("/api/auth/me")).json()).toMatchObject({
    user: { email: address },
  });
});

test("refuses a taken email, a wrong password and a cross-site request", async ({ request }) => {
  const address = email();
  await request.post("/api/auth/signup", { data: { email: address, password } });
  expect(
    (await request.post("/api/auth/signup", { data: { email: address, password } })).status(),
  ).toBe(409);
  expect(
    (
      await request.post("/api/auth/login", {
        data: { email: address, password: "wrong wrong wrong" },
      })
    ).status(),
  ).toBe(401);
  const cross = await request.post("/api/auth/login", {
    data: { email: address, password },
    headers: { origin: "https://evil.example" },
  });
  expect(cross.status()).toBe(403);
});

test("the account dialog creates an account, signs out and signs back in", async ({ page }) => {
  const address = email();
  await page.goto("/editor");
  await page.getByRole("button", { name: "Sign in" }).click();
  // GitHub sign-in is only offered when the server has OAuth credentials.
  await expect(page.getByRole("link", { name: /Continue with GitHub/ })).toHaveCount(0);

  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  // The browser's own length check stops it before the server is asked.
  await expect(page.getByLabel("Password", { exact: true })).toHaveJSProperty(
    "validity.tooShort",
    true,
  );

  await page.getByLabel("Password", { exact: true }).fill(password);
  // The eye button reveals the password and hides it again.
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("button", { name: `Account: ${address}` }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password", { exact: true }).fill("not the password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("don't match");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: `Account: ${address}` })).toBeVisible();

  // Still signed in after a reload: the session cookie did its job.
  await page.reload();
  await expect(page.getByRole("button", { name: `Account: ${address}` })).toBeVisible();
});

test("GitHub sign-in fails safely: not configured, or a callback with the wrong state", async ({
  request,
}) => {
  const start = await request.get("/api/auth/github", { maxRedirects: 0 });
  expect(start.status()).toBe(302);
  expect(start.headers()["location"]).toBe("/editor?auth_error=github_unavailable");

  const forged = await request.get("/api/auth/github/callback?code=x&state=y", { maxRedirects: 0 });
  expect(forged.status()).toBe(302);
  expect(forged.headers()["location"]).toBe("/editor?auth_error=github_failed");
  expect(forged.headers()["set-cookie"] ?? "").not.toContain("mdstudio_session=");
});
