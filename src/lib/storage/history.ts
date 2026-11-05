import { indexedDbStore, type KeyValueStore } from "./documentStore";

export type Revision = {
  id: string;
  docId: string;
  at: number;
  title: string;
  content: string;
  /** `auto` from the periodic snapshot, `manual` when the writer saved it, `restore` before a
   * restore, `replaced` when a newer edit made on another device took this text's place, and
   * `cloud` for a version the server kept (never stored locally). */
  kind: "auto" | "manual" | "restore" | "replaced" | "cloud";
};

/** Minimum time between automatic snapshots of one draft. */
export const SNAPSHOT_INTERVAL_MS = 5 * 60_000;
/** Versions kept per draft; automatic ones are dropped first. */
export const MAX_REVISIONS = 50;

const PREFIX = "rev:";
const keyOf = (docId: string, at: number, id: string) =>
  `${PREFIX}${docId}:${String(at).padStart(15, "0")}:${id}`;

type Source = { id: string; title: string; content: string };

/** Local version history on the same key-value backend as the drafts (IndexedDB in the browser). */
export function createHistoryStore(kv: KeyValueStore) {
  // newest revision per draft, so an autosave doesn't have to read the whole history every time
  const newest = new Map<string, Revision | null>();

  const list = async (docId: string): Promise<Revision[]> =>
    (await kv.values<Revision>(`${PREFIX}${docId}:`))
      .filter((r) => !!r)
      .sort((a, b) => b.at - a.at);

  const latest = async (docId: string) => {
    if (!newest.has(docId)) newest.set(docId, (await list(docId))[0] ?? null);
    return newest.get(docId) ?? null;
  };

  const prune = async (docId: string) => {
    const all = await list(docId);
    let extra = all.length - MAX_REVISIONS;
    if (extra <= 0) return;
    // oldest first, saved-by-hand versions last
    const order = [...all]
      .reverse()
      .sort((a, b) => Number(a.kind !== "auto") - Number(b.kind !== "auto"));
    for (const r of order) {
      if (extra-- <= 0) break;
      await kv.del(keyOf(r.docId, r.at, r.id));
    }
  };

  const add = async (doc: Source, at: number, kind: Revision["kind"]): Promise<Revision> => {
    const rev: Revision = {
      id: crypto.randomUUID().slice(0, 8),
      docId: doc.id,
      at,
      title: doc.title,
      content: doc.content,
      kind,
    };
    await kv.set(keyOf(rev.docId, rev.at, rev.id), rev);
    newest.set(doc.id, rev);
    await prune(doc.id);
    return rev;
  };

  return {
    list,
    /** The periodic snapshot: skipped inside the interval, for an unchanged text, or for an empty draft. */
    async maybeSnapshot(doc: Source, now: number): Promise<Revision | null> {
      const last = await latest(doc.id);
      if (!last && !doc.content.trim()) return null;
      if (last && (last.content === doc.content || now - last.at < SNAPSHOT_INTERVAL_MS))
        return null;
      return add(doc, now, "auto");
    },
    /** A version on demand; null when it would repeat the newest one. */
    async save(
      doc: Source,
      now: number,
      kind: "manual" | "restore" | "replaced",
    ): Promise<Revision | null> {
      const last = await latest(doc.id);
      if (last?.content === doc.content) return null;
      return add(doc, now, kind);
    },
    async remove(rev: Revision) {
      await kv.del(keyOf(rev.docId, rev.at, rev.id));
      newest.delete(rev.docId);
    },
    async clear(docId: string) {
      for (const r of await list(docId)) await kv.del(keyOf(r.docId, r.at, r.id));
      newest.delete(docId);
    },
  };
}

export const historyStore = createHistoryStore(indexedDbStore);
