import { afterEach, describe, expect, it, vi } from "vitest";
import { authMessage, fetchAccount, signIn, signOut } from "./client";

const reply = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(body, { status })),
  );
afterEach(() => vi.unstubAllGlobals());

describe("account client", () => {
  it("reads the signed-in user and the available providers", async () => {
    reply({ user: { id: "1", email: "a@b.co", displayName: null }, providers: { github: true } });
    expect(await fetchAccount()).toEqual({
      user: { id: "1", email: "a@b.co", displayName: null },
      github: true,
    });
  });

  it("treats a failed request (offline, server down) as signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    expect(await fetchAccount()).toEqual({ user: null, github: false });
  });

  it("signs in and maps server errors to messages", async () => {
    reply({ user: { id: "1", email: "a@b.co", displayName: null } });
    expect(await signIn("login", "a@b.co", "pw")).toMatchObject({ user: { email: "a@b.co" } });
    reply({ error: "invalid_credentials" }, 401);
    expect(await signIn("login", "a@b.co", "pw")).toEqual({
      error: authMessage("invalid_credentials"),
    });
    reply({ error: "email_taken" }, 409);
    expect(await signIn("signup", "a@b.co", "pw")).toEqual({ error: authMessage("email_taken") });
  });

  it("explains the OAuth errors the callback can send", () => {
    for (const code of ["github_failed", "no_verified_email", "email_in_use", "github_unavailable"])
      expect(authMessage(code)).not.toBe(authMessage("anything else"));
  });

  it("signs out", async () => {
    reply({ ok: true });
    await expect(signOut()).resolves.toBeUndefined();
  });
});
