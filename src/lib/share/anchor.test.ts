import { describe, expect, it } from "vitest";
import type { ShareComment } from "./protocol";
import { blockText, placeComments, plainText } from "./anchor";

const c = (over: Partial<ShareComment> & { id: string }): ShareComment => ({
  parentId: null,
  author: "Bea",
  mine: false,
  line: 1,
  snippet: "",
  body: "hello",
  outdated: false,
  resolved: false,
  createdAt: 1,
  ...over,
});
const blocks = [
  { line: 1, text: "Quarterly plan" },
  { line: 3, text: "Ship on Friday. Then rest." },
  { line: 5, text: "Budget is fixed" },
];

describe("blockText", () => {
  it("is the words of the block on one line, cut to what a snippet keeps", () => {
    expect(blockText("  Ship   on\nFriday. ")).toBe("Ship on Friday.");
    expect(blockText("x".repeat(500)).length).toBe(120);
  });
});

describe("plainText", () => {
  it("is the whole block on one line, however long", () => {
    expect(plainText(" a\n b ")).toBe("a b");
    expect(plainText("x".repeat(500)).length).toBe(500);
  });
});

describe("placeComments", () => {
  it("finds an outdated comment by words selected anywhere in the block", () => {
    const moved = [
      { line: 2, text: "Something else" },
      { line: 9, text: "Ship on Friday. Then rest, and ship again." },
    ];
    const { byLine } = placeComments(
      [c({ id: "mid", line: 3, snippet: "rest, and ship", outdated: true })],
      moved,
    );
    expect(byLine.get(9)?.[0]?.comment.id).toBe("mid");
  });

  it("puts a current comment on the block that starts at its line, with its replies", () => {
    const { byLine, loose } = placeComments(
      [c({ id: "a", line: 3 }), c({ id: "r", parentId: "a", line: 3 }), c({ id: "b", line: 5 })],
      blocks,
    );
    expect(byLine.get(3)?.map((t) => [t.comment.id, t.replies.map((r) => r.id)])).toEqual([
      ["a", ["r"]],
    ]);
    expect(byLine.get(5)?.[0]?.comment.id).toBe("b");
    expect(loose).toEqual([]);
  });

  it("finds an outdated comment's block again by the start of its text, wherever it moved to", () => {
    const moved = [{ line: 9, text: "Ship on Friday. Then rest." }];
    const { byLine, loose } = placeComments(
      [c({ id: "old", line: 3, snippet: "Ship on Friday.", outdated: true })],
      moved,
    );
    expect(byLine.get(9)?.[0]?.comment.id).toBe("old");
    expect(loose).toEqual([]);
  });

  it("keeps an outdated comment whose block is gone, and one whose line has no block, in the loose list", () => {
    const { byLine, loose } = placeComments(
      [
        c({ id: "gone", line: 3, snippet: "A paragraph that was deleted", outdated: true }),
        c({ id: "nowhere", line: 99 }),
      ],
      blocks,
    );
    expect(byLine.size).toBe(0);
    expect(loose.map((t) => t.comment.id)).toEqual(["gone", "nowhere"]);
  });

  it("prefers the same line when several blocks begin with the same words", () => {
    const twins = [
      { line: 1, text: "Same start here" },
      { line: 7, text: "Same start here too" },
    ];
    const { byLine } = placeComments(
      [c({ id: "x", line: 7, snippet: "Same start", outdated: true })],
      twins,
    );
    expect(byLine.get(7)?.[0]?.comment.id).toBe("x");
  });

  it("orders threads as written, and a reply whose parent is missing stands alone", () => {
    const { byLine, loose } = placeComments(
      [
        c({ id: "2", line: 3, createdAt: 2 }),
        c({ id: "1", line: 3, createdAt: 1 }),
        c({ id: "orphan", parentId: "zzz", line: 3 }),
      ],
      blocks,
    );
    expect(byLine.get(3)?.map((t) => t.comment.id)).toEqual(["1", "2"]);
    expect(loose.map((t) => t.comment.id)).toEqual(["orphan"]);
  });
});
