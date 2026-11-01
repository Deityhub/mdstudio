import { describe, expect, it } from "vitest";
import { nextVersion, parseCommit, prependChangelog, renderSection } from "./release";

describe("nextVersion", () => {
  it("bumps patch, minor and major", () => {
    expect(nextVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(nextVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(nextVersion("1.2.3", "major")).toBe("2.0.0");
  });
  it("starts the first release from 0.0.0", () =>
    expect(nextVersion("0.0.0", "minor")).toBe("0.1.0"));
  it("rejects bad input", () => {
    expect(() => nextVersion("1.2", "patch")).toThrow();
    expect(() => nextVersion("1.2.3", "huge" as never)).toThrow();
  });
});

describe("parseCommit", () => {
  it("reads type, scope, breaking marker and subject", () => {
    expect(parseCommit("feat(editor): add tables")).toEqual({
      type: "feat",
      scope: "editor",
      breaking: false,
      subject: "add tables",
    });
    expect(parseCommit("fix!: drop old store")).toMatchObject({ type: "fix", breaking: true });
  });
  it("treats a BREAKING CHANGE footer as breaking", () =>
    expect(parseCommit("feat: x", "BREAKING CHANGE: y")).toMatchObject({ breaking: true }));
  it("ignores non-conventional subjects", () => expect(parseCommit("Update stuff")).toBeNull());
});

describe("renderSection", () => {
  const commits = [
    "feat: add tables",
    "fix(preview): stop flashing",
    "docs: tweak readme",
    "chore: bump deps",
    "feat!: new store",
    "Merge branch x",
  ].map((s) => ({ subject: s, body: "" }));

  it("groups user-facing changes and hides housekeeping", () => {
    const out = renderSection("0.2.0", "2026-11-01", commits);
    expect(out).toContain("## 0.2.0 (2026-11-01)");
    expect(out).toContain("### Breaking changes\n\n- new store");
    expect(out).toContain("### Features\n\n- add tables");
    expect(out).toContain("### Fixes\n\n- **preview:** stop flashing");
    expect(out).not.toMatch(/readme|bump deps|Merge/);
  });
  it("says so when nothing user-facing changed", () =>
    expect(renderSection("0.0.2", "2026-11-01", [{ subject: "chore: x", body: "" }])).toContain(
      "Maintenance and internal changes only.",
    ));
});

describe("prependChangelog", () => {
  it("creates the file with a header", () =>
    expect(prependChangelog("", "## 1.0.0\n")).toBe("# Changelog\n\n## 1.0.0\n"));
  it("puts the newest section first, below the header", () =>
    expect(prependChangelog("# Changelog\n\n## 1.0.0\n\n- a\n", "## 1.1.0\n\n- b\n")).toBe(
      "# Changelog\n\n## 1.1.0\n\n- b\n\n## 1.0.0\n\n- a\n",
    ));
});
