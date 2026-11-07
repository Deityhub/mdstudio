// What a public share page says about itself: its title and the description search engines show.
import { deriveTitle, splitFrontMatter } from "@/lib/markdown/markdown";

export const DEFAULT_SHARE_DESCRIPTION = "A Markdown document shared with mdstudio.";
const MAX_DESCRIPTION = 160;

export const shareTitle = (title: string, content: string) =>
  title.trim() || deriveTitle(content) || "Untitled";

/** Markdown reduced to the words a reader would see, on one line. */
const plain = (text: string) =>
  text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Starts with something other than prose: a heading, list, quote, table, image, html or rule. */
const NOT_PROSE = /^(#|>|\||[-*+]\s|\d+[.)]\s|!\[|<|---|===)/;

/**
 * The description for the page: the front matter's `description`, else the first paragraph of
 * prose, cut at a word to fit what search results show. Never markup.
 */
export function shareDescription(content: string): string {
  const { data, body } = splitFrontMatter(content);
  const given = data?.["description"];
  if (typeof given === "string" && plain(given)) return cut(plain(given));
  const paragraphs = body.replace(/```[\s\S]*?(```|$)/g, "").split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    const text = paragraph.trim();
    if (!text || NOT_PROSE.test(text)) continue;
    const words = plain(text);
    if (words) return cut(words);
  }
  return DEFAULT_SHARE_DESCRIPTION;
}

function cut(text: string) {
  if (text.length <= MAX_DESCRIPTION) return text;
  const head = text.slice(0, MAX_DESCRIPTION - 1);
  const atWord = head.slice(0, head.lastIndexOf(" ") > 0 ? head.lastIndexOf(" ") : head.length);
  return `${atWord.trimEnd()}…`;
}

/** A day in words, in UTC, so the server's page and the browser's agree. */
export const shareDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });
