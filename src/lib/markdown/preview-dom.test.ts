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
