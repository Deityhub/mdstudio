// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { oauthAccounts, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { authorizeUrl, githubSignIn, pkcePair } from "./github";
import { signup, userForToken } from "./service";

const cfg = { clientId: "cid", clientSecret: "secret" };
const now = 1_700_000_000_000;
let db: Db;
beforeEach(() => void (db = createNodeDb(":memory:") as unknown as Db));

type Mock = { user?: object; emails?: object[]; token?: object; status?: number };
const github =
  ({ user, emails, token, status }: Mock = {}): typeof fetch =>
  async (input, init) => {
    const url = String(input);
    const reply = (body: unknown, code = 200) => Response.json(body, { status: code });
    if (url.endsWith("/login/oauth/access_token")) {
      // The secret and PKCE verifier must travel to GitHub, never to the browser.
      const sent = JSON.parse(String(init?.body));
      expect(sent).toMatchObject({ client_secret: "secret", code_verifier: "ver", code: "abc" });
      return reply(token ?? { access_token: "gho_x" }, status);
    }
    expect((init?.headers as Record<string, string>)["authorization"]).toBe("Bearer gho_x");
    if (url.endsWith("/user/emails"))
      return reply(emails ?? [{ email: "ada@example.com", primary: true, verified: true }]);
    return reply(user ?? { id: 42, login: "ada", name: "Ada L", avatar_url: "https://a/b.png" });
  };
const input = { code: "abc", verifier: "ver", redirectUri: "https://x/cb" };

describe("authorizeUrl and PKCE", () => {
  it("builds the GitHub URL with state and an S256 challenge", async () => {
    const { verifier, challenge } = await pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const url = new URL(authorizeUrl(cfg, "https://x/cb", "st", challenge));
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "cid",
      redirect_uri: "https://x/cb",
      state: "st",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    expect(url.searchParams.get("scope")).toBe("read:user user:email");
  });
});

describe("githubSignIn", () => {
  it("creates a password-less user with a session", async () => {
    const result = await githubSignIn(db, cfg, input, github(), now);
    if ("error" in result) throw new Error(result.error);
    expect(result.user).toMatchObject({ email: "ada@example.com", displayName: "Ada L" });
    expect((await userForToken(db, result.token, now))?.user.id).toBe(result.user.id);
    const [row] = await db.select().from(users);
    expect(row?.passwordHash).toBeNull();
    expect(await db.select().from(oauthAccounts)).toHaveLength(1);
  });

  it("signs the same GitHub account into the same user, even if its email changed", async () => {
    const first = await githubSignIn(db, cfg, input, github(), now);
    const again = await githubSignIn(
      db,
      cfg,
      input,
      github({ emails: [{ email: "new@example.com", primary: true, verified: true }] }),
      now,
    );
    if ("error" in first || "error" in again) throw new Error("sign-in failed");
    expect(again.user.id).toBe(first.user.id);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("refuses to attach to an existing password account with the same email", async () => {
    // Sign-up does not verify email, so linking by email would let someone who pre-registered a
    // victim's address take over the victim's GitHub sign-in.
    await signup(db, { email: "ada@example.com", password: "a long enough password" }, now);
    expect(await githubSignIn(db, cfg, input, github(), now)).toEqual({ error: "email_in_use" });
    expect(await db.select().from(oauthAccounts)).toHaveLength(0);
  });

  it("only trusts a verified email", async () => {
    const unverified = github({
      emails: [{ email: "ada@example.com", primary: true, verified: false }],
    });
    expect(await githubSignIn(db, cfg, input, unverified, now)).toEqual({
      error: "no_verified_email",
    });
    const second = github({
      emails: [
        { email: "a@example.com", primary: true, verified: false },
        { email: "b@example.com", primary: false, verified: true },
      ],
    });
    const result = await githubSignIn(db, cfg, input, second, now);
    if ("error" in result) throw new Error(result.error);
    expect(result.user.email).toBe("b@example.com");
  });

  it("fails cleanly when GitHub rejects the code", async () => {
    expect(
      await githubSignIn(
        db,
        cfg,
        input,
        github({ token: { error: "bad_verification_code" } }),
        now,
      ),
    ).toEqual({ error: "github_failed" });
    expect(await githubSignIn(db, cfg, input, github({ status: 500 }), now)).toEqual({
      error: "github_failed",
    });
  });
});
