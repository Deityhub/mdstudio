// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { users } from "../../../infra/db/schema";
import { signup } from "../auth/service";
import type { Db } from "../db";

let db: Db;
vi.mock("../db", () => ({ getDb: async () => db }));
vi.mock("../assets/store", () => ({ getStore: async () => null }));

const routes = await import("./routes");
const t0 = Date.now();

async function account(email: string) {
  const r = await signup(db, { email, password: "a long enough password" }, t0);
  if ("error" in r) throw new Error(r.error);
  return r;
}
const as = (token: string | null, method: string, url: string, body?: unknown) =>
  new Request(`http://x.test${url}`, {
    method,
    headers: {
      origin: "http://x.test",
      "content-type": "application/json",
      ...(token ? { cookie: `mdstudio_session=${token}` } : {}),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

let admin: Awaited<ReturnType<typeof account>>;
let writer: Awaited<ReturnType<typeof account>>;
beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  admin = await account("admin@x.co");
  writer = await account("writer@x.co");
});

describe("who can use the admin API", () => {
  it("is an admin only: everyone else gets a plain 404, signed in or not", async () => {
    for (const token of [null, writer.token]) {
      expect((await routes.overviewHandler(as(token, "GET", "/"))).status).toBe(404);
      expect((await routes.usersHandler(as(token, "GET", "/"))).status).toBe(404);
      expect(
        (await routes.updateSettingsHandler(as(token, "PATCH", "/", { notice: "x" }))).status,
      ).toBe(404);
      expect((await routes.deleteUserHandler(as(token, "DELETE", "/"), admin.user.id)).status).toBe(
        404,
      );
    }
    expect((await routes.overviewHandler(as(admin.token, "GET", "/"))).status).toBe(200);
  });
  it("refuses a change that does not come from this site", async () => {
    const res = await routes.updateSettingsHandler(
      new Request("http://x.test/", {
        method: "PATCH",
        headers: { origin: "http://evil.test", cookie: `mdstudio_session=${admin.token}` },
        body: JSON.stringify({ notice: "x" }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("working with an account", () => {
  it("lists, shows and changes it, and writes each change to the audit log", async () => {
    const list = await (
      await routes.usersHandler(as(admin.token, "GET", "/api/admin/users?q=writer"))
    ).json();
    expect(list.users.map((u: { email: string }) => u.email)).toEqual(["writer@x.co"]);
    const shown = await (
      await routes.userHandler(as(admin.token, "GET", "/"), writer.user.id)
    ).json();
    expect(shown.account).toMatchObject({ email: "writer@x.co", role: "user", plan: "free" });
    expect(shown.limits.cloud_docs).toEqual({ value: 5, source: "default" });
    expect(shown.catalog.cloud_docs).toMatchObject({ type: "number", base: 5 });

    const changed = await routes.updateUserHandler(
      as(admin.token, "PATCH", "/", { limits: { cloud_docs: 40 }, suspended: true }),
      writer.user.id,
    );
    expect(changed.status).toBe(200);
    expect((await changed.json()).account.suspended).toBe(true);
    const log = await (await routes.auditHandler(as(admin.token, "GET", "/"))).json();
    expect(log.entries[0]).toMatchObject({
      action: "user.update",
      actorEmail: "admin@x.co",
      targetEmail: "writer@x.co",
    });
  });
  it("answers 409 for a change that would lock everyone out, and 404 for an unknown account", async () => {
    expect(
      (
        await routes.updateUserHandler(
          as(admin.token, "PATCH", "/", { role: "user" }),
          admin.user.id,
        )
      ).status,
    ).toBe(409);
    expect(
      (await routes.deleteUserHandler(as(admin.token, "DELETE", "/"), admin.user.id)).status,
    ).toBe(409);
    expect((await routes.userHandler(as(admin.token, "GET", "/"), "ghost")).status).toBe(404);
  });
  it("deletes an account and signs one out", async () => {
    expect((await routes.signOutHandler(as(admin.token, "POST", "/"), writer.user.id)).status).toBe(
      200,
    );
    expect(
      (await routes.deleteUserHandler(as(admin.token, "DELETE", "/"), writer.user.id)).status,
    ).toBe(200);
    expect(await db.select().from(users)).toHaveLength(1);
  });
});

describe("plans and server settings", () => {
  it("makes a plan, puts an account on it and refuses to remove it while it is in use", async () => {
    const saved = await routes.savePlanHandler(
      as(admin.token, "PUT", "/", { name: "pro", label: "Pro", limits: { cloud_docs: 100 } }),
    );
    expect(saved.status).toBe(200);
    await routes.updateUserHandler(as(admin.token, "PATCH", "/", { plan: "pro" }), writer.user.id);
    const shown = await (
      await routes.userHandler(as(admin.token, "GET", "/"), writer.user.id)
    ).json();
    expect(shown.limits.cloud_docs).toEqual({ value: 100, source: "plan" });
    expect((await routes.deletePlanHandler(as(admin.token, "DELETE", "/"), "pro")).status).toBe(
      409,
    );
    expect(
      (await routes.savePlanHandler(as(admin.token, "PUT", "/", { name: "Bad Name", label: "x" })))
        .status,
    ).toBe(400);
  });
  it("changes server-wide defaults, sign-ups and the notice", async () => {
    const res = await routes.updateSettingsHandler(
      as(admin.token, "PATCH", "/", {
        signupsOpen: false,
        notice: "Maintenance at noon",
        limits: { cloud_docs: 8 },
      }),
    );
    expect((await res.json()).settings).toEqual({
      limits: { cloud_docs: 8 },
      signupsOpen: false,
      notice: "Maintenance at noon",
    });
    expect(
      (await routes.updateSettingsHandler(as(admin.token, "PATCH", "/", { signupsOpen: "no" })))
        .status,
    ).toBe(400);
  });
});
