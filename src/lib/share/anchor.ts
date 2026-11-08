// Where a comment shows on the published page. A comment names the block it was written on by its
// source line and the start of its text. If the copy has not changed since, the line is enough; after
// an update the text lets it be found again, and a comment whose block is gone is listed apart.
import type { ShareComment } from "./protocol";

const SNIPPET = 120;

/** The words of a block on one line, cut to what a comment's snippet keeps. */
export const blockText = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, SNIPPET);

export type Thread = { comment: ShareComment; replies: ShareComment[] };
export type Block = { line: number; text: string };

/** Threads placed on the blocks they belong to (by the block's first line), and the ones with no block. */
export function placeComments(comments: ShareComment[], blocks: Block[]) {
  const byTime = (a: ShareComment, b: ShareComment) => a.createdAt - b.createdAt;
  const ids = new Set(comments.map((c) => c.id));
  const tops = comments.filter((c) => c.parentId === null).sort(byTime);
  const orphans = comments.filter((c) => c.parentId !== null && !ids.has(c.parentId));
  const threadOf = (comment: ShareComment): Thread => ({
    comment,
    replies: comments.filter((r) => r.parentId === comment.id).sort(byTime),
  });

  const byLine = new Map<number, Thread[]>();
  const loose: Thread[] = [];
  for (const comment of tops) {
    let line: number | undefined;
    if (comment.outdated) {
      const same = comment.snippet ? blocks.filter((b) => b.text.startsWith(comment.snippet)) : [];
      line = (same.find((b) => b.line === comment.line) ?? same[0])?.line;
    } else if (blocks.some((b) => b.line === comment.line)) line = comment.line;
    if (line === undefined) loose.push(threadOf(comment));
    else byLine.set(line, [...(byLine.get(line) ?? []), threadOf(comment)]);
  }
  // a reply whose comment is missing stands alone
  for (const comment of orphans) loose.push({ comment, replies: [] });
  return { byLine, loose };
}
