import { describe, expect, it } from "vitest";
import { applyCommentEvent, upsertComment } from "./live";
import type { ShareComment } from "./protocol";

const c = (id: string, over: Partial<ShareComment> = {}): ShareComment => ({
  id,
  parentId: null,
  author: "Bea",
  mine: false,
  line: 3,
  snippet: "Intro",
  body: `Comment ${id}`,
  outdated: false,
  resolved: false,
  createdAt: 100,
  ...over,
});
const ids = (list: ShareComment[]) => list.map((x) => x.id);

describe("applying live comment events", () => {
  it("adds a new comment, and is harmless when the same one arrives twice", () => {
    const once = applyCommentEvent([c("a")], { t: "comment", comment: c("b", { createdAt: 200 }) });
    expect(ids(once)).toEqual(["a", "b"]);
    const twice = applyCommentEvent(once, { t: "comment", comment: c("b", { createdAt: 200 }) });
    expect(ids(twice)).toEqual(["a", "b"]);
  });

  it("keeps a comment marked as the viewer's own when its echo arrives with mine false", () => {
    const mine = [c("a", { mine: true })];
    const after = applyCommentEvent(mine, { t: "comment", comment: c("a", { body: "same" }) });
    expect(after[0]).toMatchObject({ mine: true, body: "same" });
  });

  it("marks a comment resolved or reopened, and ignores one it does not have", () => {
    const list = [c("a"), c("b")];
    const resolved = applyCommentEvent(list, { t: "comment_resolved", id: "a", resolved: true });
    expect(resolved.map((x) => x.resolved)).toEqual([true, false]);
    expect(
      applyCommentEvent(resolved, { t: "comment_resolved", id: "a", resolved: false })[0]?.resolved,
    ).toBe(false);
    expect(applyCommentEvent(list, { t: "comment_resolved", id: "zzz", resolved: true })).toEqual(
      list,
    );
  });

  it("removes a comment with its replies, and ignores one already gone", () => {
    const list = [c("a"), c("r", { parentId: "a" }), c("b")];
    expect(ids(applyCommentEvent(list, { t: "comment_deleted", id: "a" }))).toEqual(["b"]);
    expect(ids(applyCommentEvent(list, { t: "comment_deleted", id: "nope" }))).toEqual([
      "a",
      "r",
      "b",
    ]);
  });

  it("marks every comment as written on an earlier copy when a new copy is published", () => {
    const list = [c("a"), c("b", { outdated: true })];
    const after = applyCommentEvent(list, { t: "share", change: "updated" });
    expect(after.map((x) => x.outdated)).toEqual([true, true]);
  });

  it("leaves the list as it is for events that are not about comments", () => {
    const list = [c("a")];
    for (const event of [
      { t: "share", change: "revoked" },
      { t: "share", change: "settings" },
      { t: "sync" },
      { t: "ready" },
    ] as const)
      expect(applyCommentEvent(list, event)).toBe(list);
  });
});

describe("upsertComment", () => {
  it("puts the answer to the viewer's own comment in place, as theirs, whether or not its echo came first", () => {
    const echoed = [c("a", { mine: false })];
    expect(upsertComment(echoed, c("a", { mine: true }))[0]?.mine).toBe(true);
    expect(ids(upsertComment([], c("a", { mine: true })))).toEqual(["a"]);
  });
});
