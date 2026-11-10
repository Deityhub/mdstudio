import { describe, expect, it } from "vitest";
import { AI_ACTIONS, actionInstruction, cleanEdit } from "./actions";

describe("inline AI actions", () => {
  it("offers the writing actions the roadmap names", () => {
    const ids = AI_ACTIONS.map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "improve",
        "proofread",
        "shorten",
        "expand",
        "summarize",
        "translate",
      ]),
    );
  });
  it("needs a language for translate and text for a custom instruction", () => {
    expect(actionInstruction("translate", "")).toBeNull();
    expect(actionInstruction("translate", "French")).toContain("French");
    expect(actionInstruction("custom", "  ")).toBeNull();
    expect(actionInstruction("custom", "Make it rhyme")).toBe("Make it rhyme");
    expect(actionInstruction("shorten", "")).toMatch(/shorter|shorten/i);
  });
  it("removes a code fence the model wrapped around the answer, but not one that was asked for", () => {
    expect(cleanEdit("```markdown\nHello **you**\n```", "Hello you")).toBe("Hello **you**");
    expect(cleanEdit("```js\nlet a = 1\n```", "```js\nlet a\n```")).toBe("```js\nlet a = 1\n```");
  });
  it("keeps the whitespace around the selection so only its words change", () => {
    expect(cleanEdit("Better text.\n", "  old text\n\n")).toBe("  Better text.\n\n");
    expect(cleanEdit("Better text.", "old text")).toBe("Better text.");
  });
});
