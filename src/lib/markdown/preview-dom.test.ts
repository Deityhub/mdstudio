import { describe, expect, it } from "vitest";
import { patchHtml } from "./preview-dom";

const box = () => document.createElement("div");
const mark = (el: Element | null) => ((el as HTMLElement & { live?: boolean }).live = true);
const live = (el: Element | null) => !!(el as (HTMLElement & { live?: boolean }) | null)?.live;

describe("patchHtml", () => {
  it("fills an empty container", () => {
    const c = box();
    patchHtml(c, "<h1>A</h1>\n<p>b</p>");
    expect(c.innerHTML).toBe("<h1>A</h1>\n<p>b</p>");
  });

  it("keeps the live nodes of blocks that did not change", () => {
    const c = box();
    patchHtml(c, "<p>one</p>\n<p>two</p>\n<p>three</p>");
    c.querySelectorAll("p").forEach(mark);
    patchHtml(c, "<p>one</p>\n<p>TWO</p>\n<p>three</p>");
    const [a, b, d] = [...c.querySelectorAll("p")];
    expect([live(a!), live(b!), live(d!)]).toEqual([true, false, true]);
    expect(c.textContent).toContain("TWO");
  });

  it("does not disturb the blocks after an insertion or deletion", () => {
    const c = box();
    patchHtml(c, "<p>a</p>\n<p>b</p>\n<p>c</p>");
    c.querySelectorAll("p").forEach(mark);
    patchHtml(c, "<h2>new</h2>\n<p>a</p>\n<p>b</p>\n<p>c</p>");
    expect([...c.querySelectorAll("p")].every(live)).toBe(true);
    patchHtml(c, "<h2>new</h2>\n<p>a</p>\n<p>c</p>");
    expect(c.querySelectorAll("p")).toHaveLength(2);
    expect([...c.querySelectorAll("p")].every(live)).toBe(true);
  });

  it("removes trailing blocks and clears the container", () => {
    const c = box();
    patchHtml(c, "<p>a</p><p>b</p>");
    patchHtml(c, "<p>a</p>");
    expect(c.innerHTML).toBe("<p>a</p>");
    patchHtml(c, "");
    expect(c.innerHTML).toBe("");
  });

  it("is a no-op for identical HTML", () => {
    const c = box();
    patchHtml(c, "<p>a</p>\n<pre><code>x</code></pre>");
    c.querySelectorAll("*").forEach(mark);
    patchHtml(c, "<p>a</p>\n<pre><code>x</code></pre>");
    expect([...c.querySelectorAll("*")].every(live)).toBe(true);
  });
});

describe("patchHtml with source lines", () => {
  const b = (sl: number, text: string) => `<p data-sl="${sl}" data-el="${sl}">${text}</p>`;

  it("keeps the live nodes when only the line numbers moved, and updates the numbers", () => {
    const c = box();
    patchHtml(c, [b(1, "a"), b(3, "b"), b(5, "c")].join("\n"));
    c.querySelectorAll("p").forEach(mark);
    // a line was added above: every block's numbers move down by one
    patchHtml(c, [b(1, "NEW"), b(4, "a"), b(6, "b"), b(8, "c")].join("\n"));
    const ps = [...c.querySelectorAll("p")];
    expect(ps.map((p) => p.getAttribute("data-sl"))).toEqual(["1", "4", "6", "8"]);
    expect(ps.map(live)).toEqual([false, true, true, true]);
  });

  it("updates the numbers of nested blocks too", () => {
    const c = box();
    const list = (a: number, b2: number) =>
      `<ul><li data-sl="${a}" data-el="${a}">x</li><li data-sl="${b2}" data-el="${b2}">y</li></ul>`;
    patchHtml(c, list(1, 2));
    c.querySelectorAll("li").forEach(mark);
    patchHtml(c, list(5, 6));
    const lis = [...c.querySelectorAll("li")];
    expect(lis.map((l) => l.getAttribute("data-sl"))).toEqual(["5", "6"]);
    expect(lis.every(live)).toBe(true);
  });
});

describe("patchHtml and the active block marker", () => {
  it("does not replace a block just because it is marked or unmarked as active", () => {
    const c = box();
    patchHtml(c, "<p>a</p>\n<p>b</p>");
    c.querySelectorAll("p").forEach(mark);
    c.querySelectorAll("p")[1]!.setAttribute("data-active", "");
    patchHtml(c, "<p>a</p>\n<p>b</p>");
    expect([...c.querySelectorAll("p")].every(live)).toBe(true);
  });
});
