import { fencedBlocks } from "../editor/blocks";
import type { Issue } from "../markdown/markdown";
import { PROFILES, type Profile } from "../markdown/profiles";

/**
 * Checks where a rewrite of the text itself is the fix. The others need a decision from the writer
 * (a local image, a link to a file, a diagram) or are already fixed by an export option.
 */
const FIXABLE = new Set([
  "raw-html",
  "unclosed-html",
  "math",
  "alert",
  "highlight",
  "wiki-link",
  "container",
  "gfm-table",
  "gfm-task",
  "gfm-strike",
  "gfm-footnote",
  "missing-alt",
]);

/** The writer's own rules and the publication standards are described by their message, so any can be tried. */
export const canFix = (issue: Issue) => !!issue.group || FIXABLE.has(issue.rule);

/** A block longer than this is cut to a window around the issue, so one request stays small. */
const WINDOW = 20;

/**
 * The part of the document to send for one issue: the front matter, the code block, or the
 * paragraph the issue's line is in, with where it sits so the answer can replace it. Null when the
 * line does not exist or is blank.
 */
export function fixTarget(
  md: string,
  issue: Issue,
): { text: string; from: number; to: number } | null {
  const lines = md.split("\n");
  const at = issue.line - 1;
  if (at < 0 || at >= lines.length) return null;
  const starts: number[] = [];
  let pos = 0;
  for (const l of lines) {
    starts.push(pos);
    pos += l.length + 1;
  }
  const lineOf = (offset: number) => {
    let i = starts.length - 1;
    while (i > 0 && starts[i]! > offset) i--;
    return i;
  };

  let first = at;
  let last = at;
  const close = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  const fence = fencedBlocks(md).find((f) => starts[at]! >= f.openFrom && starts[at]! <= f.end);
  if (close > 0 && at <= close) {
    first = 0;
    last = close;
  } else if (fence) {
    first = lineOf(fence.openFrom);
    last = lineOf(fence.end);
  } else {
    if (!lines[at]!.trim()) return null;
    while (first > 0 && lines[first - 1]!.trim()) first--;
    while (last < lines.length - 1 && lines[last + 1]!.trim()) last++;
    if (last - first + 1 > 2 * WINDOW + 1) {
      first = Math.max(first, at - WINDOW);
      last = Math.min(last, at + WINDOW);
    }
  }
  const text = lines.slice(first, last + 1).join("\n");
  return { text, from: starts[first]!, to: starts[first]! + text.length };
}

const HINTS: Record<string, string> = {
  "missing-alt":
    " Write concise alt text (under 125 characters) for each image that has none, using only its file name, its address and the words around it. Do not describe what you cannot know. Leave images that already have alt text as they are.",
  "raw-html":
    " Replace the HTML with the equivalent Markdown. Where there is none, keep only its text.",
  "unclosed-html": " Close the tag, or replace the HTML with Markdown.",
  math: " Rewrite the formula in plain text or Unicode.",
  alert: " Rewrite the alert as an ordinary blockquote that starts with its label in bold.",
  highlight: " Replace the highlight with bold.",
  "wiki-link":
    " Rewrite each wiki link as an ordinary Markdown link to a relative page named in lower case with dashes and ending in .md.",
};

/** What to ask the AI for one issue. The text itself is sent separately, as data. */
export function fixInstruction(issue: Issue, profile: Profile): string {
  const label = PROFILES.find((p) => p.id === profile)?.label ?? profile;
  return (
    `Fix this problem so the text works on ${label}: ${issue.message} ` +
    "Change as little as possible: keep the meaning, the wording and every other part exactly as it is, and do not add new content." +
    (HINTS[issue.rule] ?? "")
  );
}
