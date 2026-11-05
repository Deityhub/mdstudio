import { beforeAll, describe, expect, it } from "vitest";
import { canonicalizeClasses, loadSystem, rewriteSource } from "./tailwind-classes";

let ds: Awaited<ReturnType<typeof loadSystem>>;
beforeAll(async () => {
  ds = await loadSystem();
});

describe("canonicalizeClasses", () => {
  it("merges width and height into size, keeping the other classes where they were", () => {
    expect(canonicalizeClasses(ds, "mr-2 h-4 w-4 shrink-0 text-primary")).toBe(
      "mr-2 size-4 shrink-0 text-primary",
    );
  });

  it("uses the current names and the short forms of variants", () => {
    expect(canonicalizeClasses(ds, "flex-shrink-0 data-[disabled]:opacity-50")).toBe(
      "shrink-0 data-disabled:opacity-50",
    );
    expect(canonicalizeClasses(ds, "break-words")).toBe("wrap-break-word");
  });

  it("leaves classes that are already recommended exactly as written", () => {
    const text = "relative flex  size-4  items-center text-primary";
    expect(canonicalizeClasses(ds, text)).toBe(text);
    expect(canonicalizeClasses(ds, "md-preview cm-content size-4")).toBe(
      "md-preview cm-content size-4",
    );
  });

  it("keeps custom class names, and leaves sentences and selectors alone", () => {
    expect(canonicalizeClasses(ds, "studio-open h-4 w-4")).toBe("studio-open size-4");
    expect(canonicalizeClasses(ds, "Open the h-4 w-4 draft")).toBe("Open the h-4 w-4 draft");
    expect(canonicalizeClasses(ds, "a > b h-4 w-4")).toBe("a > b h-4 w-4");
    expect(canonicalizeClasses(ds, "")).toBe("");
  });
});

describe("rewriteSource", () => {
  it("rewrites class strings in any kind of quotes and reports the line", () => {
    const source = [
      'const a = <svg className="h-4 w-4" />;',
      "const b = cn('flex-shrink-0', cond && `h-3 w-3`);",
      'const text = "Open the h-4 w-4 draft";',
    ].join("\n");
    const { output, changes } = rewriteSource(ds, source);
    expect(output).toBe(
      [
        'const a = <svg className="size-4" />;',
        "const b = cn('shrink-0', cond && `size-3`);",
        'const text = "Open the h-4 w-4 draft";',
      ].join("\n"),
    );
    expect(changes.map((c) => c.line)).toEqual([1, 2, 2]);
  });

  it("does nothing to source that is already fine", () => {
    const source = 'const a = <svg className="size-4 shrink-0" />;\n';
    expect(rewriteSource(ds, source)).toEqual({ output: source, changes: [] });
  });
});
