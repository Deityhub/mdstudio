// The parts of comments and suggestions that need no Yjs: their shape, limits and rules. Kept apart
// from threads.ts so the studio can use them without downloading Yjs (that loads only when a draft
// is being edited together).
export const MAX_THREADS = 100;
export const MAX_REPLIES = 500;
export const MAX_BODY = 2000;
export const MAX_SELECTION = 1000;
/** The origin of the edit an accepted suggestion makes, so the accepter's own Undo can take it back. */
export const ACCEPT_ORIGIN = "thread-accept";

export type Author = { id: string; name: string };
export type ThreadStatus = "open" | "resolved" | "accepted" | "rejected";
export type Reply = {
  id: string;
  threadId: string;
  author: Author;
  createdAt: number;
  body: string;
};
export type Thread = {
  id: string;
  kind: "comment" | "suggestion";
  author: Author;
  createdAt: number;
  body: string;
  /** What a suggestion would put in place of the words. */
  proposed: string | null;
  status: ThreadStatus;
  /** Where the words are now. */
  from: number;
  to: number;
  /** The words when the thread was made, and as they are now. */
  original: string;
  text: string;
  /** The words were edited since: a suggestion on them can no longer be applied as it was meant. */
  changed: boolean;
  /** The words were deleted. */
  gone: boolean;
  replies: Reply[];
};

/** The author may delete theirs; the draft's owner may delete anyone's. */
export const canDelete = (item: { author: { id: string } }, userId: string, isOwner: boolean) =>
  isOwner || item.author.id === userId;

/**
 * The open threads as Markdown, for the draft's History when live editing stops (the threads live in
 * the room and go with it). Closed ones are left out. Empty when there is nothing to carry over.
 */
export function exportThreads(all: Thread[]): string {
  const open = all.filter((t) => t.status === "open");
  if (!open.length) return "";
  const quote = (s: string) => s.replace(/\s+/g, " ").trim();
  const lines = open.flatMap((t) => {
    const words = `“${quote(t.gone ? t.original : t.text || t.original)}”${t.gone ? " (since deleted)" : ""}`;
    const head =
      t.kind === "suggestion"
        ? `- ${t.author.name} suggested “${quote(t.proposed ?? "")}” for ${words}${t.body ? `: ${quote(t.body)}` : ""}`
        : `- On ${words}\n  - ${t.author.name}: ${quote(t.body)}`;
    return [head, ...t.replies.map((r) => `  - ${r.author.name}: ${quote(r.body)}`)];
  });
  return `\n\n---\n\n## Comments and suggestions\n\nLeft while editing together, still open.\n\n${lines.join("\n")}\n`;
}
