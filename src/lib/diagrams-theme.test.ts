import { beforeEach, describe, expect, it, vi } from "vitest";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(async () => true),
  render: vi.fn(async (_id: string, source: string) => ({ svg: `<svg><!--${source}--></svg>` })),
}));
vi.mock("mermaid", () => ({ default: mermaid }));

import {
  figureHtml,
  rememberDiagram,
  renderDiagram,
  renderDiagramFor,
  resetDiagramState,
  withCachedDiagrams,
} from "./diagrams";

const block = (code: string) => `<pre><code class="hljs language-mermaid">${code}</code></pre>`;
const lastTheme = () => mermaid.initialize.mock.calls.at(-1)?.[0]?.theme;

beforeEach(() => {
  resetDiagramState();
  vi.clearAllMocks();
});

describe("theme-aware rendering", () => {
  it("renders light diagrams with Mermaid's neutral theme and dark ones with its dark theme", async () => {
    await renderDiagramFor("light")("graph TD\nA-->B");
    expect(lastTheme()).toBe("neutral");
    await renderDiagramFor("dark")("graph TD\nA-->B");
    expect(lastTheme()).toBe("dark");
  });

  it("keeps a separate render per theme and reuses each", async () => {
    await renderDiagramFor("light")("graph TD\nA-->B");
    await renderDiagramFor("dark")("graph TD\nA-->B");
    expect(mermaid.render).toHaveBeenCalledTimes(2);
    // both are cached now, so asking again is synchronous and renders nothing
    expect(renderDiagramFor("light")("graph TD\nA-->B")).toHaveProperty("svg");
    expect(renderDiagramFor("dark")("graph TD\nA-->B")).toHaveProperty("svg");
    expect(mermaid.render).toHaveBeenCalledTimes(2);
  });

  it("exports always use the light render, whatever theme the page is in", async () => {
    await renderDiagram("graph TD\nA-->B");
    expect(lastTheme()).toBe("neutral");
  });
});

describe("withCachedDiagrams by theme", () => {
  const svg = { svg: "<svg><title>light</title></svg>" };

  it("serves a diagram only for the theme it was rendered in", () => {
    rememberDiagram("A-->B", svg, "light");
    const html = block("A--&gt;B");
    expect(withCachedDiagrams(html, "light")).toContain(figureHtml(svg.svg));
    // in dark the light render is not reused as-is: it is kept as a stale placeholder at most
    expect(withCachedDiagrams(html, "dark")).not.toContain(figureHtml(svg.svg));
  });

  it("defaults to the light theme", () => {
    rememberDiagram("A-->B", svg);
    expect(withCachedDiagrams(block("A--&gt;B"))).toContain(figureHtml(svg.svg));
  });
});
