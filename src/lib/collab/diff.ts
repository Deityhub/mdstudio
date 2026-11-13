// The smallest edit that turns one text into another. Used wherever the editor is handed a whole new
// text (restoring a version, the front matter form, an AI edit) while other people are typing: it
// becomes an ordinary edit of what changed, so their concurrent edits around it are kept, where
// "delete everything, insert everything" would erase them.

export type Change = { from: number; to: number; insert: string };

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** What to replace in `a` to get `b`, or null when they are the same. Never cuts a character in two. */
export function minimalChange(a: string, b: string): Change | null {
  if (a === b) return null;
  const max = Math.min(a.length, b.length);
  let start = 0;
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  // a pair of UTF-16 units is one character: do not start the change between its halves
  if (start > 0 && isHigh(a.charCodeAt(start - 1))) start--;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--;
    endB--;
  }
  if (endA < a.length && isLow(a.charCodeAt(endA)) && isHigh(a.charCodeAt(endA - 1))) {
    endA++;
    endB++;
  }
  return { from: start, to: endA, insert: b.slice(start, endB) };
}
