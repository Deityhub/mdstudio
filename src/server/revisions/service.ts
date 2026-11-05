// The server's version history of a cloud draft. Versions are immutable: nobody edits or deletes
// one. They are only added (when a push replaces text worth keeping), pruned from the oldest end
// past the limit, and dropped with the draft. The text is stored compressed (compress.ts).
import { and, desc, eq } from "drizzle-orm";
import { documentRevisions } from "../../../infra/db/schema";
import type { Db } from "../db";
import { fieldsHash } from "@/lib/sync/protocol";
import { pack, unpack } from "./compress";

export type RevisionConfig = {
  /** Versions kept per draft; 0 switches server history off. */
  max: number;
  /** At most one automatic version per draft in this long. */
  intervalMs: number;
};
export const DEFAULT_REVISIONS: RevisionConfig = { max: 10, intervalMs: 5 * 60_000 };

export type RevisionInfo = {
  id: string;
  version: number;
  title: string;
  reason: string;
  size: number;
  createdAt: number;
};

const newest = (db: Db, documentId: string) =>
  db
    .select()
    .from(documentRevisions)
    .where(eq(documentRevisions.documentId, documentId))
    .orderBy(desc(documentRevisions.createdAt), desc(documentRevisions.version));

/**
 * Keeps `prev`, the text a push is about to replace. "auto" versions respect the interval;
 * "replaced" ones (text another device's later edit took over) are always kept, because nobody
 * else has them. Returns whether a version was kept.
 */
export async function recordRevision(
  db: Db,
  userId: string,
  prev: { id: string; version: number; title: string; content: string },
  config: RevisionConfig,
  reason: "auto" | "replaced",
  now = Date.now(),
) {
  if (config.max <= 0 || !prev.content.trim()) return false;
  const [last] = await newest(db, prev.id).limit(1);
  const hash = await fieldsHash({ title: "", content: prev.content });
  if (last?.hash === hash) return false;
  if (reason === "auto" && last && now - last.createdAt < config.intervalMs) return false;

  const packed = await pack(prev.content);
  await db.insert(documentRevisions).values({
    id: crypto.randomUUID(),
    documentId: prev.id,
    userId,
    version: prev.version,
    title: prev.title,
    content: packed.content,
    encoding: packed.encoding,
    size: prev.content.length,
    hash,
    reason,
    createdAt: now,
  });
  // Past the limit the oldest go, so the cost of history stays bounded.
  const all = await newest(db, prev.id);
  for (const old of all.slice(config.max))
    await db.delete(documentRevisions).where(eq(documentRevisions.id, old.id));
  return true;
}

export const deleteRevisions = (db: Db, documentId: string) =>
  db.delete(documentRevisions).where(eq(documentRevisions.documentId, documentId));

export async function listRevisions(
  db: Db,
  userId: string,
  documentId: string,
): Promise<RevisionInfo[]> {
  const rows = await newest(db, documentId);
  return rows
    .filter((r) => r.userId === userId)
    .map((r) => ({
      id: r.id,
      version: r.version,
      title: r.title,
      reason: r.reason,
      size: r.size,
      createdAt: r.createdAt,
    }));
}

export async function getRevision(db: Db, userId: string, documentId: string, id: string) {
  const [row] = await db
    .select()
    .from(documentRevisions)
    .where(
      and(
        eq(documentRevisions.id, id),
        eq(documentRevisions.documentId, documentId),
        eq(documentRevisions.userId, userId),
      ),
    );
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    reason: row.reason,
    createdAt: row.createdAt,
    content: await unpack(row.encoding, row.content),
  };
}
