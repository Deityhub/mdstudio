// Document sync, independent of HTTP. The server never merges text: a push either applies cleanly
// on top of the version the client last saw, or is refused with the server's copy so the client
// can keep both (see docs/SYSTEM_SPEC.md, "Multi-Device Synchronization").
import { and, asc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { documents } from "../../../infra/db/schema";
import type { Db } from "../db";

export const MAX_PUSH_DOCS = 50;
export const MAX_CONTENT = 1_000_000;

const PushItem = z.object({
  id: z.string().min(1).max(100),
  /** The server version this edit was made on; 0 for a draft the server has never seen. */
  baseVersion: z.number().int().min(0),
  title: z.string().max(500),
  name: z.string().max(500).nullish(),
  folder: z.string().max(500).nullish(),
  content: z.string().max(MAX_CONTENT),
  createdAt: z.number().int().min(0),
  deleted: z.boolean().optional(),
});
export type PushItem = z.infer<typeof PushItem>;

export function parsePush(body: unknown): PushItem[] | null {
  const parsed = z.object({ docs: z.array(PushItem).max(MAX_PUSH_DOCS) }).safeParse(body);
  return parsed.success ? parsed.data.docs : null;
}

export type ServerDoc = {
  id: string;
  version: number;
  title: string;
  name: string | null;
  folder: string | null;
  content: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
};

export type PushResult =
  | { id: string; status: "ok"; version: number; updatedAt: number }
  | { id: string; status: "conflict"; server: ServerDoc }
  | { id: string; status: "rejected" };

type Row = typeof documents.$inferSelect;

const toServerDoc = (r: Row): ServerDoc => ({
  id: r.id,
  version: r.version,
  title: r.title,
  name: r.name,
  folder: r.folder,
  content: r.content,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  deleted: r.deletedAt !== null,
});

async function hashOf(title: string, name: string | null, folder: string | null, content: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([title, name, folder, content])),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const find = async (db: Db, id: string) =>
  (await db.select().from(documents).where(eq(documents.id, id)))[0];

async function pushOne(db: Db, userId: string, it: PushItem, now: number): Promise<PushResult> {
  const name = it.name ?? null;
  const folder = it.folder ?? null;
  const deleted = it.deleted === true;
  const content = deleted ? "" : it.content;
  const contentHash = await hashOf(it.title, name, folder, content);
  const fields = { title: it.title, name, folder, content, contentHash };

  const conflictOrRejected = async (): Promise<PushResult> => {
    const row = await find(db, it.id);
    // Another account's id looks the same as an unknown one: nothing about it is revealed.
    return !row || row.userId !== userId
      ? { id: it.id, status: "rejected" }
      : { id: it.id, status: "conflict", server: toServerDoc(row) };
  };

  const existing = await find(db, it.id);
  if (!existing) {
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
      return { id: it.id, status: "ok", version: 1, updatedAt: now };
    } catch {
      return conflictOrRejected(); // inserted by someone else between the read and the write
    }
  }

  if (existing.userId !== userId) return { id: it.id, status: "rejected" };
  if (existing.version !== it.baseVersion) return conflictOrRejected();
  const wasDeleted = existing.deletedAt !== null;
  if (wasDeleted && !deleted) return conflictOrRejected();
  if (existing.contentHash === contentHash && wasDeleted === deleted)
    return { id: it.id, status: "ok", version: existing.version, updatedAt: existing.updatedAt };

  const updatedAt = Math.max(now, existing.updatedAt);
  // Only applies if nobody pushed since the read; otherwise nothing is returned.
  const changed = await db
    .update(documents)
    .set({ ...fields, version: existing.version + 1, updatedAt, deletedAt: deleted ? now : null })
    .where(and(eq(documents.id, it.id), eq(documents.version, existing.version)))
    .returning({ id: documents.id });
  if (changed.length === 0) return conflictOrRejected();
  return { id: it.id, status: "ok", version: existing.version + 1, updatedAt };
}

export async function pushDocs(db: Db, userId: string, items: PushItem[], now = Date.now()) {
  const results: PushResult[] = [];
  for (const it of items) results.push(await pushOne(db, userId, it, now));
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
