import { describe, expect, it } from "vitest";
import { applied, parse } from "@/test/marked";
import { getContext, runCommand, type Command } from "./editing";

const run = (marked: string, cmd: Command) => applied(marked, (snap) => runCommand(snap, cmd));

describe("inline marks", () => {
  it("wraps the selection", () => expect(run("a ⟦b c⟧ d", "bold")).toBe("a **⟦b c⟧** d"));
  it("keeps the caret when wrapping the word under it", () =>
    expect(run("hello wo¦rld", "bold")).toBe("hello **wo¦rld**"));
  it("inserts a selected placeholder when there is no word", () =>
    expect(run("a ¦ b", "bold")).toBe("a **⟦text⟧** b"));
  it("unwraps a selection wrapped on the outside", () =>
    expect(run("**⟦x⟧**", "bold")).toBe("⟦x⟧"));
  it("unwraps a selection that includes the markers", () =>
    expect(run("⟦**x**⟧", "bold")).toBe("⟦x⟧"));
  it("pressing bold twice returns the original text", () => {
    const once = run("⟦abc⟧", "bold")!;
    expect(run(once, "bold")).toBe("⟦abc⟧");
  });
  it("unwraps the whole span when the caret is inside several words", () =>
    expect(run("**two wo¦rds**", "bold")).toBe("two wo¦rds"));
  it("handles italic with underscores and asterisks", () => {
    expect(run("⟦x⟧", "italic")).toBe("_⟦x⟧_");
    expect(run("*⟦x⟧*", "italic")).toBe("⟦x⟧");
    expect(run("_⟦x⟧_", "italic")).toBe("⟦x⟧");
  });
  it("does not mistake bold for italic", () => expect(run("**⟦x⟧**", "italic")).toBe("**_⟦x⟧_**"));
  it("separates bold and italic inside ***x***", () => {
    expect(run("***⟦x⟧***", "italic")).toBe("**⟦x⟧**");
    expect(run("***⟦x⟧***", "bold")).toBe("*⟦x⟧*");
  });
  it("supports strikethrough and highlight", () => {
    expect(run("⟦x⟧", "strike")).toBe("~~⟦x⟧~~");
    expect(run("==⟦x⟧==", "highlight")).toBe("⟦x⟧");
  });
  it("uses a longer fence when code contains a backtick", () =>
    expect(run("⟦a`b⟧", "code")).toBe("``⟦a`b⟧``"));
  it("moves markers inside surrounding whitespace", () =>
    expect(run("⟦ x ⟧", "bold")).toBe(" **⟦x⟧** "));
  it("wraps each line of a multi-line selection", () =>
    expect(run("⟦one\ntwo⟧", "bold")).toBe("**⟦one**\n**two⟧**"));
  it("unwraps every line when all are wrapped", () =>
    expect(run("**⟦one**\n**two⟧**", "bold")).toBe("⟦one\ntwo⟧"));
});

describe("headings", () => {
  it("sets a heading and keeps the caret in the text", () =>
    expect(run("tit¦le", "h2")).toBe("## tit¦le"));
  it("toggles the same level off", () => expect(run("## tit¦le", "h2")).toBe("tit¦le"));
  it("changes level", () => expect(run("## t¦", "h3")).toBe("### t¦"));
  it("paragraph removes heading and list markers", () => {
    expect(run("## ¦t", "h0")).toBe("¦t");
    expect(run("- ¦t", "h0")).toBe("¦t");
  });
  it("replaces a list marker", () => expect(run("- ¦x", "h1")).toBe("# ¦x"));
  it("keeps a quote prefix", () => expect(run("> ¦x", "h1")).toBe("> # ¦x"));
  it("moves a caret that sat in the old marker to the start of the text", () =>
    expect(run("#¦# t", "h1")).toBe("# ¦t"));
});

describe("quote and lists", () => {
  it("toggles a quote", () => {
    expect(run("¦text", "quote")).toBe("> ¦text");
    expect(run("> ¦text", "quote")).toBe("¦text");
  });
  it("skips blank lines in a multi-line selection", () =>
    expect(run("⟦a\n\nb⟧", "quote")).toBe("> ⟦a\n\n> b⟧"));
  it("adds a marker on a blank line when there is no selection", () =>
    expect(run("¦", "bullet")).toBe("- ¦"));
  it("toggles bullets and converts other list kinds", () => {
    expect(run("¦item", "bullet")).toBe("- ¦item");
    expect(run("- ¦item", "bullet")).toBe("¦item");
    expect(run("1. ¦x", "bullet")).toBe("- ¦x");
    expect(run("- [ ] ¦x", "bullet")).toBe("- ¦x");
  });
  it("numbers ordered lists and toggles them off", () => {
    expect(run("⟦a\nb\nc⟧", "ordered")).toBe("1. ⟦a\n2. b\n3. c⟧");
    expect(run("1. ⟦a\n2. b⟧", "ordered")).toBe("⟦a\nb⟧");
  });
  it("numbers each indent level on its own", () =>
    expect(run("⟦- a\n  - b\n- c⟧", "ordered")).toBe("1. ⟦a\n  1. b\n2. c⟧"));
  it("toggles tasks and keeps a checked state when converting bullets", () => {
    expect(run("¦x", "task")).toBe("- [ ] ¦x");
    expect(run("- [x] ¦x", "task")).toBe("¦x");
    expect(run("- ¦x", "task")).toBe("- [ ] ¦x");
  });
  it("keeps a quote prefix when changing lists", () =>
    expect(run("> ¦x", "bullet")).toBe("> - ¦x"));
  it("is not fooled by emphasis, rules or decimals", () => {
    expect(run("*em* ¦text", "bullet")).toBe("- *em* ¦text");
    expect(run("---¦", "bullet")).toBe("- ---¦");
    expect(run("1.5 ¦million", "ordered")).toBe("1. 1.5 ¦million");
  });
});

describe("indent and outdent", () => {
  it("nests a list item under the item above", () =>
    expect(run("- a\n- ¦b", "indent")).toBe("- a\n  - ¦b"));
  it("uses the parent's content width for ordered lists", () =>
    expect(run("1. a\n1. ¦b", "indent")).toBe("1. a\n   1. ¦b"));
  it("outdents to the parent's indent", () =>
    expect(run("- a\n  - ¦b", "outdent")).toBe("- a\n- ¦b"));
  it("shifts a multi-line selection by the same amount", () =>
    expect(run("- a\n⟦- b\n  - c⟧", "indent")).toBe("- a\n  ⟦- b\n    - c⟧"));
  it("does nothing for the first item, top-level items and plain text", () => {
    expect(run("- ¦a", "indent")).toBeNull();
    expect(run("- a\n- ¦b", "outdent")).toBeNull();
    expect(run("plain ¦text", "indent")).toBeNull();
  });
});

describe("context", () => {
  const ctx = (marked: string) => getContext(parse(marked));
  it("reports marks around the caret or selection", () => {
    expect(ctx("**bo¦ld** text").bold).toBe(true);
    expect(ctx("**two wo¦rds**").bold).toBe(true);
    expect(ctx("**⟦x⟧**").bold).toBe(true);
    expect(ctx("**x** te¦xt").bold).toBe(false);
    expect(ctx("**x¦**").italic).toBe(false);
    expect(ctx("_it¦_").italic).toBe(true);
    expect(ctx("`co¦de`").code).toBe(true);
  });
  it("reports heading, quote and list state", () => {
    expect(ctx("## h¦").heading).toBe(2);
    expect(ctx("para¦").heading).toBe(0);
    expect(ctx("> ¦q").quote).toBe(true);
    expect(ctx("1. x¦").list).toBe("ordered");
    expect(ctx("- [ ] x¦").list).toBe("task");
    expect(ctx("- x¦").list).toBe("bullet");
    expect(ctx("x¦").list).toBeNull();
  });
});
