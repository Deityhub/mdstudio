import { getOutline, getStats, splitFrontMatter, type Issue } from "../markdown/markdown";
import type { Standards } from "./config";

/** The line of a front matter key, or the first line when it is not there. */
function keyLine(md: string, key: string): number {
  const lines = md.split(/\r?\n/);
  if (lines[0] !== "---") return 1;
  const end = lines.indexOf("---", 1);
  const at = lines.slice(1, end < 0 ? undefined : end).findIndex((l) => l.startsWith(`${key}:`));
  return at < 0 ? 1 : at + 2;
}

const tagsOf = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
    .map((t) => String(t).trim())
    .filter(Boolean);

const filled = (v: unknown) =>
  !(
    v === undefined ||
    v === null ||
    (typeof v === "string" && !v.trim()) ||
    (Array.isArray(v) && !v.length)
  );

/** Publication standards the writer has turned on: lengths, required fields, heading structure. */
export function runStandards(md: string, standards: Standards): Issue[] {
  const out: Issue[] = [];
  const { data } = splitFrontMatter(md);
  const add = (id: keyof Standards, line: number, message: string) =>
    out.push({ line, rule: id, message, severity: standards[id].severity, group: "standard" });
  const rangeCheck = (
    id: "title-length" | "description-length",
    label: string,
    text: string,
    line: number,
  ) => {
    const s = standards[id];
    if (!s.enabled) return;
    const n = [...text.trim()].length;
    if (s.max !== undefined && n > s.max)
      add(id, line, `${label} is ${n} characters; the limit is ${s.max}.`);
    else if (s.min !== undefined && n < s.min)
      add(id, line, `${label} is ${n} characters; it should be at least ${s.min}.`);
  };

  const fmTitle = typeof data?.["title"] === "string" ? data["title"] : "";
  const h1 = getOutline(md).find((h) => h.depth === 1);
  if (fmTitle) rangeCheck("title-length", "The title", fmTitle, keyLine(md, "title"));
  else if (h1) rangeCheck("title-length", "The title", h1.text, h1.line);

  const description = data?.["description"];
  if (typeof description === "string" && description.trim())
    rangeCheck("description-length", "The description", description, keyLine(md, "description"));

  if (standards["required-fields"].enabled)
    for (const field of standards["required-fields"].fields)
      if (!filled(data?.[field])) add("required-fields", 1, `Front matter is missing "${field}".`);

  const hs = standards["heading-structure"];
  if (hs.enabled) {
    let firstH1 = false;
    let prev = 0;
    for (const h of getOutline(md)) {
      if (hs.singleH1 && h.depth === 1) {
        if (firstH1)
          add("heading-structure", h.line, "There is more than one top-level (#) heading.");
        firstH1 = true;
      }
      if (hs.noSkips && prev && h.depth > prev + 1)
        add("heading-structure", h.line, `Heading level jumps from ${prev} to ${h.depth}.`);
      prev = h.depth;
    }
  }

  const wc = standards["word-count"];
  if (wc.enabled) {
    const { words } = getStats(md);
    if (wc.max !== undefined && words > wc.max)
      add("word-count", 1, `${words} words; the limit is ${wc.max}.`);
    else if (wc.min !== undefined && words < wc.min)
      add("word-count", 1, `${words} words; it should be at least ${wc.min}.`);
  }

  const tc = standards["tag-count"];
  if (tc.enabled) {
    const n = tagsOf(data?.["tags"]).length;
    if (n > tc.max) add("tag-count", keyLine(md, "tags"), `${n} tags; the limit is ${tc.max}.`);
  }
  return out;
}
