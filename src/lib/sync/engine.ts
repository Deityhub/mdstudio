// One sync round: pull what changed in the cloud, then push what changed here. Only drafts the
// writer chose for the cloud take part. The server never merges text: when two devices changed the
// same draft, the later edit wins, and the text that loses is first kept in this device's version
// history, so a replaced edit can always be brought back.
import { type MdDocument, type createDocumentStore } from "../storage/documentStore";
import type { SyncMeta } from "./meta";
import {
  MAX_CONTENT,
  MAX_PUSH_DOCS,
  type PullPage,
  type PushItem,
  type PushResult,
  type ServerDoc,
  fieldsHash,
  localId,
  remoteId,
} from "./protocol";

export type SyncApi = {
  push(docs: PushItem[]): Promise<PushResult[]>;
  pull(since: number): Promise<PullPage>;
};

export type SyncDeps = {
  userId: string;
  store: ReturnType<typeof createDocumentStore>;
  meta: SyncMeta;
  api: SyncApi;
  /** True for a draft with edits still waiting to be saved; remote changes to it wait a round. */
  isBusy?: (id: string) => boolean;
  /** Keeps the text that is about to be replaced by a newer edit made elsewhere. */
  snapshot?: (doc: MdDocument) => Promise<unknown>;
  /** Called when a draft leaves this device because it was deleted in the cloud. */
  onGone?: (id: string) => Promise<unknown>;
  /** Called when a draft stops being edited live here (stopped, deleted, or gone): what the browser kept of the room is forgotten. */
  onLeaveLive?: (id: string) => Promise<unknown>;
};

export type SyncReport = {
  /** Local drafts created or changed from the cloud. */
  applied: string[];
  /** Local drafts removed because they were deleted in the cloud. */
  removed: string[];
  /** Drafts whose local text was replaced by a newer edit made elsewhere (kept in history). */
  replaced: string[];
  /** Drafts that lost their cloud copy but stay on this device. */
  detached: string[];
  pushed: number;
  /** Drafts left alone this round because of unsaved edits. */
  deferred: number;
  /** Drafts above the size limit, which stay on this device. */
  tooLarge: string[];
  /** Drafts the cloud refused because the account is full; they are local-only again. */
  overLimit: string[];
  rejected: number;
  /** How many drafts the account may keep in the cloud, as the server reports it. */
  limit?: number;
};

const MAX_BATCH_CHARS = 4_000_000;
const MAX_ROUNDS = 3;
const quiet = { quiet: true };

// A sign-out and the background runner must never sync at the same time.
let chain: Promise<unknown> = Promise.resolve();
export const syncOnce = (
  deps: SyncDeps,
  /** `pull: false` pushes only: for when another device's changes are arriving by themselves. */
  opts: { pull?: boolean } = {},
): Promise<SyncReport> => {
  const next = chain.then(() => round(deps, opts.pull !== false));
  chain = next.catch(() => undefined);
  return next;
};

/** Starts a report with nothing in it. */
const emptyReport = (): SyncReport => ({
  applied: [],
  removed: [],
  replaced: [],
  detached: [],
  pushed: 0,
  deferred: 0,
  tooLarge: [],
  overLimit: [],
  rejected: 0,
});

/**
 * Brings a draft from the cloud into this device, writing what happens into `report`. Shared by a
 * round (which pulls) and by a draft that another device's change delivers directly.
 */
function applier(deps: SyncDeps, report: SyncReport) {
  const { userId, store, meta } = deps;
  const note = (list: string[], v: string) => void (list.includes(v) || list.push(v));

  async function writeRemote(local: MdDocument | undefined, rd: ServerDoc, id: string) {
    const next: MdDocument = {
      id,
      content: rd.content,
      title: rd.title,
      images: local?.images ?? {},
      createdAt: local?.createdAt ?? rd.createdAt,
      // The edit time travels with the text, so a later comparison is between like clocks.
      updatedAt: rd.editedAt || rd.updatedAt,
      ...(rd.name ? { name: rd.name } : {}),
      ...(rd.folder ? { folder: rd.folder } : {}),
    };
    await store.save(next, quiet);
    if (rd.folder) await store.folders.add(rd.folder);
    note(report.applied, id);
  }

  /** Brings one draft from the cloud into this device. False when it had to wait. */
  async function applyRemote(rd: ServerDoc, force = false): Promise<boolean> {
    const id = localId(userId, rd.id);
    if (!id) return true;
    const m = await meta.get(id);
    if (!force && m && m.version >= rd.version) return true;
    const local = await store.get(id);
    if (local && deps.isBusy?.(id)) {
      report.deferred++;
      return false;
    }
    const localHash = local ? await fieldsHash(local) : null;
    const remoteHash = rd.deleted ? null : await fieldsHash(rd);
    // Unsynced edits, unless this device happens to hold exactly what the cloud holds.
    const dirty = !!local && (!m || m.deleted || localHash !== m.hash) && localHash !== remoteHash;

    if (rd.deleted) {
      if (local && dirty) {
        // An edit beats a delete: the draft stays here, no longer in the cloud.
        note(report.detached, id);
      } else if (local) {
        await store.remove(id, quiet);
        await deps.onGone?.(id);
        note(report.removed, id);
      }
      await meta.set({ id, version: rd.version, hash: "", deleted: true });
      if (m?.collab) await deps.onLeaveLive?.(id);
      return true;
    }

    if (rd.collab) {
      // Edited live: the room holds the text. The first time this device hears of it, text it has
      // that the cloud did not is kept in History; after that the cloud's copy is never applied.
      if (!m?.collab) {
        if (local && dirty) {
          await deps.snapshot?.(local);
          note(report.replaced, id);
        }
        if (!local || localHash !== remoteHash) await writeRemote(local, rd, id);
      }
      await meta.set({
        id,
        version: rd.version,
        hash: m?.collab ? m.hash : remoteHash!,
        collab: true,
      });
      return true;
    }
    if (m?.collab) {
      // Live editing stopped: the room's last text is the draft's, whatever this device's copy says.
      if (local && localHash !== remoteHash) await deps.snapshot?.(local);
      if (!local || localHash !== remoteHash) await writeRemote(local, rd, id);
      await meta.set({ id, version: rd.version, hash: remoteHash! });
      await deps.onLeaveLive?.(id);
      return true;
    }

    if (local && dirty) {
      if (local.updatedAt > rd.editedAt) {
        // This device's edit is the later one: keep it, and push it on top of the cloud version.
        await meta.set({ id, version: rd.version, hash: m && !m.deleted ? m.hash : "" });
        return true;
      }
      await deps.snapshot?.(local);
      note(report.replaced, id);
    }
    if (!local || localHash !== remoteHash) await writeRemote(local, rd, id);
    await meta.set({ id, version: rd.version, hash: remoteHash! });
    return true;
  }

  return { applyRemote, note };
}

/**
 * Applies drafts another device just changed, delivered over the real-time channel, without a
 * pull. It is the same rule as a pull applies (a version already seen is skipped, an edit made
 * here that is later is kept, one with unsaved edits waits), so a late, repeated or echoed event is
 * harmless. The pull cursor is not touched: only a real pull moves it, so no gap can open.
 * `deferred` in the report means a draft had to wait; the caller asks for a pull then.
 */
export function applyPushed(deps: SyncDeps, docs: ServerDoc[]): Promise<SyncReport> {
  const next = chain.then(async () => {
    const report = emptyReport();
    const { applyRemote } = applier(deps, report);
    for (const rd of docs) await applyRemote(rd);
    return report;
  });
  chain = next.catch(() => undefined);
  return next;
}

async function round(deps: SyncDeps, pulls: boolean): Promise<SyncReport> {
  const { userId, store, meta, api } = deps;
  const report = emptyReport();
  const { applyRemote, note } = applier(deps, report);

  async function pull() {
    let since = await meta.cursor();
    let hold = false;
    for (;;) {
      const page = await api.pull(since);
      if (page.limit !== undefined) report.limit = page.limit;
      for (const rd of page.docs) if (!(await applyRemote(rd))) hold = true;
      since = page.cursor;
      // Past a draft that had to wait, the cursor stays put so the next round sees it again.
      if (!hold) await meta.setCursor(since);
      if (!page.hasMore) break;
    }
  }

  /** Returns true when something was rebased and needs another pass. */
  async function push(): Promise<boolean> {
    const items: { item: PushItem; hash: string; unlink?: boolean }[] = [];
    const locals = await store.list();
    const here = new Map(locals.map((d) => [d.id, d]));
    const metas = await meta.list();

    for (const m of metas) {
      if (m.deleted) continue;
      const d = here.get(m.id);
      if (m.collab && d && !m.unlink) continue; // live: the room carries its text
      if (!d || m.unlink) {
        // Deleted here, or taken out of the cloud on purpose: the cloud copy goes.
        items.push({
          hash: "",
          ...(m.unlink && d ? { unlink: true } : {}),
          item: {
            id: remoteId(userId, m.id),
            baseVersion: m.version,
            title: "",
            content: "",
            createdAt: 0,
            editedAt: Date.now(),
            deleted: true,
          },
        });
        continue;
      }
      const hash = await fieldsHash(d);
      if (hash === m.hash) continue;
      if (d.content.length > MAX_CONTENT) {
        note(report.tooLarge, d.id);
        continue;
      }
      items.push({
        hash,
        item: {
          id: remoteId(userId, d.id),
          baseVersion: m.version,
          title: d.title,
          name: d.name ?? null,
          folder: d.folder ?? null,
          content: d.content,
          createdAt: d.createdAt,
          editedAt: d.updatedAt,
        },
      });
    }

    let again = false;
    for (let i = 0; i < items.length;) {
      const batch: typeof items = [];
      let chars = 0;
      while (i < items.length && batch.length < MAX_PUSH_DOCS) {
        const size = items[i]!.item.content.length;
        if (batch.length && chars + size > MAX_BATCH_CHARS) break;
        batch.push(items[i++]!);
        chars += size;
      }
      const results = await api.push(batch.map((b) => b.item));
      for (const r of results) {
        const sent = batch.find((b) => b.item.id === r.id);
        const id = localId(userId, r.id);
        if (!sent || !id) continue;
        if (r.status === "ok") {
          report.pushed++;
          await meta.set({
            id,
            version: r.version,
            hash: sent.hash,
            ...(sent.item.deleted ? { deleted: true } : {}),
          });
          if (sent.unlink) note(report.detached, id);
        } else if (r.status === "conflict") {
          const before = await meta.get(id);
          await applyRemote(r.server, true);
          const after = await meta.get(id);
          if (after && after.version !== before?.version) again = true;
        } else if (r.status === "collab") {
          // this device did not know the draft is live: its text is kept in History, the room's is shown
          await applyRemote(r.server, true);
        } else if (r.status === "limit_reached") {
          report.limit = r.limit;
          await meta.remove(id);
          note(report.overLimit, id);
        } else {
          report.rejected++;
        }
      }
    }
    return again;
  }

  for (let n = 0; n < MAX_ROUNDS; n++) {
    if (pulls) await pull();
    if (!(await push())) break;
  }
  return report;
}
