// Document sync, independent of HTTP. The server never merges text. A push applies on top of the
// version the client last saw; if the document moved on since, the later edit wins (by the edit
// time the devices report), and the loser is answered with the server's copy. See
// docs/SYSTEM_SPEC.md, "Multi-Device Synchronization".
import { and, asc, count, eq, gte, isNull } from "drizzle-orm";
import { z } from "zod";
import { documents } from "../../../infra/db/schema";
import {
  DEFAULT_CLOUD_LIMIT,
  MAX_PUSH_DOCS,
  type PushItem,
  PushItemSchema,
  type PushResult,
  type ServerDoc,
  fieldsHash,
  remoteId,
} from "@/lib/sync/protocol";
import type { Db } from "../db";
import { removePublicationsOf } from "../github/publish";
import { removeShareOf } from "../share/service";
import {
  DEFAULT_REVISIONS,
  type RevisionConfig,
  deleteRevisions,
  recordRevision,
} from "../revisions/service";

export type { PushItem, PushResult, ServerDoc } from "@/lib/sync/protocol";

export function parsePush(body: unknown): PushItem[] | null {
  const parsed = z.object({ docs: z.array(PushItemSchema).max(MAX_PUSH_DOCS) }).safeParse(body);
  return parsed.success ? parsed.data.docs : null;
}

type Row = typeof documents.$inferSelect;

/** A device clock ahead of ours can claim at most this much, or it would win every conflict. */
const FUTURE_SKEW_MS = 5 * 60_000;

const liveCount = async (db: Db, userId: string) =>
  (
    await db
      .select({ n: count() })
      .from(documents)
      .where(and(eq(documents.userId, userId), isNull(documents.deletedAt)))
  )[0]?.n ?? 0;

export const toServerDoc = (r: Row): ServerDoc => ({
  id: r.id,
  version: r.version,
  title: r.title,
  name: r.name,
  folder: r.folder,
  content: r.content,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  editedAt: r.editedAt,
  deleted: r.deletedAt !== null,
  collab: r.collab === 1,
});

const find = async (db: Db, id: string) =>
  (await db.select().from(documents).where(eq(documents.id, id)))[0];

async function pushOne(
  db: Db,
  userId: string,
  it: PushItem,
  now: number,
  limit: number,
  revisions: RevisionConfig,
  changedDocs: ServerDoc[],
): Promise<PushResult> {
  const name = it.name ?? null;
  const folder = it.folder ?? null;
  const deleted = it.deleted === true;
  const content = deleted ? "" : it.content;
  const contentHash = await fieldsHash({ title: it.title, name, folder, content });
  const editedAt = Math.min(it.editedAt, now + FUTURE_SKEW_MS);
  const text = { title: it.title, name, folder, content, editedAt };
  const fields = { ...text, contentHash };

  const conflictOrRejected = async (): Promise<PushResult> => {
    const row = await find(db, it.id);
    // Another account's id looks the same as an unknown one: nothing about it is revealed.
    return !row || row.userId !== userId
      ? { id: it.id, status: "rejected" }
      : { id: it.id, status: "conflict", server: toServerDoc(row) };
  };
  const full = { id: it.id, status: "limit_reached", limit } as const;

  // Ids are namespaced per user (see remoteId), so a short id picked by chance elsewhere cannot clash.
  if (!it.id.startsWith(remoteId(userId, ""))) return { id: it.id, status: "rejected" };

  const existing = await find(db, it.id);
  if (!existing) {
    if (!deleted && (await liveCount(db, userId)) >= limit) return full;
    try {
      await db.insert(documents).values({
        id: it.id,
        userId,
        ...fields,
        version: 1,
        createdAt: it.createdAt,
        updatedAt: now,
        deletedAt: deleted ? now : null,
      });
      changedDocs.push({
        id: it.id,
        version: 1,
        ...text,
        createdAt: it.createdAt,
        updatedAt: now,
        deleted,
        collab: false,
      });
      return { id: it.id, status: "ok", version: 1, updatedAt: now };
    } catch {
      return conflictOrRejected(); // inserted by someone else between the read and the write
    }
  }

  if (existing.userId !== userId) return { id: it.id, status: "rejected" };
  // a live draft's text is the room's; a device may delete it, not overwrite it
  if (existing.collab === 1 && !deleted)
    return { id: it.id, status: "collab", server: toServerDoc(existing) };
  const wasDeleted = existing.deletedAt !== null;
  // The same text on both sides is never a conflict, however far apart the versions are.
  if (existing.contentHash === contentHash && wasDeleted === deleted)
    return { id: it.id, status: "ok", version: existing.version, updatedAt: existing.updatedAt };

  if (existing.version !== it.baseVersion) {
    // The document moved on since this device last synced: the later edit wins. A delete never
    // overrides an edit, and an edit never revives a delete it has not seen.
    if (deleted || wasDeleted || editedAt <= existing.editedAt) return conflictOrRejected();
  } else if (wasDeleted && !deleted && (await liveCount(db, userId)) >= limit) {
    return full; // bringing a deleted draft back needs a free slot
  }

  const updatedAt = Math.max(now, existing.updatedAt);
  // Only applies if nobody pushed since the read; otherwise nothing is returned.
  const changed = await db
    .update(documents)
    .set({ ...fields, version: existing.version + 1, updatedAt, deletedAt: deleted ? now : null })
    .where(and(eq(documents.id, it.id), eq(documents.version, existing.version)))
    .returning({ id: documents.id });
  if (changed.length === 0) return conflictOrRejected();
  changedDocs.push({
    id: it.id,
    version: existing.version + 1,
    ...text,
    createdAt: existing.createdAt,
    updatedAt,
    deleted,
    collab: existing.collab === 1,
  });
  if (deleted) {
    // A deleted draft takes its history with it, so the text does not linger.
    await deleteRevisions(db, it.id);
    // and its public link, which would otherwise outlive the draft it was published from
    await removeShareOf(db, it.id);
    // and what is remembered about publishing it on GitHub
    await removePublicationsOf(db, it.id);
  } else if (!wasDeleted) {
    // Keep the text this push replaced. A stale base means a later edit from another device took
    // over the server's text, which nobody else has, so that one is always kept.
    await recordRevision(
      db,
      userId,
      { id: it.id, version: existing.version, title: existing.title, content: existing.content },
      revisions,
      existing.version !== it.baseVersion ? "replaced" : "auto",
      now,
    ).catch((error) => console.error("Couldn't keep a version of a draft", error));
  }
  return { id: it.id, status: "ok", version: existing.version + 1, updatedAt };
}

export async function pushDocs(
  db: Db,
  userId: string,
  items: PushItem[],
  now = Date.now(),
  limit = DEFAULT_CLOUD_LIMIT,
  revisions: RevisionConfig = DEFAULT_REVISIONS,
  changed: ServerDoc[] = [],
) {
  const results: PushResult[] = [];
  for (const it of items)
    results.push(await pushOne(db, userId, it, now, limit, revisions, changed));
  return results;
}

/**
 * Documents changed at or after `since`, oldest first. The cursor is inclusive so a write that
 * lands in the same millisecond as the last one read is picked up next time; clients treat an
 * already-applied version as a no-op.
 * ponytail: more than `limit` writes in one millisecond would repeat a page; not realistic here.
 */
export async function pullDocs(db: Db, userId: string, since: number, limit = 200) {
  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), gte(documents.updatedAt, since)))
    .orderBy(asc(documents.updatedAt), asc(documents.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    docs: page.map(toServerDoc),
    cursor: page.at(-1)?.updatedAt ?? since,
    hasMore: rows.length > limit,
  };
}
