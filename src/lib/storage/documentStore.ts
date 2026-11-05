import { deriveTitle } from "../markdown/markdown";

export type MdDocument = {
  id: string;
  title: string;
  /** Library label set by renaming; the document text is untouched. Blank or absent: derive it. */
  name?: string;
  /** Library folder (one level, a label only); absent when the draft is not filed. */
  folder?: string | undefined;
  content: string;
  /** Local images keyed by file name, stored as data URIs. */
  images: Record<string, string>;
  createdAt: number;
  updatedAt: number;
};

/** Minimal key-value backend. IndexedDB in the browser, a Map in tests. */
export type KeyValueStore = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  /** Every value whose key starts with `prefix`. */
  values<T>(prefix: string): Promise<T[]>;
};

const DB_NAME = "mdstudio-db";
const STORE = "mdstudio-store";

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is not available"));
    const req = indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function db(): Promise<IDBDatabase> {
  dbPromise ??= openDb().then(
    (d) => {
      // Another tab upgrading or the browser evicting the connection: reopen on next use.
      const reset = () => {
        dbPromise = undefined;
      };
      d.onversionchange = () => {
        d.close();
        reset();
      };
      d.onclose = reset;
      return d;
    },
    (e) => {
      dbPromise = undefined;
      throw e;
    },
  );
  return dbPromise;
}

/** Resolves on transaction completion, not request success, so a write is durable once awaited. */
async function run<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const d = await db();
  return new Promise<T>((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? req.error);
  });
}

export const indexedDbStore: KeyValueStore = {
  get: <T>(key: string) => run<T | undefined>("readonly", (s) => s.get(key)),
  set: async (key, value) => {
    await run("readwrite", (s) => s.put(value, key));
  },
  del: async (key) => {
    await run("readwrite", (s) => s.delete(key));
  },
  values: <T>(prefix: string) =>
    run<T[]>("readonly", (s) => s.getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"))),
};

const PREFIX = "doc:";
/** Set once a draft has been saved here, so the example is only ever for a first visit. */
const HAD_DRAFT_KEY = "meta:had-draft";

/** What the library and header show: the user's name for the draft, else what the text says. */
export const docTitle = (d: { name?: string | undefined; content: string }) =>
  d.name?.trim() || deriveTitle(d.content);

const FOLDERS_KEY = "meta:folders";
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

export function createDocumentStore(kv: KeyValueStore) {
  const listeners = new Set<() => void>();
  let hadDraftKnown = false;
  const notify = (quiet?: boolean) => {
    if (!quiet) for (const l of listeners) l();
  };
  const store = {
    /** Called after every draft is saved or removed, so sync can follow. Returns an unsubscribe. */
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Library folder names, kept so a folder can exist before it holds a draft. */
    folders: {
      async list(): Promise<string[]> {
        return [...((await kv.get<string[]>(FOLDERS_KEY)) ?? [])].sort(byName);
      },
      async add(name: string) {
        const all = await store.folders.list();
        if (all.some((f) => byName(f, name) === 0)) return;
        await kv.set(FOLDERS_KEY, [...all, name].sort(byName));
      },
      async remove(name: string) {
        const all = await store.folders.list();
        await kv.set(
          FOLDERS_KEY,
          all.filter((f) => byName(f, name) !== 0),
        );
      },
    },
    /** Gives a folder a new name everywhere: in the folder list and on every draft in it. */
    async renameFolder(from: string, to: string) {
      for (const d of await store.list())
        if (d.folder && byName(d.folder, from) === 0) await store.save({ ...d, folder: to });
      await store.folders.remove(from);
      await store.folders.add(to);
    },
    async list(): Promise<MdDocument[]> {
      const docs = (await kv.values<MdDocument>(PREFIX)).filter((d) => !!d);
      return docs.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    /** True once any draft has been saved on this machine, even if it was deleted since. */
    async hadDraft() {
      return hadDraftKnown || (await kv.get<boolean>(HAD_DRAFT_KEY)) === true;
    },
    get: (id: string) => kv.get<MdDocument>(PREFIX + id),
    /** `quiet` is for sync's own writes, which must not trigger another sync. */
    async save(doc: MdDocument, opts: { quiet?: boolean } = {}) {
      await kv.set(PREFIX + doc.id, doc);
      if (!hadDraftKnown) {
        await kv.set(HAD_DRAFT_KEY, true);
        hadDraftKnown = true;
      }
      notify(opts.quiet);
      return doc;
    },
    async remove(id: string, opts: { quiet?: boolean } = {}) {
      await kv.del(PREFIX + id);
      notify(opts.quiet);
    },
    async create(partial: Partial<MdDocument> = {}): Promise<MdDocument> {
      const now = Date.now();
      return store.save({
        id: crypto.randomUUID().slice(0, 8),
        title: "Untitled",
        content: "",
        images: {},
        createdAt: now,
        updatedAt: now,
        ...partial,
      });
    },
  };
  return store;
}

export const documentStore = createDocumentStore(indexedDbStore);

export const SAMPLE = `---
title: Writing portable Markdown
tags:
  - markdown
  - writing
description: A quick tour of what renders the same everywhere.
---

# Writing portable Markdown

What you see here is **exactly** what GitHub, dev.to, Hashnode and most static site generators render.
A single line break like this one does *not* create a new line. That's standard CommonMark.

Need a hard break? End the line with a backslash\\
and the next line starts here.

## Lists

- Bullets use a dash
- Nested items:
  - indent by two spaces
- [x] Task lists work on GFM platforms
- [ ] …like GitHub

1. Numbered
2. Lists

## Code

\`\`\`ts
export function greet(name: string) {
  return \`Hello, \${name}!\`;
}
\`\`\`

## Tables

| Feature     | CommonMark | GFM |
| ----------- | :--------: | :-: |
| Headings    |     ✓      |  ✓  |
| Tables      |            |  ✓  |
| Footnotes   |            |  ✓  |

> Tip: open the **Checks** panel to see anything that may not render the same on other platforms.

Here's a footnote reference.[^1]

[^1]: Footnotes are supported on GitHub and most blog platforms.
`;

/** The address of the example draft: shown when nothing is stored, and saved only once edited. */
export const NEW_DOC_ID = "new";

/** The example text as a draft that exists only in memory until the writer changes it. */
export const sampleDocument = (now = Date.now()): MdDocument => ({
  id: crypto.randomUUID().slice(0, 8),
  title: deriveTitle(SAMPLE),
  content: SAMPLE,
  images: {},
  createdAt: now,
  updatedAt: now,
});

/** A blank draft that exists only in memory until the writer types: the editor with nothing stored. */
export const emptyDocument = (now = Date.now()): MdDocument => ({
  id: crypto.randomUUID().slice(0, 8),
  title: "Untitled",
  content: "",
  images: {},
  createdAt: now,
  updatedAt: now,
});
