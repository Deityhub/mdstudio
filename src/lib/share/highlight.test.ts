import { describe, expect, it } from "vitest";
import { clearHighlights, highlightSnippet } from "./highlight";

const block = (html: string) => {
  const root = document.createElement("div");
  root.innerHTML = `<p>${html}</p>`;
  return { root, p: root.firstElementChild as HTMLElement };
};
const marked = (root: Element) =>
  Array.from(root.querySelectorAll("mark[data-comment]")).map((m) => m.textContent);

describe("highlightSnippet", () => {
  it("marks the words in a block and tags the mark with the comment", () => {
    const { root, p } = block("Ship on Friday. Then rest.");
    expect(highlightSnippet(p, "on Friday.", "c1")).toBe(true);
    expect(marked(root)).toEqual(["on Friday."]);
    expect(root.querySelector("mark")?.getAttribute("data-comment")).toBe("c1");
    expect(root.textContent).toBe("Ship on Friday. Then rest.");
  });

  it("marks words that run across formatting, and across line breaks in the source", () => {
    const { root, p } = block("Ship <strong>on\nFriday</strong>, then <em>rest</em>.");
    expect(highlightSnippet(p, "on Friday, then rest", "c1")).toBe(true);
    expect(marked(root).join("")).toBe("on\nFriday, then rest");
    expect(root.textContent).toBe("Ship on\nFriday, then rest.");
  });

  it("does nothing when the words are not there", () => {
    const { root, p } = block("Ship on Friday.");
    expect(highlightSnippet(p, "Monday", "c1")).toBe(false);
    expect(highlightSnippet(p, "   ", "c1")).toBe(false);
    expect(root.querySelector("mark")).toBeNull();
  });

  it("can mark two overlapping comments, and clearing restores the text exactly", () => {
    const { root, p } = block("Ship on Friday. Then rest.");
    const before = root.innerHTML;
    highlightSnippet(p, "on Friday.", "a");
    highlightSnippet(p, "Friday. Then", "b");
    expect(marked(root).join("")).toContain("Friday.");
    clearHighlights(root);
    expect(root.innerHTML).toBe(before);
  });

  it("leaves diagrams and math alone", () => {
    const { root, p } = block('Pay <span class="katex">x2</span> now');
    expect(highlightSnippet(p, "x2", "c1")).toBe(false);
    expect(root.querySelector("mark")).toBeNull();
  });
});
