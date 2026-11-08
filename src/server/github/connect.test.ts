// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { githubConnections, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { connectGithub, connectionStatus, disconnectGithub, githubToken } from "./connect";
import { importTokenKey } from "./crypto";

const cfg = { clientId: "cid", clientSecret: "secret" };
const urls = { web: "https://github.test", api: "https://api.github.test" };
const input = { code: "abc", verifier: "ver", redirectUri: "https://x/cb" };
const t0 = 1_700_000_000_000;
let db: Db;
let key: CryptoKey;

const raw = (n: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(n)));
beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  key = (await importTokenKey(raw(3)))!;
  for (const id of ["a", "b"])
    await db.insert(users).values({ id, email: `${id}@x.co`, createdAt: t0, updatedAt: t0 });
});

type Mock = {
  scope?: string;
  token?: string;
  user?: object;
  tokenStatus?: number;
  revoke?: number;
};
const calls: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];
const github =
  ({
    scope = "public_repo,gist",
    token = "gho_x",
    user,
    tokenStatus = 200,
    revoke = 204,
  }: Mock = {}): typeof fetch =>
  async (u, init) => {
    const url = String(u);
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: String(init?.body ?? ""),
    });
    if (url === "https://github.test/login/oauth/access_token")
      return Response.json({ access_token: token, scope }, { status: tokenStatus });
    if (url === "https://api.github.test/user")
      return Response.json(user ?? { id: 42, login: "ada" });
    if (url === "https://api.github.test/applications/cid/token")
      return new Response(null, { status: revoke });
    return new Response("unexpected", { status: 500 });
  };
beforeEach(() => void (calls.length = 0));

describe("connectGithub", () => {
  it("trades the code (with the secret and verifier, only to GitHub), then keeps the token sealed", async () => {
    const r = await connectGithub(db, key, cfg, urls, "a", input, github(), t0);
    expect(r).toEqual({ ok: true, login: "ada", scope: "public_repo gist" });
    const exchange = calls.find((c) => c.url.endsWith("/access_token"))!;
    expect(JSON.parse(exchange.body)).toMatchObject({
      client_id: "cid",
      client_secret: "secret",
      code: "abc",
      code_verifier: "ver",
    });
    const [row] = await db.select().from(githubConnections);
    expect(row).toMatchObject({ userId: "a", login: "ada", githubUserId: "42", createdAt: t0 });
    expect(JSON.stringify(row)).not.toContain("gho_x");
    expect(await githubToken(db, key, "a")).toBe("gho_x");
  });

  it("replaces an earlier connection instead of adding another", async () => {
    await connectGithub(db, key, cfg, urls, "a", input, github({ token: "gho_old" }), t0);
    await connectGithub(
      db,
      key,
      cfg,
      urls,
      "a",
      input,
      github({ token: "gho_new", user: { id: 43, login: "ada2" } }),
      t0 + 5,
    );
    expect(await db.select().from(githubConnections)).toHaveLength(1);
    expect(await githubToken(db, key, "a")).toBe("gho_new");
    expect(await connectionStatus(db, "a")).toMatchObject({ login: "ada2" });
  });

  it("refuses a grant that cannot write to repositories", async () => {
    const r = await connectGithub(
      db,
      key,
      cfg,
      urls,
      "a",
      input,
      github({ scope: "read:user" }),
      t0,
    );
    expect(r).toEqual({ ok: false, error: "github_scope" });
    expect(await db.select().from(githubConnections)).toHaveLength(0);
  });

  it("fails cleanly when GitHub says no", async () => {
    expect(
      await connectGithub(db, key, cfg, urls, "a", input, github({ tokenStatus: 500 }), t0),
    ).toEqual({
      ok: false,
      error: "github_failed",
    });
    const noToken: typeof fetch = async () => Response.json({ error: "bad_verification_code" });
    expect(await connectGithub(db, key, cfg, urls, "a", input, noToken, t0)).toEqual({
      ok: false,
      error: "github_failed",
    });
  });
});

describe("connectionStatus", () => {
  it("says who is connected and whether private repositories are allowed", async () => {
    expect(await connectionStatus(db, "a")).toEqual({ connected: false });
    await connectGithub(db, key, cfg, urls, "a", input, github(), t0);
    expect(await connectionStatus(db, "a")).toEqual({
      connected: true,
      login: "ada",
      private: false,
    });
    await connectGithub(db, key, cfg, urls, "a", input, github({ scope: "repo,gist" }), t0);
    expect(await connectionStatus(db, "a")).toMatchObject({ connected: true, private: true });
    expect(await connectionStatus(db, "b")).toEqual({ connected: false });
  });
});

describe("githubToken", () => {
  it("is only the owner's, and null when it cannot be opened", async () => {
    await connectGithub(db, key, cfg, urls, "a", input, github(), t0);
    expect(await githubToken(db, key, "b")).toBeNull();
    const other = (await importTokenKey(raw(9)))!;
    expect(await githubToken(db, other, "a")).toBeNull(); // the key changed: connect again
  });
});

describe("disconnectGithub", () => {
  it("takes the token back from GitHub and forgets it", async () => {
    await connectGithub(db, key, cfg, urls, "a", input, github(), t0);
    calls.length = 0;
    expect(await disconnectGithub(db, key, cfg, urls, "a", github())).toBe(true);
    const revoke = calls.find((c) => c.method === "DELETE")!;
    expect(JSON.parse(revoke.body)).toEqual({ access_token: "gho_x" });
    expect(revoke.headers["authorization"]).toMatch(/^Basic /);
    expect(await db.select().from(githubConnections)).toHaveLength(0);
  });

  it("forgets it even when GitHub cannot be reached, and says false when there was none", async () => {
    await connectGithub(db, key, cfg, urls, "a", input, github(), t0);
    const down: typeof fetch = async () => {
      throw new Error("offline");
    };
    expect(await disconnectGithub(db, key, cfg, urls, "a", down)).toBe(true);
    expect(await db.select().from(githubConnections)).toHaveLength(0);
    expect(await disconnectGithub(db, key, cfg, urls, "a", github())).toBe(false);
  });

  it("goes with the account", async () => {
    await connectGithub(db, key, cfg, urls, "a", input, github(), t0);
    await db.delete(users);
    expect(await db.select().from(githubConnections)).toHaveLength(0);
  });
});
