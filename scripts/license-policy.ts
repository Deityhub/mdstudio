// Which dependency licenses may ship in Markdown Studio (MIT). Permissive licenses pass; anything
// else needs a named, reviewed exception below. Used by scripts/check-licenses.ts and CI.

export const ALLOWED = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
  "Zlib",
]);

/** Reviewed exceptions: package name (or `prefix*`) to why it is acceptable. */
export const EXCEPTIONS: Record<string, string> = {
  elkjs:
    "EPL-2.0, used unmodified by Mermaid; weak copyleft, attribution kept in THIRD_PARTY_NOTICES.md",
  khroma: "MIT licence file shipped, but package.json has no license field",
  "lightningcss*": "MPL-2.0, build-time CSS tooling only, never shipped to users",
  argparse: "Python-2.0 (PSF), permissive, transitive dev dependency",
  "caniuse-lite": "CC-BY-4.0 browser data, build-time only; attribution in THIRD_PARTY_NOTICES.md",
};

export const exceptionFor = (name: string): string | undefined => {
  if (EXCEPTIONS[name]) return EXCEPTIONS[name];
  const hit = Object.keys(EXCEPTIONS).find(
    (k) => k.endsWith("*") && name.startsWith(k.slice(0, -1)),
  );
  return hit ? EXCEPTIONS[hit] : undefined;
};

/** Evaluates an SPDX expression: `OR` needs one allowed side, `AND` needs all. */
export function isAllowed(expression: string): boolean {
  const expr = expression.replace(/[()]/g, " ").trim();
  if (!expr) return false;
  return expr
    .split(/\s+OR\s+/i)
    .some((alt) => alt.split(/\s+AND\s+/i).every((id) => ALLOWED.has(id.trim())));
}

export type Verdict = { ok: true; note?: string } | { ok: false; reason: string };

export function verdict(name: string, license: string | undefined): Verdict {
  const exception = exceptionFor(name);
  if (exception) return { ok: true, note: exception };
  if (!license) return { ok: false, reason: "no license declared" };
  return isAllowed(license) ? { ok: true } : { ok: false, reason: `${license} is not allowed` };
}
