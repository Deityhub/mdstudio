import { describe, expect, it } from "vitest";
import { applied, parse } from "@/test/marked";
import { getContext } from "./editing";
import { insertTable, isInTable, tableCommand, tableMove, type TableCommand } from "./tables";

const cmd = (marked: string, c: TableCommand) => applied(marked, (s) => tableCommand(s, c));
const move = (marked: string, dir: 1 | -1) => applied(marked, (s) => tableMove(s, dir));

describe("insertTable", () => {
  it("inserts an aligned table and selects the first header cell", () =>
    expect(applied("¦", (s) => insertTable(s, 2, 3))).toBe(
      [
        "| ⟦Column 1⟧ | Column 2 | Column 3 |",
        "| -------- | -------- | -------- |",
        "|          |          |          |",
        "|          |          |          |",
        "",
      ].join("\n"),
    ));
  it("clamps silly sizes", () => {
    const edit = insertTable(parse("¦"), 0, 100);
    const text = edit.changes[0]!.insert;
    expect(text.split("\n")[0]!.match(/\|/g)!.length).toBe(13); // 12 columns
    expect(text.trim().split("\n").length).toBe(3); // header, delimiter, one row
  });
});

describe("format", () => {
  it("pads every column and keeps the caret in its cell", () =>
    expect(cmd("|a|b|\n|-|-|\n|long ce¦ll|x|", "format")).toBe(
      "| a         | b   |\n| --------- | --- |\n| long ce¦ll | x   |",
    ));
  it("works without outer pipes", () =>
    expect(cmd("a | b\n- | -\n1 | ¦2", "format")).toBe(
      "| a   | b   |\n| --- | --- |\n| 1   | ¦2   |",
    ));
  it("keeps escaped pipes inside a cell", () =>
    expect(cmd("| a \\| b | c |\n| - | - |\n| x¦ | y |", "format")).toBe(
      "| a \\| b | c   |\n| ------ | --- |\n| x¦      | y   |",
    ));
});

describe("alignment", () => {
  const src = "| a | b |\n| - | - |\n| 1 | ¦2 |";
  it("aligns the caret's column right", () =>
    expect(cmd(src, "align-right")).toBe("| a   |   b |\n| --- | --: |\n| 1   |   ¦2 |"));
  it("centers and clears alignment", () => {
    expect(cmd(src, "align-center")).toBe("| a   |  b  |\n| --- | :-: |\n| 1   |  ¦2  |");
    expect(cmd("| a | b |\n| - | --: |\n| 1 | ¦2 |", "align-none")).toBe(
      "| a   | b   |\n| --- | --- |\n| 1   | ¦2   |",
    );
  });
});

describe("rows", () => {
  const src = "| a | b |\n| - | - |\n| 1 | 2 |\n| ¦3 | 4 |";
  it("adds a row below and puts the caret in its first cell", () =>
    expect(cmd("| a | b |\n| - | - |\n| 1¦ | 2 |", "row-below")).toBe(
      "| a   | b   |\n| --- | --- |\n| 1   | 2   |\n| ¦    |     |",
    ));
  it("adds a row above a body row", () =>
    expect(cmd(src, "row-above")).toBe(
      "| a   | b   |\n| --- | --- |\n| 1   | 2   |\n| ¦    |     |\n| 3   | 4   |",
    ));
  it("does not add a row above the header", () =>
    expect(cmd("| a¦ | b |\n| - | - |\n| 1 | 2 |", "row-above")).toBeNull());
  it("deletes a body row but never the header", () => {
    expect(cmd(src, "delete-row")).toBe("| a   | b   |\n| --- | --- |\n| ¦1   | 2   |");
    expect(cmd("| a¦ | b |\n| - | - |\n| 1 | 2 |", "delete-row")).toBeNull();
  });
});

describe("columns", () => {
  it("adds a column to the right and moves into it", () =>
    expect(cmd("| a¦ | b |\n| - | - |\n| 1 | 2 |", "col-right")).toBe(
      "| a   | ¦    | b   |\n| --- | --- | --- |\n| 1   |     | 2   |",
    ));
  it("adds a column to the left", () =>
    expect(cmd("| a | b¦ |\n| - | - |\n| 1 | 2 |", "col-left")).toBe(
      "| a   | ¦    | b   |\n| --- | --- | --- |\n| 1   |     | 2   |",
    ));
  it("deletes a column but keeps at least one", () => {
    expect(cmd("| a | b¦ |\n| - | - |\n| 1 | 2 |", "delete-col")).toBe(
      "| ¦a   |\n| --- |\n| 1   |",
    );
    expect(cmd("| a¦ |\n| - |\n| 1 |", "delete-col")).toBeNull();
  });
});

describe("Tab navigation", () => {
  const t = "| a | b |\n| - | - |\n| 1 | 2 |";
  it("moves to the next cell and selects its content", () =>
    expect(move("| a¦ | b |\n| - | - |\n| 1 | 2 |", 1)).toBe("| a | ⟦b⟧ |\n| - | - |\n| 1 | 2 |"));
  it("wraps to the next row, skipping the delimiter row", () =>
    expect(move("| a | b¦ |\n| - | - |\n| 1 | 2 |", 1)).toBe("| a | b |\n| - | - |\n| ⟦1⟧ | 2 |"));
  it("moves backwards and stops at the first cell", () => {
    expect(move("| a | b |\n| - | - |\n| 1¦ | 2 |", -1)).toBe("| a | ⟦b⟧ |\n| - | - |\n| 1 | 2 |");
    expect(move("| a¦ | b |\n| - | - |\n| 1 | 2 |", -1)).toBeNull();
  });
  it("adds a row after the last cell", () => {
    const out = move("| a | b |\n| - | - |\n| 1 | 2¦ |", 1)!;
    expect(out.split("\n")).toHaveLength(4);
    expect(out.split("\n")[3]).toContain("¦");
  });
  it("does nothing outside a table", () => {
    expect(move("plain ¦text", 1)).toBeNull();
    expect(isInTable(parse(t.replace("a", "a¦")))).toBe(true);
    expect(isInTable(parse("plain ¦text | with pipe"))).toBe(false);
  });
});

describe("context", () => {
  it("reports whether the caret is in a table", () => {
    expect(getContext(parse("| a¦ | b |\n| - | - |")).table).toBe(true);
    expect(getContext(parse("para¦")).table).toBe(false);
  });
});
