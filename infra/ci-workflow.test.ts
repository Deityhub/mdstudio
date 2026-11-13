// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const installed = JSON.parse(readFileSync("node_modules/@playwright/test/package.json", "utf8"))
  .version as string;

describe("the end-to-end job in CI", () => {
  it("runs in the Playwright image of the version this repo uses", () => {
    // The browsers in the image are built for one Playwright version; a different library finds none.
    expect(ci.match(/image: mcr\.microsoft\.com\/playwright:v([\d.]+)-/)?.[1]).toBe(installed);
  });

  it("pins the same Node in every job that runs it", () => {
    expect([...ci.matchAll(/node-version: (\d+)/g)].map((m) => m[1])).toEqual(["26", "26"]);
  });

  it("tests on the Node that the self-hosted image runs", () => {
    const docker = readFileSync("infra/Dockerfile", "utf8");
    expect(docker.match(/FROM node:(\d+)-alpine AS runtime/)?.[1]).toBe(
      ci.match(/node-version: (\d+)/)?.[1],
    );
  });

  it("installs without install scripts: better-sqlite3 ships its binaries, and has no compiler to use", () => {
    expect(ci).not.toContain("build-essential");
    const installs = ci.match(/run: bun install .*/g) ?? [];
    expect(installs).toHaveLength(2);
    for (const line of installs) expect(line).toContain("--ignore-scripts");
  });

  it("is cut off if it hangs, instead of running for hours", () => {
    expect(ci).toMatch(/End-to-end \(Playwright\)\s+runs-on: ubuntu-latest\s+timeout-minutes: \d+/);
  });

  it("no longer downloads the browser and its system packages on every run", () => {
    expect(ci).not.toContain("playwright install");
  });
});
