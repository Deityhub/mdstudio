// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { documentRevisions, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { pushDocs } from "../sync/service";
import { getRevision, listRevisions, recordRevision } from "./service";

let db: Db;
const t0 = 1_700_000_000_000;
const MIN = 60_000;
const cfg = { max: 3, intervalMs: 5 * MIN };
const prose = (word: string) =>
  `# ${word}\n\n${"A paragraph of ordinary writing that repeats. ".repeat(60)}`;

const doc = (over: Record<string, unknown> = {}) => ({
  id: "a:d1",
  baseVersion: 1,
  title: "Draft",
  content: prose("one"),
  createdAt: t0,
  editedAt: t0,
  ...over,
});
const push = (items: ReturnType<typeof doc>[], now: number, config = cfg) =>
  pushDocs(db, "a", items, now, 5, config);

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  for (const id of ["a", "b"])
    await db.insert(users).values({ id, email: `${id}@x.co`, createdAt: t0, updatedAt: t0 });
  await push([doc({ baseVersion: 0, content: prose("v1") })], t0);
});

const texts = async () =>
  Promise.all(
    (await listRevisions(db, "a", "a:d1")).map(
      async (r) => (await getRevision(db, "a", "a:d1", r.id))!.content,
    ),
  );

describe("when a version is kept", () => {
  it("keeps nothing when a draft is created, then the text an edit replaces", async () => {
    expect(await listRevisions(db, "a", "a:d1")).toEqual([]);
    await push([doc({ content: prose("v2") })], t0 + MIN);
    expect(await texts()).toEqual([prose("v1")]);
  });

  it("keeps at most one version per interval, however many pushes there are", async () => {
    await push([doc({ content: prose("v2") })], t0 + MIN); // keeps v1
    await push([doc({ baseVersion: 2, content: prose("v3") })], t0 + 2 * MIN); // too soon
    await push([doc({ baseVersion: 3, content: prose("v4") })], t0 + 3 * MIN); // too soon
    expect((await listRevisions(db, "a", "a:d1")).length).toBe(1);
    await push([doc({ baseVersion: 4, content: prose("v5") })], t0 + 7 * MIN); // an interval later: keeps v4
    expect(await texts()).toEqual([prose("v4"), prose("v1")]);
  });

  it("does not keep the same text twice in a row, even when asked to", async () => {
    const prev = { id: "a:d1", version: 1, title: "Draft", content: prose("same") };
    expect(await recordRevision(db, "a", prev, cfg, "replaced", t0 + MIN)).toBe(true);
    expect(await recordRevision(db, "a", prev, cfg, "replaced", t0 + 2 * MIN)).toBe(false);
    expect(await recordRevision(db, "a", prev, cfg, "auto", t0 + 20 * MIN)).toBe(false);
    expect((await listRevisions(db, "a", "a:d1")).length).toBe(1);
  });

  it("always keeps text that a newer edit from another device replaces, ignoring the interval", async () => {
    await push([doc({ content: prose("v2"), editedAt: t0 + 10 })], t0 + MIN); // keeps v1
    // a device still on version 1 pushes a later edit: v2 is replaced
    await push(
      [doc({ baseVersion: 1, content: prose("other"), editedAt: t0 + 999 })],
      t0 + MIN + 1000,
    );
    const [newest] = await listRevisions(db, "a", "a:d1");
    expect(newest?.reason).toBe("replaced");
    expect((await getRevision(db, "a", "a:d1", newest!.id))?.content).toBe(prose("v2"));
  });

  it("is switched off with a limit of 0", async () => {
    await push([doc({ content: prose("v2") })], t0 + MIN, { max: 0, intervalMs: 0 });
    expect(await listRevisions(db, "a", "a:d1")).toEqual([]);
  });
});

describe("the limit and the cleanup", () => {
  it("keeps the newest few and drops the oldest", async () => {
    let base = 1;
    for (let n = 2; n <= 8; n++) {
      await push([doc({ baseVersion: base++, content: prose(`v${n}`) })], t0 + n * 10 * MIN);
    }
    const kept = await texts();
    expect(kept).toHaveLength(3);
    expect(kept[0]).toBe(prose("v7")); // newest first; v8 is the draft itself
    expect(kept[2]).toBe(prose("v5"));
  });

  it("deleting the draft deletes its history", async () => {
    await push([doc({ content: prose("v2") })], t0 + MIN);
    expect((await listRevisions(db, "a", "a:d1")).length).toBe(1);
    await push([doc({ baseVersion: 2, deleted: true })], t0 + 20 * MIN);
    expect(await db.select().from(documentRevisions)).toEqual([]);
  });
});

describe("storage", () => {
  it("stores prose compressed and smaller, and a short draft as it is", async () => {
    await push([doc({ content: prose("v2") })], t0 + MIN);
    const [row] = await db.select().from(documentRevisions);
    expect(row?.encoding).toBe("gzip-b64");
    expect(row!.content.length).toBeLessThan(row!.size / 2);
    expect(row?.size).toBe(prose("v1").length);

    await push([doc({ id: "a:s", baseVersion: 0, content: "# tiny" })], t0);
    await push([doc({ id: "a:s", baseVersion: 1, content: "# tiny two" })], t0 + MIN);
    const small = (
      await db.select().from(documentRevisions).where(eq(documentRevisions.documentId, "a:s"))
    )[0];
    expect(small).toMatchObject({ encoding: "plain", content: "# tiny" });
  });
});

describe("reading", () => {
  it("lists newest first with sizes and no text, and only to the owner", async () => {
    await push([doc({ content: prose("v2") })], t0 + MIN);
    await push([doc({ baseVersion: 2, content: prose("v3") })], t0 + 10 * MIN);
    const list = await listRevisions(db, "a", "a:d1");
    expect(list.map((r) => r.version)).toEqual([2, 1]);
    expect(list[0]).toMatchObject({ reason: "auto", size: prose("v2").length });
    expect(list[0]).not.toHaveProperty("content");
    expect(await listRevisions(db, "b", "a:d1")).toEqual([]);
  });

  it("returns one version's text to the owner and to nobody else", async () => {
    await push([doc({ content: prose("v2") })], t0 + MIN);
    const [r] = await listRevisions(db, "a", "a:d1");
    expect((await getRevision(db, "a", "a:d1", r!.id))?.content).toBe(prose("v1"));
    expect(await getRevision(db, "b", "a:d1", r!.id)).toBeNull();
    expect(await getRevision(db, "a", "a:other", r!.id)).toBeNull();
    expect(await getRevision(db, "a", "a:d1", "nope")).toBeNull();
  });
});
