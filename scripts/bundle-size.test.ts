// @vitest-environment node
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkBundle, measureBundle } from "./bundle-size";

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bundle-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const write = (path: string, content: string) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), content);
};

describe("measureBundle", () => {
  it("sums the modules, compresses them and ranks the largest first", () => {
    write("index.mjs", "a".repeat(1000));
    write("_libs/react.mjs", "b".repeat(5000));
    write("notes.txt", "ignored");
    const report = measureBundle(dir);
    expect(report.files.map((f) => f.path)).toEqual(["_libs/react.mjs", "index.mjs"]);
    expect(report.rawBytes).toBe(6000);
    expect(report.gzipBytes).toBeLessThan(report.rawBytes); // repetitive text compresses well
    expect(report.gzipBytes).toBeGreaterThan(0);
  });
});

describe("checkBundle", () => {
  const limits = { maxGzipBytes: 1000, forbidden: ["mermaid", "katex"] };

  it("passes a small bundle that avoids the forbidden libraries", () => {
    write("index.mjs", "x");
    expect(checkBundle(measureBundle(dir), limits)).toEqual([]);
  });

  it("fails a bundle over the size budget", () => {
    // random bytes do not compress, so this is well over the 1000 byte limit
    write("index.mjs", randomBytes(4000).toString("hex"));
    expect(checkBundle(measureBundle(dir), limits).join("\n")).toMatch(/over the budget/);
  });

  it("fails when a client-only library leaks into the Worker", () => {
    write("_libs/mermaid+[...].mjs", "x");
    write("_libs/katex.mjs", "x");
    const problems = checkBundle(measureBundle(dir), limits).join("\n");
    expect(problems).toContain("mermaid");
    expect(problems).toContain("katex");
  });
});
