// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { oauthAccounts, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { googleAuthorizeUrl, googleSignIn, googleUrls } from "./google";
import { pkcePair } from "./github";

const cfg = { clientId: "cid", clientSecret: "secret" };
const now = 1_700_000_000_000;
let db: Db;
beforeEach(() => void (db = createNodeDb(":memory:") as unknown as Db));

type Mock = { user?: object; token?: object; status?: number };
const google =
  ({ user, token, status }: Mock = {}): typeof fetch =>
  async (input, init) => {
    const url = String(input);
    const reply = (body: unknown, code = 200) => Response.json(body, { status: code });
    if (url === "https://oauth2.googleapis.com/token") {
      // The secret and PKCE verifier travel to Google, never to the browser.
      const sent = new URLSearchParams(String(init?.body));
      expect(Object.fromEntries(sent)).toMatchObject({
        client_id: "cid",
        client_secret: "secret",
        code: "abc",
        code_verifier: "ver",
        redirect_uri: "https://x/cb",
        grant_type: "authorization_code",
      });
      return reply(token ?? { access_token: "ya29.x" }, status);
    }
    expect(url).toBe("https://openidconnect.googleapis.com/v1/userinfo");
    expect((init?.headers as Record<string, string>)["authorization"]).toBe("Bearer ya29.x");
    return reply(
      user ?? {
        sub: "1099",
        email: "Ada@Example.com",
        email_verified: true,
        name: "Ada L",
        picture: "https://lh3/x.png",
      },
    );
  };
const input = { code: "abc", verifier: "ver", redirectUri: "https://x/cb" };

describe("googleAuthorizeUrl", () => {
  it("builds the Google URL with state, an S256 challenge and the openid scopes", async () => {
    const { challenge } = await pkcePair();
    const url = new URL(googleAuthorizeUrl(cfg, "https://x/cb", "st", challenge));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "cid",
      redirect_uri: "https://x/cb",
      response_type: "code",
      scope: "openid email profile",
      state: "st",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
  });

  it("can be pointed at another server, for tests", () => {
    expect(googleUrls("http://localhost:9").token).toBe("http://localhost:9/token");
    expect(googleUrls("http://localhost:9/").userinfo).toBe("http://localhost:9/userinfo");
  });
});

describe("googleSignIn", () => {
  it("creates a confirmed, password-less user from the Google profile", async () => {
    const result = await googleSignIn(db, cfg, input, google(), now);
    if ("error" in result) throw new Error(result.error);
    expect(result.user).toMatchObject({
      email: "ada@example.com",
      displayName: "Ada L",
      emailVerified: true,
    });
    const [row] = await db.select().from(users);
    expect(row).toMatchObject({ passwordHash: null, avatarUrl: "https://lh3/x.png" });
    expect(await db.select().from(oauthAccounts)).toMatchObject([
      { provider: "google", providerUserId: "1099" },
    ]);
  });

  it("only trusts an email Google has verified (a boolean or the string true)", async () => {
    expect(
      await googleSignIn(db, cfg, input, google({ user: { sub: "1", email: "a@b.co" } }), now),
    ).toEqual({ error: "no_verified_email" });
    expect(
      await googleSignIn(
        db,
        cfg,
        input,
        google({ user: { sub: "1", email: "a@b.co", email_verified: false } }),
        now,
      ),
    ).toEqual({ error: "no_verified_email" });
    const result = await googleSignIn(
      db,
      cfg,
      input,
      google({ user: { sub: "1", email: "a@b.co", email_verified: "true" } }),
      now,
    );
    expect("error" in result).toBe(false);
  });

  it("fails cleanly when Google rejects the code or answers badly", async () => {
    const failed = { error: "google_failed" };
    expect(
      await googleSignIn(db, cfg, input, google({ token: { error: "invalid_grant" } }), now),
    ).toEqual(failed);
    expect(await googleSignIn(db, cfg, input, google({ status: 500 }), now)).toEqual(failed);
    expect(await googleSignIn(db, cfg, input, google({ user: { email: "a@b.co" } }), now)).toEqual(
      failed,
    ); // no sub
  });
});
