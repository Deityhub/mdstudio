// Where a room keeps its state between wake-ups: one snapshot plus the updates since. The Durable
// Object, the self-hosted database and the tests each provide one; the room does not care which.
export type Stored = { snapshot: Uint8Array | null; updates: Uint8Array[] };

export type CollabStore = {
  load(): Promise<Stored>;
  /** Adds one update to the log. */
  append(update: Uint8Array): Promise<void>;
  /** Replaces the snapshot and empties the log. */
  compact(snapshot: Uint8Array): Promise<void>;
  /** Forgets the room entirely. */
  clear(): Promise<void>;
};

/** A store in memory, for tests and for the first run of a self-hosted server without a database. */
export function memoryStore(): CollabStore & { readonly stored: Stored } {
  const stored: Stored = { snapshot: null, updates: [] };
  return {
    stored,
    async load() {
      return { snapshot: stored.snapshot, updates: [...stored.updates] };
    },
    async append(update) {
      stored.updates.push(update);
    },
    async compact(snapshot) {
      stored.snapshot = snapshot;
      stored.updates = [];
    },
    async clear() {
      stored.snapshot = null;
      stored.updates = [];
    },
  };
}
