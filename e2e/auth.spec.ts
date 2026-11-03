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
  expect(await (await request.get("/api/auth/me")).json()).toEqual({ user: null });

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
