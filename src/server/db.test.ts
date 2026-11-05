// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { openDb } from "./db";
import { users } from "../../infra/db/schema";

describe("openDb", () => {
  it("opens the Node driver when no D1 binding exists, and reuses it", async () => {
    const dataDir = ":memory:";
    const loadNode = async () => ({ createNodeDb: () => ({ marker: Math.random() }) });
    const a = await openDb({ dataDir, loadNode });
    expect(await openDb({ dataDir, loadNode })).toBe(a);
  });

  it("runs real queries through the migrated Node database", async () => {
    const { createNodeDb } = await import("../../infra/db/node");
    const db = await openDb({
      dataDir: "unused",
      loadNode: async () => ({ createNodeDb: () => createNodeDb(":memory:") }),
    });
    await db.run(sql`select 1`);
    expect(await db.select().from(users)).toEqual([]);
  });

  it("prefers the D1 binding", async () => {
    const d1 = { prepare: () => ({}) } as never;
    const db = await openDb({ d1, loadNode: async () => Promise.reject(new Error("no node")) });
    expect(db).toBeDefined();
  });
});
