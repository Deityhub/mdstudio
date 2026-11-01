import { beforeEach, describe, expect, it } from "vitest";
import {
  describeDiagramError,
  hydrateDiagrams,
  inlineDiagrams,
  rememberDiagram,
  resetDiagramState,
  withCachedDiagrams,
  type DiagramResult,
} from "./diagrams";

const block = (code: string, lang = "mermaid") =>
  `<pre><code class="hljs language-${lang}">${code}</code></pre>`;
const ok = async (): Promise<DiagramResult> => ({ svg: "<svg><title>d</title></svg>" });
const fail = async (): Promise<DiagramResult> => ({ error: "Parse error on line 2" });

describe("inlineDiagrams (export)", () => {
  it("replaces mermaid blocks with their SVG and leaves other code alone", async () => {
    const out = await inlineDiagrams(block("graph TD\nA-->B") + block("const x = 1", "ts"), ok);
    expect(out).toContain('<div class="md-mermaid"');
    expect(out).toContain("<svg>");
    expect(out).not.toContain("graph TD");
    expect(out).toContain("language-ts");
  });
  it("keeps the source as a code block when a diagram is invalid", async () => {
    const out = await inlineDiagrams(block("nonsense"), fail);
    expect(out).toContain("<pre>");
    expect(out).toContain("nonsense");
    expect(out).not.toContain("md-mermaid");
  });
  it("passes the diagram source, decoded, to the renderer", async () => {
    const seen: string[] = [];
    await inlineDiagrams(block("A--&gt;B"), async (s) => (seen.push(s), { svg: "<svg/>" }));
    expect(seen).toEqual(["A-->B"]);
  });
});

describe("hydrateDiagrams (preview)", () => {
  const root = (html: string) => {
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.append(el);
    return el;
  };

  it("swaps each mermaid block for an accessible figure", async () => {
    const el = root(block("graph TD\nA-->B"));
    await hydrateDiagrams(el, ok);
    const fig = el.querySelector(".md-mermaid")!;
    expect(fig.getAttribute("role")).toBe("img");
    expect(fig.getAttribute("aria-label")).toBeTruthy();
    expect(fig.querySelector("svg")).not.toBeNull();
    expect(el.querySelector("pre")).toBeNull();
  });

  it("shows the error under the code block and keeps the source", async () => {
    const el = root(block("nonsense"));
    await hydrateDiagrams(el, fail);
    expect(el.querySelector("pre")).not.toBeNull();
    expect(el.querySelector('.md-mermaid-error[role="alert"]')?.textContent).toContain(
      "Parse error on line 2",
    );
  });

  it("finishes synchronously when the renderer already has the answer (no flicker)", () => {
    const el = root(block("graph TD\nA-->B"));
    void hydrateDiagrams(el, () => ({ svg: "<svg/>" }));
    expect(el.querySelector(".md-mermaid")).not.toBeNull();
  });

  it("skips blocks that were replaced while rendering", async () => {
    const el = root(block("graph TD\nA-->B"));
    const pending = hydrateDiagrams(el, async () => {
      el.innerHTML = "<p>new render</p>"; // the preview re-rendered underneath us
      return { svg: "<svg/>" };
    });
    await expect(pending).resolves.toBeUndefined();
    expect(el.textContent).toBe("new render");
  });
});

describe("describeDiagramError", () => {
  it("keeps where it failed and what was expected", () =>
    expect(
      describeDiagramError(
        new Error("Parse error on line 4:\n  A -->\n----^\nExpecting 'AMP', got 'NEWLINE'"),
      ),
    ).toBe("Parse error on line 4: Expecting 'AMP', got 'NEWLINE'"));
  it("handles single-line, non-Error and long messages", () => {
    expect(describeDiagramError(new Error("Boom"))).toBe("Boom");
    expect(describeDiagramError("plain")).toBe("plain");
    expect(describeDiagramError(new Error("x".repeat(500))).length).toBe(240);
  });
});

describe("withCachedDiagrams (smooth re-renders)", () => {
  beforeEach(() => resetDiagramState());

  it("swaps in a cached diagram right away, so it never flashes as code", () => {
    rememberDiagram("graph TD\nA-->B", { svg: "<svg>cached</svg>" });
    const out = withCachedDiagrams(block("graph TD\nA-->B"));
    expect(out).toContain('class="md-mermaid"');
    expect(out).toContain("<svg>cached</svg>");
    expect(out).not.toContain("language-mermaid");
  });

  it("shows the previous diagram at that position while a changed one renders", () => {
    rememberDiagram("graph TD\nA-->B", { svg: "<svg>old</svg>" });
    withCachedDiagrams(block("graph TD\nA-->B")); // establishes what is on screen
    const out = withCachedDiagrams(block("graph TD\nA-->B-->C"));
    expect(out).toContain("md-mermaid-stale");
    expect(out).toContain("<svg>old</svg>");
    const stale = new DOMParser()
      .parseFromString(out, "text/html")
      .querySelector<HTMLElement>(".md-mermaid-stale");
    expect(stale?.dataset["source"]).toBe("graph TD\nA-->B-->C");
  });

  it("shows a known failure as code plus its error straight away, never as a bare code block", () => {
    rememberDiagram("bad", { error: "Parse error on line 1" });
    const out = withCachedDiagrams(block("bad"));
    expect(out).toContain("md-mermaid-failed");
    expect(out).toContain("Parse error on line 1");
    expect(out).not.toContain("md-mermaid-pending");
  });

  it("keeps showing the previous error (marked pending) while an edited broken diagram renders", () => {
    rememberDiagram("bad", { error: "old error" });
    withCachedDiagrams(block("bad"));
    const out = withCachedDiagrams(block("bad!"));
    expect(out).toContain("md-mermaid-failed md-mermaid-pending");
    expect(out).toContain("old error");
  });

  it("falls back to the code block when there is nothing to show yet", () => {
    const html = block("graph TD\nA-->B");
    expect(withCachedDiagrams(html)).toContain("language-mermaid");
  });

  it("is stable: the same input gives the same output, so unchanged blocks are not touched", () => {
    rememberDiagram("graph TD\nA-->B", { svg: "<svg>cached</svg>" });
    const html = "<p>hi</p>\n" + block("graph TD\nA-->B");
    expect(withCachedDiagrams(html)).toBe(withCachedDiagrams(html));
  });

  it("leaves documents without diagrams untouched", () => {
    expect(withCachedDiagrams("<p>plain</p>")).toBe("<p>plain</p>");
  });
});

describe("hydrateDiagrams with stale diagrams", () => {
  beforeEach(() => resetDiagramState());
  const root = (html: string) => {
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.append(el);
    return el;
  };

  it("replaces a stale diagram with the fresh one in place", async () => {
    rememberDiagram("A", { svg: "<svg>old</svg>" });
    withCachedDiagrams(block("A"));
    const el = root(withCachedDiagrams(block("B")));
    expect(el.querySelector(".md-mermaid-stale")).not.toBeNull();
    await hydrateDiagrams(el, async () => ({ svg: "<svg>new</svg>" }));
    expect(el.querySelector(".md-mermaid-stale")).toBeNull();
    expect(el.querySelector(".md-mermaid svg")?.textContent).toBeDefined();
    expect(el.innerHTML).toContain("<svg>new</svg>");
    expect(el.innerHTML).not.toContain("old");
  });

  it("turns a stale diagram that fails into code plus the error", async () => {
    rememberDiagram("A", { svg: "<svg>old</svg>" });
    withCachedDiagrams(block("A"));
    const el = root(withCachedDiagrams(block("B &")));
    await hydrateDiagrams(el, fail);
    expect(el.querySelector(".md-mermaid-failed pre code")?.textContent).toBe("B &");
    expect(el.querySelector('.md-mermaid-error[role="alert"]')).not.toBeNull();
    expect(el.innerHTML).not.toContain("old");
  });

  it("turns a pending error into the fixed diagram when the source becomes valid", async () => {
    rememberDiagram("bad", { error: "old error" });
    withCachedDiagrams(block("bad"));
    const el = root(withCachedDiagrams(block("good")));
    expect(el.querySelector(".md-mermaid-pending")).not.toBeNull();
    await hydrateDiagrams(el, async () => ({ svg: "<svg>fixed</svg>" }));
    expect(el.querySelector(".md-mermaid-failed")).toBeNull();
    expect(el.innerHTML).toContain("<svg>fixed</svg>");
  });

  it("does not render a diagram that already failed again and again", async () => {
    const el = root(block("bad"));
    let calls = 0;
    const render = async () => (calls++, { error: "nope" });
    await hydrateDiagrams(el, render);
    await hydrateDiagrams(el, render);
    expect(calls).toBe(1);
  });
});
