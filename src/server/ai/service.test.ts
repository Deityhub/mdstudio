// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { users } from "../../../infra/db/schema";
import { MAX_CLOUD_INTEGRATIONS, type CloudIntegration } from "@/lib/ai/protocol";
import type { Db } from "../db";
import { listIntegrations, putIntegration, removeIntegration } from "./service";

let db: Db;
const item = (over: Partial<CloudIntegration> = {}): CloudIntegration => ({
  id: "int1",
  name: "Work",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  models: ["gpt-5"],
  updatedAt: 100,
  ...over,
});

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  for (const id of ["a", "b"])
    await db.insert(users).values({ id, email: `${id}@x.co`, createdAt: 1, updatedAt: 1 });
});

describe("an account's AI integrations", () => {
  it("stores and lists them, oldest first, without a key", async () => {
    await putIntegration(db, "a", item({ id: "z1", updatedAt: 200 }));
    await putIntegration(db, "a", item({ id: "a1", updatedAt: 100 }));
    const list = await listIntegrations(db, "a");
    expect(list.map((i) => i.id)).toEqual(["a1", "z1"]);
    expect(list[0]).toEqual(item({ id: "a1", updatedAt: 100 }));
  });
  it("keeps each account's list to itself, even with the same id", async () => {
    await putIntegration(db, "a", item({ name: "Mine" }));
    await putIntegration(db, "b", item({ name: "Theirs" }));
    expect((await listIntegrations(db, "a"))[0]!.name).toBe("Mine");
    expect(await removeIntegration(db, "b", "int1")).toBe(true);
    expect(await listIntegrations(db, "a")).toHaveLength(1);
  });
  it("updates one in place, and ignores an older copy", async () => {
    await putIntegration(db, "a", item({ name: "New", updatedAt: 300 }));
    const stale = await putIntegration(db, "a", item({ name: "Old", updatedAt: 200 }));
    expect(stale).toMatchObject({ ok: true, integration: { name: "New", updatedAt: 300 } });
    await putIntegration(db, "a", item({ name: "Newer", updatedAt: 400, models: ["x", "y"] }));
    const [only] = await listIntegrations(db, "a");
    expect(only).toMatchObject({ name: "Newer", models: ["x", "y"] });
  });
  it("stops at the limit but still lets existing ones change", async () => {
    for (let i = 0; i < MAX_CLOUD_INTEGRATIONS; i++)
      await putIntegration(db, "a", item({ id: `i${i}` }));
    expect(await putIntegration(db, "a", item({ id: "extra" }))).toEqual({
      ok: false,
      error: "limit_reached",
    });
    expect((await putIntegration(db, "a", item({ id: "i0", updatedAt: 999 }))).ok).toBe(true);
  });
  it("removes one, and says when it was not there", async () => {
    await putIntegration(db, "a", item());
    expect(await removeIntegration(db, "a", "int1")).toBe(true);
    expect(await removeIntegration(db, "a", "int1")).toBe(false);
    expect(await listIntegrations(db, "a")).toEqual([]);
  });
});
