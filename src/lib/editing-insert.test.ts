import { describe, expect, it } from "vitest";
import { applied, parse } from "@/test/marked";
import { getContext } from "./editing";
import {
  codeBlock,
  findLinkAt,
  insertFootnote,
  insertImage,
  insertLink,
  insertAlert,
  insertDetails,
  insertMathBlock,
  insertMermaid,
  insertRule,
  wrapTag,
  MERMAID_TEMPLATES,
} from "./editing-insert";

describe("insertLink", () => {
  const link = (marked: string, values: Parameters<typeof insertLink>[1]) =>
    applied(marked, (s) => insertLink(s, values));

  it("links the selected text and leaves the caret after the link", () =>
    expect(link("see ⟦docs⟧ now", { url: "https://a.b" })).toBe("see [docs](https://a.b)¦ now"));
  it("uses the given text when nothing is selected", () =>
    expect(link("¦", { text: "Home", url: "/home" })).toBe("[Home](/home)¦"));
  it("falls back to the URL as the link text", () =>
    expect(link("¦", { url: "https://a.b" })).toBe("[https://a.b](https://a.b)¦"));
  it("adds a title and escapes quotes in it", () =>
    expect(link("¦", { text: "a", url: "u", title: 'say "hi"' })).toBe('[a](u "say \\"hi\\"")¦'));
  it("wraps destinations containing spaces or parentheses in angle brackets", () =>
    expect(link("¦", { text: "x", url: "my notes (1).md" })).toBe("[x](<my notes (1).md>)¦"));
  it("escapes brackets in the link text", () =>
    expect(link("¦", { text: "a [b] c", url: "u" })).toBe("[a \\[b\\] c](u)¦"));
  it("replaces an existing link when given its range", () => {
    const snap = parse("see [docs](u) now¦");
    const existing = findLinkAt({ ...snap, from: 8, to: 8 })!;
    expect(
      applied("see [docs](u) now¦", (s) =>
        insertLink({ ...s, from: 8, to: 8 }, { text: "new", url: "v" }, existing),
      ),
    ).toBe("see [new](v)¦ now");
  });
});

describe("findLinkAt", () => {
  const at = (marked: string) => findLinkAt(parse(marked));
  it("finds the link under the caret with its parts", () => {
    const l = at('see [do¦cs](https://a.b "T") now');
    expect(l).toMatchObject({ text: "docs", url: "https://a.b", title: "T" });
    expect(l && 'see [docs](https://a.b "T") now'.slice(l.from, l.to)).toBe(
      '[docs](https://a.b "T")',
    );
  });
  it("unwraps angle-bracket destinations", () =>
    expect(at("[x¦](<my file.md>)")?.url).toBe("my file.md"));
  it("ignores the caret outside a link and ignores images", () => {
    expect(at("see [docs](u) no¦w")).toBeNull();
    expect(at("![al¦t](u)")).toBeNull();
  });
});

describe("insertImage", () => {
  const image = (marked: string, values: Parameters<typeof insertImage>[1]) =>
    applied(marked, (s) => insertImage(s, values));
  it("requires alt text", () => {
    expect(image("¦", { alt: "  ", url: "./a.png" })).toBeNull();
  });
  it("inserts image syntax", () =>
    expect(image("¦", { alt: "A cat", url: "./cat.png" })).toBe("![A cat](./cat.png)¦"));
  it("supports a title and escapes brackets in alt", () =>
    expect(image("¦", { alt: "a [b]", url: "u", title: "T" })).toBe('![a \\[b\\]](u "T")¦'));
});

describe("insertFootnote", () => {
  const foot = (marked: string) => applied(marked, insertFootnote);
  it("adds a reference at the caret and a definition at the end", () =>
    expect(foot("Text¦ here.\n")).toBe("Text[^1] here.\n\n[^1]: ¦"));
  it("numbers after the highest numeric label and extends an existing block", () =>
    expect(foot("x¦\n\n[^1]: a\n[^3]: b\n")).toBe("x[^4]\n\n[^1]: a\n[^3]: b\n[^4]: ¦"));
  it("ignores named labels when numbering", () =>
    expect(foot("x¦\n\n[^note]: n")).toBe("x[^1]\n\n[^note]: n\n[^1]: ¦"));
  it("works when the caret is in the trailing whitespace", () =>
    expect(foot("Text\n\n¦")).toBe("Text[^1]\n\n[^1]: ¦"));
});

describe("insertRule", () => {
  const rule = (marked: string) => applied(marked, insertRule);
  it("separates the rule from text above so it cannot become a setext heading", () =>
    expect(rule("para¦")).toBe("para\n\n---\n¦"));
  it("reuses existing blank lines", () => expect(rule("a\n\n¦\n\nb")).toBe("a\n\n---¦\n\nb"));
  it("does not delete the selection", () =>
    expect(rule("⟦abc⟧\n\nnext")).toBe("abc\n\n---¦\n\nnext"));
});

describe("codeBlock", () => {
  const block = (marked: string, lang: string) => applied(marked, (s) => codeBlock(s, lang));

  it("inserts an empty block with the caret inside", () =>
    expect(block("¦", "ts")).toBe("```ts\n¦\n```\n"));
  it("fences the selected lines", () => expect(block("⟦a\nb⟧", "ts")).toBe("```ts\n⟦a\nb⟧\n```"));
  it("fences the current line when the caret is on text", () =>
    expect(block("co¦de", "")).toBe("```\nco¦de\n```"));
  it("uses a longer fence when the content has one", () =>
    expect(block("⟦```x```⟧", "")).toBe("````\n⟦```x```⟧\n````"));
  it("removes the fence when the language is the same", () =>
    expect(block("```ts\nco¦de\n```", "ts")).toBe("co¦de"));
  it("changes the language when it differs", () =>
    expect(block("```ts\nco¦de\n```", "js")).toBe("```js\nco¦de\n```"));
  it("reports the language at the cursor", () => {
    expect(getContext(parse("```ts\nco¦de\n```")).codeLang).toBe("ts");
    expect(getContext(parse("```\nco¦de\n```")).codeLang).toBe("");
    expect(getContext(parse("plain ¦text")).codeLang).toBeNull();
    expect(getContext(parse("```ts\ncode\n```\nafter ¦text")).codeLang).toBeNull();
  });
});

describe("insertAlert", () => {
  const alert = (marked: string, kind: Parameters<typeof insertAlert>[1]) =>
    applied(marked, (s) => insertAlert(s, kind));

  it("inserts an empty alert with the caret on its body line", () =>
    expect(alert("¦", "NOTE")).toBe("> [!NOTE]\n> ¦\n"));
  it("turns the selected lines into an alert", () =>
    expect(alert("⟦a\nb⟧", "TIP")).toBe("> [!TIP]\n> ⟦a\n> b⟧"));
  it("turns the caret's line into an alert and keeps the caret", () =>
    expect(alert("co¦de", "NOTE")).toBe("> [!NOTE]\n> co¦de"));
  it("changes the kind of an existing alert", () =>
    expect(alert("> [!NOTE]\n> te¦xt", "WARNING")).toBe("> [!WARNING]\n> te¦xt"));
  it("removes the alert marker when the same kind is chosen again", () =>
    expect(alert("> [!NOTE]\n> te¦xt", "NOTE")).toBe("> te¦xt"));
  it("adds the marker to a plain quote", () =>
    expect(alert("> te¦xt", "CAUTION")).toBe("> [!CAUTION]\n> te¦xt"));
  it("reports the alert kind at the cursor", () => {
    expect(getContext(parse("> [!NOTE]\n> te¦xt")).alert).toBe("NOTE");
    expect(getContext(parse("> plain ¦quote")).alert).toBeNull();
    expect(getContext(parse("para¦")).alert).toBeNull();
  });
});

describe("math, diagrams and HTML extras", () => {
  it("fences a math block around the selection or inserts an empty one", () => {
    expect(applied("¦", insertMathBlock)).toBe("$$\n¦\n$$\n");
    expect(applied("⟦a+b⟧", insertMathBlock)).toBe("$$\n⟦a+b⟧\n$$");
    expect(applied("a+¦b", insertMathBlock)).toBe("$$\na+¦b\n$$");
  });

  it("inserts a Mermaid starter with the template selected", () => {
    const flow = MERMAID_TEMPLATES.find((t) => t.id === "flowchart")!;
    expect(applied("¦", (s) => insertMermaid(s, "flowchart"))).toBe(
      "```mermaid\n⟦" + flow.code + "⟧\n```\n",
    );
  });
  it("offers the common diagram types", () =>
    expect(MERMAID_TEMPLATES.map((t) => t.id)).toEqual(
      expect.arrayContaining(["flowchart", "sequence", "class", "state", "er", "gantt", "pie"]),
    ));

  it("wraps text in an HTML tag, with a placeholder and a toggle", () => {
    expect(applied("⟦x⟧", (s) => wrapTag(s, "kbd"))).toBe("<kbd>⟦x⟧</kbd>");
    expect(applied("¦", (s) => wrapTag(s, "sub"))).toBe("<sub>⟦text⟧</sub>");
    expect(applied("<kbd>⟦x⟧</kbd>", (s) => wrapTag(s, "kbd"))).toBe("⟦x⟧");
  });

  it("inserts a collapsible details block with the summary selected", () =>
    expect(applied("¦", insertDetails)).toBe(
      "<details>\n<summary>⟦Summary⟧</summary>\n\nContent\n\n</details>\n",
    ));
});
