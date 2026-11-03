import { describe, expect, it } from "vitest";
import { blockAtLine, lineOfTarget, previewBlocks } from "./source-lines";

function preview(html: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

const DOC = `
<h1 data-sl="1" data-el="1">Title</h1>
<p data-sl="3" data-el="4">one <a href="#x">link</a><br>two</p>
<ul>
  <li data-sl="6" data-el="8">item <b>bold</b>
    <ul><li data-sl="7" data-el="8">nested</li></ul>
  </li>
</ul>
<pre data-sl="10" data-el="12"><code>code</code></pre>
<p>no lines</p>`;

describe("blockAtLine", () => {
  const root = preview(DOC);
  it("finds the block holding a line, preferring the innermost one", () => {
    expect(blockAtLine(root, 1)?.tagName).toBe("H1");
    expect(blockAtLine(root, 4)?.tagName).toBe("P");
    expect(blockAtLine(root, 6)?.textContent).toContain("item");
    expect(blockAtLine(root, 7)?.textContent?.trim()).toBe("nested");
    expect(blockAtLine(root, 8)?.textContent?.trim()).toBe("nested");
    expect(blockAtLine(root, 11)?.tagName).toBe("PRE");
  });
  it("returns null for a line no block covers", () => {
    expect(blockAtLine(root, 2)).toBeNull();
    expect(blockAtLine(root, 99)).toBeNull();
  });
});

describe("lineOfTarget", () => {
  const root = preview(DOC);
  it("gives the first line of the block that was clicked, innermost first", () => {
    expect(lineOfTarget(root.querySelector("b"), root)).toBe(6);
    expect(lineOfTarget(root.querySelector("li li"), root)).toBe(7);
    expect(lineOfTarget(root.querySelector("code"), root)).toBe(10);
    expect(lineOfTarget(root.querySelector("h1"), root)).toBe(1);
  });
  it("is null for text outside any block, or for the container itself", () => {
    expect(lineOfTarget(root.lastElementChild, root)).toBeNull();
    expect(lineOfTarget(root, root)).toBeNull();
    expect(lineOfTarget(null, root)).toBeNull();
  });
});

describe("previewBlocks", () => {
  it("lists only the innermost blocks, positioned from the top of the scroll container", () => {
    const root = preview(DOC);
    const scroller = document.createElement("div");
    Object.defineProperty(scroller, "scrollTop", { value: 100 });
    scroller.getBoundingClientRect = () => ({ top: 50 }) as DOMRect;
    // everything is drawn 10px below the container's top edge, with 20px of height
    root.querySelectorAll("[data-sl]").forEach((el, i) => {
      el.getBoundingClientRect = () => ({ top: 60 + i * 30, bottom: 80 + i * 30 }) as DOMRect;
    });
    const blocks = previewBlocks(root, scroller);
    // the outer li holds the nested li, so it is left out
    expect(blocks.map((b) => [b.from, b.to])).toEqual([
      [1, 1],
      [3, 4],
      [7, 8],
      [10, 12],
    ]);
    // scrolled 100px, the container's top edge is at 50, so content top is at -50: y = rect.top + 50 - 0 ...
    expect(blocks[0]).toMatchObject({ top: 60 - (50 - 100), bottom: 80 - (50 - 100) });
  });
});
