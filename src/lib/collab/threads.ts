// Comments and suggestions on the words of a live draft. They live in the same shared document as
// the text (two maps beside it), so they reach everyone as they are made, work offline and merge like
// text. Each is tied to its words by two Yjs relative positions, which move with the text as people
// type: a comment on a sentence stays on that sentence. No server code reads them (the Worker has no
// Yjs); they are stored with the room. The people in a draft can already change all of its text, so
// the author of a thread is the name this browser says, not something the server vouches for.
import * as Y from "yjs";
import {
  ACCEPT_ORIGIN,
  type Author,
  MAX_BODY,
  MAX_REPLIES,
  MAX_SELECTION,
  MAX_THREADS,
  type Reply,
  type Thread,
  type ThreadStatus,
} from "./thread-rules";

export { ACCEPT_ORIGIN, MAX_BODY, MAX_REPLIES, MAX_SELECTION, MAX_THREADS };
export type { Author, Reply, Thread, ThreadStatus };

export const THREADS_KEY = "threads";
export const REPLIES_KEY = "replies";
type AddInput = {
  kind: "comment" | "suggestion";
  from: number;
  to: number;
  body: string;
  proposed?: string;
};
type Failure<E extends string> = { ok: false; error: E };

const newId = () => crypto.randomUUID().slice(0, 12);

export function createThreads(doc: Y.Doc, ytext: Y.Text, me: Author) {
  const threads = doc.getMap<Y.Map<unknown>>(THREADS_KEY);
  const replies = doc.getMap<Y.Map<unknown>>(REPLIES_KEY);

  const rel = (index: number, assoc: number) =>
    Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(ytext, index, assoc));
  const abs = (json: unknown): number | null => {
    if (!json) return null;
    const p = Y.createAbsolutePositionFromRelativePosition(
      Y.createRelativePositionFromJSON(json),
      doc,
    );
    return p && p.type === ytext ? p.index : null;
  };

  function read(map: Y.Map<unknown>): Thread | null {
    const id = map.get("id");
    const start = abs(map.get("start"));
    const end = abs(map.get("end"));
    if (typeof id !== "string") return null;
    const original = String(map.get("original") ?? "");
    const from = start ?? 0;
    // the end sticks to the last word's last character, so it is one past that
    const to = end === null ? from : Math.max(from, end);
    const gone = original.length > 0 && (start === null || end === null || to <= from);
    const text = gone ? "" : ytext.toString().slice(from, to);
    return {
      id,
      kind: map.get("kind") === "suggestion" ? "suggestion" : "comment",
      author: (map.get("author") as Author) ?? { id: "", name: "Someone" },
      createdAt: Number(map.get("createdAt") ?? 0),
      body: String(map.get("body") ?? ""),
      proposed: typeof map.get("proposed") === "string" ? (map.get("proposed") as string) : null,
      status: (map.get("status") as ThreadStatus) ?? "open",
      from,
      to,
      original,
      text,
      changed: !gone && text !== original,
      gone,
      replies: [],
    };
  }

  const list = (): Thread[] => {
    const all = [...threads.values()].flatMap((m) => {
      const t = read(m);
      return t ? [t] : [];
    });
    const byThread = new Map<string, Reply[]>();
    for (const m of replies.values()) {
      const r: Reply = {
        id: String(m.get("id")),
        threadId: String(m.get("threadId")),
        author: (m.get("author") as Author) ?? { id: "", name: "Someone" },
        createdAt: Number(m.get("createdAt") ?? 0),
        body: String(m.get("body") ?? ""),
      };
      byThread.set(r.threadId, [...(byThread.get(r.threadId) ?? []), r]);
    }
    for (const t of all)
      t.replies = (byThread.get(t.id) ?? []).sort((a, b) => a.createdAt - b.createdAt);
    const rank = (t: Thread) => (t.status === "open" ? 0 : 1);
    return all.sort((a, b) =>
      rank(a) !== rank(b)
        ? rank(a) - rank(b)
        : rank(a) === 0
          ? a.from - b.from || a.createdAt - b.createdAt
          : a.createdAt - b.createdAt,
    );
  };

  function add(
    input: AddInput,
  ): { ok: true; id: string } | Failure<"empty" | "too_long" | "no_selection" | "full"> {
    const body = input.body.trim();
    const proposed = input.proposed;
    if (input.kind === "comment" && !body) return { ok: false, error: "empty" };
    if (body.length > MAX_BODY || (proposed?.length ?? 0) > MAX_BODY)
      return { ok: false, error: "too_long" };
    const length = input.to - input.from;
    if (length <= 0 || length > MAX_SELECTION) return { ok: false, error: "no_selection" };
    if (threads.size >= MAX_THREADS) return { ok: false, error: "full" };
    const id = newId();
    const map = new Y.Map<unknown>();
    doc.transact(() => {
      threads.set(id, map);
      map.set("id", id);
      map.set("kind", input.kind);
      map.set("author", me);
      map.set("createdAt", Date.now());
      map.set("body", body);
      if (input.kind === "suggestion") map.set("proposed", proposed ?? "");
      map.set("status", "open");
      // the start stays with the first word, the end with the last, so typing next to them is not in them
      map.set("start", rel(input.from, 0));
      map.set("end", rel(input.to, -1));
      map.set("original", ytext.toString().slice(input.from, input.to));
    });
    return { ok: true, id };
  }

  function reply(
    threadId: string,
    text: string,
  ): { ok: true; id: string } | Failure<"empty" | "too_long" | "full" | "not_found"> {
    const body = text.trim();
    if (!body) return { ok: false, error: "empty" };
    if (body.length > MAX_BODY) return { ok: false, error: "too_long" };
    if (!threads.has(threadId)) return { ok: false, error: "not_found" };
    if (replies.size >= MAX_REPLIES) return { ok: false, error: "full" };
    const id = newId();
    const map = new Y.Map<unknown>();
    doc.transact(() => {
      replies.set(id, map);
      map.set("id", id);
      map.set("threadId", threadId);
      map.set("author", me);
      map.set("createdAt", Date.now());
      map.set("body", body);
    });
    return { ok: true, id };
  }

  const setStatus = (id: string, status: ThreadStatus) =>
    void threads.get(id)?.set("status", status);

  function remove(id: string) {
    doc.transact(() => {
      threads.delete(id);
      for (const [rid, m] of replies) if (m.get("threadId") === id) replies.delete(rid);
    });
  }
  const removeReply = (id: string) => void replies.delete(id);

  /** Puts a suggestion's words in place of the words it is about, as an edit by this person. */
  function accept(id: string): { ok: true } | Failure<"not_found" | "closed" | "gone" | "changed"> {
    const map = threads.get(id);
    const t = map && read(map);
    if (!map || !t) return { ok: false, error: "not_found" };
    if (t.status !== "open" || t.kind !== "suggestion") return { ok: false, error: "closed" };
    if (t.gone) return { ok: false, error: "gone" };
    if (t.changed) return { ok: false, error: "changed" };
    doc.transact(() => {
      ytext.delete(t.from, t.to - t.from);
      if (t.proposed) ytext.insert(t.from, t.proposed);
      map.set("status", "accepted");
    }, ACCEPT_ORIGIN);
    return { ok: true };
  }

  /** Calls back after any change to the threads, and to the text they are anchored in. */
  function observe(fn: () => void) {
    threads.observeDeep(fn);
    replies.observeDeep(fn);
    ytext.observe(fn);
    return () => {
      threads.unobserveDeep(fn);
      replies.unobserveDeep(fn);
      ytext.unobserve(fn);
    };
  }

  return { list, add, reply, setStatus, remove, removeReply, accept, observe, me };
}
export type Threads = ReturnType<typeof createThreads>;
