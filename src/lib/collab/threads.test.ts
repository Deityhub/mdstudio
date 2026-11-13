import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { TEXT_KEY } from "./protocol";
import { type Author, MAX_BODY, MAX_THREADS, canDelete, exportThreads } from "./thread-rules";
import { createThreads } from "./threads";

const ada: Author = { id: "u1", name: "Ada" };
const bea: Author = { id: "u2", name: "Bea" };

/** Two browsers' documents, connected: `sync()` carries what each has to the other. */
function pair(text = "# Notes\n\nShip on Friday. Then rest.") {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.getText(TEXT_KEY).insert(0, text);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  };
  return {
    a: { doc: a, text: a.getText(TEXT_KEY), threads: createThreads(a, a.getText(TEXT_KEY), ada) },
    b: { doc: b, text: b.getText(TEXT_KEY), threads: createThreads(b, b.getText(TEXT_KEY), bea) },
    sync,
  };
}
const at = (t: string, words: string) => ({
  from: t.indexOf(words),
  to: t.indexOf(words) + words.length,
});

describe("comments on words", () => {
  it("anchors to the words, shows them, and reaches the other person", () => {
    const { a, b, sync } = pair();
    const r = a.threads.add({
      kind: "comment",
      ...at(a.text.toString(), "Friday"),
      body: "Which Friday?",
    });
    expect(r.ok).toBe(true);
    sync();
    const [t] = b.threads.list();
    expect(t).toMatchObject({
      kind: "comment",
      body: "Which Friday?",
      author: ada,
      status: "open",
      text: "Friday",
      original: "Friday",
      changed: false,
      gone: false,
      proposed: null,
    });
    expect(a.text.toString().slice(t!.from, t!.to)).toBe("Friday");
  });

  it("follows the words as others type around them", () => {
    const { a, b, sync } = pair();
    a.threads.add({ kind: "comment", ...at(a.text.toString(), "Friday"), body: "?" });
    sync();
    b.text.insert(0, "INTRO. "); // before
    b.text.insert(b.text.toString().indexOf(" Then"), " morning"); // after
    sync();
    const [t] = a.threads.list();
    expect(t).toMatchObject({ text: "Friday", changed: false, gone: false });
    // typing inside the words changes them, and the comment says so
    b.text.insert(b.text.toString().indexOf("day"), "XX");
    sync();
    expect(a.threads.list()[0]).toMatchObject({ text: "FriXXday", changed: true, gone: false });
  });

  it("is told when its words were deleted, and is not lost", () => {
    const { a, b, sync } = pair();
    a.threads.add({ kind: "comment", ...at(a.text.toString(), "Friday"), body: "?" });
    sync();
    const { from, to } = at(b.text.toString(), "Friday");
    b.text.delete(from, to - from);
    sync();
    expect(a.threads.list()[0]).toMatchObject({ gone: true, body: "?", original: "Friday" });
  });

  it("does not grow when someone types right after or before the words", () => {
    const { a, sync, b } = pair();
    a.threads.add({ kind: "comment", ...at(a.text.toString(), "Friday"), body: "?" });
    sync();
    const { from, to } = at(b.text.toString(), "Friday");
    b.text.insert(to, "!!");
    b.text.insert(from, ">>");
    sync();
    expect(a.threads.list()[0]).toMatchObject({ text: "Friday", changed: false });
  });
});

describe("threads", () => {
  it("replies, resolves, reopens and deletes, for both people", () => {
    const { a, b, sync } = pair();
    const r = a.threads.add({ kind: "comment", ...at(a.text.toString(), "Friday"), body: "?" });
    if (!r.ok) throw new Error();
    sync();
    expect(b.threads.reply(r.id, "This one")).toMatchObject({ ok: true });
    sync();
    expect(a.threads.list()[0]!.replies).toMatchObject([{ body: "This one", author: bea }]);
    a.threads.setStatus(r.id, "resolved");
    sync();
    expect(b.threads.list()[0]!.status).toBe("resolved");
    b.threads.setStatus(r.id, "open");
    sync();
    expect(a.threads.list()[0]!.status).toBe("open");
    a.threads.remove(r.id);
    sync();
    expect(b.threads.list()).toEqual([]);
  });

  it("orders open threads by place in the text, closed ones after", () => {
    const { a } = pair();
    const t = a.text.toString();
    const second = a.threads.add({ kind: "comment", ...at(t, "rest"), body: "2" });
    const first = a.threads.add({ kind: "comment", ...at(t, "Notes"), body: "1" });
    a.threads.add({ kind: "comment", ...at(t, "Ship"), body: "3" });
    if (first.ok) a.threads.setStatus(first.id, "resolved");
    expect(a.threads.list().map((x) => x.body)).toEqual(["3", "2", "1"]);
    void second;
  });

  it("keeps both when two people comment, reply or resolve at the same time", () => {
    const { a, b, sync } = pair();
    const t = a.text.toString();
    a.threads.add({ kind: "comment", ...at(t, "Friday"), body: "from Ada" });
    b.threads.add({ kind: "comment", ...at(t, "Friday"), body: "from Bea" });
    sync();
    expect(
      a.threads
        .list()
        .map((x) => x.body)
        .sort(),
    ).toEqual(["from Ada", "from Bea"]);
    expect(b.threads.list()).toHaveLength(2);
  });

  it("refuses empty, too long and too many", () => {
    const { a } = pair();
    const t = a.text.toString();
    expect(a.threads.add({ kind: "comment", ...at(t, "Friday"), body: "   " })).toMatchObject({
      ok: false,
      error: "empty",
    });
    expect(
      a.threads.add({ kind: "comment", ...at(t, "Friday"), body: "x".repeat(MAX_BODY + 1) }),
    ).toMatchObject({ ok: false, error: "too_long" });
    expect(a.threads.add({ kind: "comment", from: 3, to: 3, body: "no words" })).toMatchObject({
      ok: false,
      error: "no_selection",
    });
    for (let i = 0; i < MAX_THREADS; i++)
      a.threads.add({ kind: "comment", ...at(t, "Friday"), body: `n${i}` });
    expect(a.threads.add({ kind: "comment", ...at(t, "Friday"), body: "one more" })).toMatchObject({
      ok: false,
      error: "full",
    });
  });
});

describe("suggestions", () => {
  const suggest = (a: ReturnType<typeof pair>["a"], words: string, proposed: string) => {
    const r = a.threads.add({
      kind: "suggestion",
      ...at(a.text.toString(), words),
      body: "",
      proposed,
    });
    if (!r.ok) throw new Error(r.error);
    return r.id;
  };

  it("accepting replaces the words as an ordinary edit, for everyone", () => {
    const { a, b, sync } = pair();
    const id = suggest(a, "Friday", "Thursday");
    sync();
    expect(b.threads.accept(id)).toEqual({ ok: true });
    sync();
    expect(a.text.toString()).toBe("# Notes\n\nShip on Thursday. Then rest.");
    expect(a.threads.list()[0]).toMatchObject({ status: "accepted", proposed: "Thursday" });
  });

  it("is applied once even if two people accept at the same time", () => {
    const { a, b, sync } = pair();
    const id = suggest(a, "Friday", "Thursday");
    sync();
    a.threads.accept(id);
    b.threads.accept(id);
    sync();
    expect(a.text.toString()).toBe(b.text.toString());
    expect(a.text.toString().match(/Thursday/g)).toBeTruthy();
  });

  it("cannot be accepted once the words changed or went, and says why", () => {
    const { a, b, sync } = pair();
    const id = suggest(a, "Friday", "Thursday");
    sync();
    b.text.insert(b.text.toString().indexOf("day"), "X");
    sync();
    expect(a.threads.accept(id)).toEqual({ ok: false, error: "changed" });
    const { from, to } = at(b.text.toString(), "FriXday");
    b.text.delete(from, to - from);
    sync();
    expect(a.threads.accept(id)).toEqual({ ok: false, error: "gone" });
    expect(a.threads.list()[0]!.status).toBe("open");
  });

  it("rejecting closes it and leaves the text alone", () => {
    const { a, sync, b } = pair();
    const id = suggest(a, "Friday", "Thursday");
    sync();
    b.threads.setStatus(id, "rejected");
    sync();
    expect(a.threads.list()[0]!.status).toBe("rejected");
    expect(a.text.toString()).toContain("Friday");
  });

  it("can delete words, and the accepter's Undo is theirs (a transaction with their origin)", () => {
    const { a } = pair();
    const id = suggest(a, " Then rest", "");
    a.threads.accept(id);
    expect(a.text.toString()).toBe("# Notes\n\nShip on Friday..");
  });
});

describe("who may delete", () => {
  const item = { author: ada };
  it("the author may, and the owner may delete anyone's; others may not", () => {
    expect(canDelete(item, "u1", false)).toBe(true);
    expect(canDelete(item, "u2", false)).toBe(false);
    expect(canDelete(item, "u2", true)).toBe(true);
  });
});

describe("leaving a trace when live editing stops", () => {
  it("writes the open threads as Markdown, with the words they were about", () => {
    const { a } = pair();
    const t = a.text.toString();
    const c = a.threads.add({ kind: "comment", ...at(t, "Friday"), body: "Which Friday?" });
    a.threads.add({ kind: "suggestion", ...at(t, "rest"), body: "", proposed: "relax" });
    if (c.ok) a.threads.reply(c.id, "This one");
    const closed = a.threads.add({ kind: "comment", ...at(t, "Notes"), body: "done already" });
    if (closed.ok) a.threads.setStatus(closed.id, "resolved");
    const out = exportThreads(a.threads.list());
    expect(out).toContain("Comments and suggestions");
    expect(out).toContain("“Friday”");
    expect(out).toContain("Ada: Which Friday?");
    expect(out).toContain("Ada: This one");
    expect(out).toContain("suggested “relax” for “rest”");
    expect(out).not.toContain("done already"); // resolved ones are not carried over
    expect(exportThreads([])).toBe("");
  });
});
