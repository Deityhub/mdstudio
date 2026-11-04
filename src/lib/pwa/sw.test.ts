// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

type Sw = {
  classify: (url: URL, method: string, mode: string, origin: string) => string;
  assetsIn: (html: string) => string[];
  fallbacks: (path: string) => string[];
};

/** Runs public/sw.js against a stub worker scope and returns its routing helpers. */
function load(): Sw {
  const self: Record<string, unknown> = {
    location: new URL("https://studio.test/sw.js?v=1.2.3"),
    addEventListener: () => {},
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), { self, URL, Response, caches: {} });
  return self["__swForTests"] as Sw;
}

const sw = load();
const ORIGIN = "https://studio.test";
const kind = (path: string, method = "GET", mode = "cors", base = ORIGIN) =>
  sw.classify(new URL(path, base), method, mode, ORIGIN);

describe("service worker routing", () => {
  it("serves pages network first, but not files or the API", () => {
    expect(kind("/editor/abc", "GET", "navigate")).toBe("navigate");
    expect(kind("/", "GET", "navigate")).toBe("navigate");
    expect(kind("/guides/markdown-images", "GET", "navigate")).toBe("navigate");
    expect(kind("/sitemap.xml", "GET", "navigate")).toBe("skip");
    expect(kind("/robots.txt", "GET", "navigate")).toBe("skip");
    expect(kind("/api/health", "GET", "navigate")).toBe("skip");
  });

  it("keeps built files cache first and fonts, icons and the manifest refreshing in the background", () => {
    expect(kind("/assets/index-AbC123.js")).toBe("immutable");
    expect(kind("/a/0123abcd0123abcd0123abcd0123abcd.webp")).toBe("immutable");
    expect(kind("/fonts/fraunces.woff2")).toBe("static");
    expect(kind("/katex/fonts/KaTeX_Main-Regular.woff2")).toBe("static");
    expect(kind("/icon-192.png")).toBe("static");
    expect(kind("/manifest.webmanifest")).toBe("static");
  });

  it("leaves other origins, other methods, server functions and the worker itself alone", () => {
    expect(kind("https://api.openai.com/v1/chat/completions", "GET", "cors")).toBe("skip");
    expect(kind("/assets/x.js", "POST")).toBe("skip");
    expect(kind("/_serverFn/abc")).toBe("skip");
    expect(kind("/sw.js")).toBe("skip");
    expect(kind("/some/data.json")).toBe("skip");
  });

  it("finds the scripts and styles a page links to", () => {
    const html =
      '<link rel="modulepreload" href="/assets/index-A1.js"><link rel="stylesheet" href="/assets/app-B2.css">' +
      '<script src="/assets/index-A1.js"></script><img src="/assets/logo.png">';
    expect(sw.assetsIn(html)).toEqual(["/assets/index-A1.js", "/assets/app-B2.css"]);
    expect(sw.assetsIn("<html></html>")).toEqual([]);
  });

  it("falls back to the editor for editor pages and to home for the rest", () => {
    expect(sw.fallbacks("/editor/xyz")).toEqual(["/editor", "/"]);
    expect(sw.fallbacks("/guides/a")).toEqual(["/", "/editor"]);
  });
});
