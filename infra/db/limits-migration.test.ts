// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const dir = join(__dirname, "../migrations");
const statements = (file: string) =>
  readFileSync(join(dir, file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

describe("moving an account's limits onto its row (migration 0013)", () => {
  it("keeps each account's limits as one JSON value, and drops the old table", () => {
    const db = new Database(":memory:");
    // a database as it was when 0012 had been applied, which is what the preview database is
    for (const f of files.filter((f) => f < "0013")) for (const s of statements(f)) db.exec(s);
    db.exec(
      "INSERT INTO users (id, email, created_at, updated_at) VALUES ('a','a@x.co',1,1),('b','b@x.co',1,1),('c','c@x.co',1,1)",
    );
    db.exec(
      "INSERT INTO account_limits (user_id, key, value) VALUES ('a','cloud_docs','40'),('a','private_links','false'),('b','assets','7')",
    );
    for (const s of statements(files.find((f) => f.startsWith("0013"))!)) db.exec(s);
    const limits = (id: string) =>
      JSON.parse(
        (db.prepare("SELECT limits FROM users WHERE id = ?").get(id) as { limits: string }).limits,
      );
    expect(limits("a")).toEqual({ cloud_docs: 40, private_links: false });
    expect(limits("b")).toEqual({ assets: 7 });
    expect(limits("c")).toEqual({});
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'account_limits'").get(),
    ).toBeUndefined();
  });
  it("is the last migration the journal lists, in order, with no stray file", () => {
    const journal = JSON.parse(readFileSync(join(dir, "meta/_journal.json"), "utf8")) as {
      entries: { tag: string }[];
    };
    expect(files.map((f) => f.replace(/\.sql$/, ""))).toEqual(journal.entries.map((e) => e.tag));
  });
});
