import { describe, expect, it } from "vitest";

const sources = import.meta.glob("/src/components/**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The `<Button …>` opening tags of a file, read with braces and strings balanced. */
function buttons(source: string) {
  const found: string[] = [];
  for (const m of source.matchAll(/<Button\b/g)) {
    let i = m.index! + m[0].length;
    const start = i;
    let depth = 0;
    let quote: string | null = null;
    for (; i < source.length; i++) {
      const c = source[i]!;
      if (quote) {
        if (c === quote && source[i - 1] !== "\\") quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    found.push(source.slice(start, i));
  }
  return found;
}

describe("buttons that wait for something", () => {
  it("show it with the Button's own loading state, not a spinner of their own", () => {
    const own = Object.entries(sources)
      .filter(([file]) => !file.endsWith("/ui/button.tsx") && !file.endsWith(".test.tsx"))
      .filter(([, source]) => source.includes("animate-spin"))
      .map(([file]) => file);
    expect(own).toEqual([]);
  });

  it("do not stand in for a button that is working with `disabled` alone", () => {
    // the names a component gives the state of a request it started
    const inFlight =
      /disabled=\{[^}]*\b(busy|saving|sending|testing|refreshing|deleting|running)\b/;
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(sources)) {
      if (file.endsWith(".test.tsx")) continue;
      for (const props of buttons(source)) {
        // `loading` on the button that was pressed, or `pending` on the others while it works
        if (inFlight.test(props) && !/\b(loading|pending)=/.test(props))
          offenders.push(`${file}: ${props.replace(/\s+/g, " ").slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
