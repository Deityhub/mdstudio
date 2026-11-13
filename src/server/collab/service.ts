// Who may edit a draft together, and the database side of live editing: switching it on and off,
// the people invited, and the plain-text copy refreshed from the room. No Yjs in here, so the app
// Worker can import it; the room itself lives behind a host (see host.ts).
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { documentEditors, documents, users } from "../../../infra/db/schema";
import { LOCAL_ID, fieldsHash, remoteId, type ServerDoc } from "@/lib/sync/protocol";
import { canonicalEmail } from "../auth/email";
import type { PublicUser } from "../auth/service";
import type { Db } from "../db";
import { type RevisionConfig, recordRevision } from "../revisions/service";
import { toServerDoc } from "../sync/service";
import { quickTitle } from "./title";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type Access =
  | { ok: true; docId: string; ownerId: string; localId: string; isOwner: boolean; title: string }
  | { ok: false };

/** The owner of a draft that is not suspended: a suspended account's live drafts are closed. */
const ownerActive = sql`NOT EXISTS (SELECT 1 FROM users u WHERE u.suspended_at IS NOT NULL AND u.id = ${documents.userId})`;

const liveDoc = async (db: Db, docId: string) =>
  (
    await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, docId),
          eq(documents.collab, 1),
          isNull(documents.deletedAt),
          ownerActive,
        ),
      )
  )[0];

/** Whether this signed-in person may edit the draft: its owner, or someone invited by address. */
export async function docAccess(
  db: Db,
  user: PublicUser,
  ownerId: string,
  localId: string,
): Promise<Access> {
  if (!LOCAL_ID.test(localId) || !LOCAL_ID.test(ownerId)) return { ok: false };
  const docId = remoteId(ownerId, localId);
  const doc = await liveDoc(db, docId);
  if (!doc) return { ok: false };
  const allowed = { ok: true, docId, ownerId, localId, title: doc.title } as const;
  if (user.id === ownerId) return { ...allowed, isOwner: true };
  const key = user.emailVerified ? canonicalEmail(user.email) : null;
  if (!key) return { ok: false };
  const [invited] = await db
    .select({ id: documentEditors.id })
    .from(documentEditors)
    .where(and(eq(documentEditors.documentId, docId), eq(documentEditors.emailKey, key)));
  return invited ? { ...allowed, isOwner: false } : { ok: false };
}

const LINK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
/** A short random address, 12 characters (about 70 bits), so it cannot be counted through. */
const newLink = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(12)),
    (b) => LINK_ALPHABET[b % LINK_ALPHABET.length],
  ).join("");

/**
 * The address a live draft is opened by (/c/<it>), made on first need (a draft that was live before
 * links existed gets one then). Null when the draft is not live. It names nobody: opening it still
 * takes an invitation.
 */
export async function ensureLink(db: Db, docId: string): Promise<string | null> {
  const doc = await liveDoc(db, docId);
  if (!doc) return null;
  if (doc.collabLink) return doc.collabLink;
  await db
    .update(documents)
    .set({ collabLink: newLink() })
    .where(and(eq(documents.id, docId), isNull(documents.collabLink)));
  return (await liveDoc(db, docId))?.collabLink ?? null;
}

/**
 * Where an address leads for this person: the draft, if it is live and they may edit it. Anyone
 * else, and an address that leads nowhere, get the same null, so it never says that a draft exists.
 */
export async function linkTarget(db: Db, user: PublicUser, link: string) {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(link)) return null;
  const [row] = await db
    .select({ id: documents.id, ownerId: documents.userId })
    .from(documents)
    .where(
      and(
        eq(documents.collabLink, link),
        eq(documents.collab, 1),
        isNull(documents.deletedAt),
        ownerActive,
      ),
    );
  if (!row) return null;
  const localId = row.id.slice(row.ownerId.length + 1);
  const access = await docAccess(db, user, row.ownerId, localId);
  if (!access.ok) return null;
  const [owner] = await db
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, row.ownerId));
  return {
    ownerId: row.ownerId,
    id: localId,
    title: access.title,
    ownerName: owner?.name ?? null,
  };
}

export type EditorInfo = { id: string; email: string; createdAt: number };

/** The people invited to one of the caller's live drafts; null when it is not theirs. */
export async function listEditors(
  db: Db,
  ownerId: string,
  localId: string,
): Promise<EditorInfo[] | null> {
  const docId = remoteId(ownerId, localId);
  if (!LOCAL_ID.test(localId) || !(await liveDoc(db, docId))) return null;
  return db
    .select({
      id: documentEditors.id,
      email: documentEditors.email,
      createdAt: documentEditors.createdAt,
    })
    .from(documentEditors)
    .where(eq(documentEditors.documentId, docId))
    .orderBy(asc(documentEditors.createdAt), sql`${documentEditors}.rowid`);
}

export async function addEditor(
  db: Db,
  owner: PublicUser,
  localId: string,
  raw: string,
  /** People in one draft, the owner counted. */
  people: number,
  now = Date.now(),
): Promise<
  | { ok: true; editors: EditorInfo[]; email: string; added: boolean }
  | { ok: false; error: "not_found" | "not_live" | "invalid" | "limit_reached" }
> {
  if (!LOCAL_ID.test(localId)) return { ok: false, error: "not_found" };
  const docId = remoteId(owner.id, localId);
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), isNull(documents.deletedAt)));
  if (!doc) return { ok: false, error: "not_found" };
  if (doc.collab !== 1) return { ok: false, error: "not_live" };

  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const key = canonicalEmail(email);
  if (!key || email.length > 254 || !EMAIL.test(email) || key === canonicalEmail(owner.email))
    return { ok: false, error: "invalid" };
  const editors = (await listEditors(db, owner.id, localId)) ?? [];
  if (editors.some((e) => canonicalEmail(e.email) === key))
    return { ok: true, editors, email, added: false };
  if (editors.length + 1 >= people) return { ok: false, error: "limit_reached" };
  try {
    await db.insert(documentEditors).values({
      id: crypto.randomUUID(),
      documentId: docId,
      email,
      emailKey: key,
      invitedBy: owner.id,
      createdAt: now,
    });
  } catch {
    // the same address added twice at once: it is there either way
  }
  return {
    ok: true,
    editors: (await listEditors(db, owner.id, localId)) ?? [],
    email,
    added: true,
  };
}

/** The owner takes someone off; returns who it was, for ending their open connections. */
export async function removeEditor(db: Db, ownerId: string, localId: string, editorId: string) {
  const docId = remoteId(ownerId, localId);
  const [row] = await db
    .select()
    .from(documentEditors)
    .where(and(eq(documentEditors.id, editorId), eq(documentEditors.documentId, docId)));
  if (!row) return null;
  await db.delete(documentEditors).where(eq(documentEditors.id, editorId));
  return { email: row.email, emailKey: row.emailKey };
}

/** A person leaves a draft they were invited to. */
export async function leaveDoc(db: Db, user: PublicUser, ownerId: string, localId: string) {
  const key = canonicalEmail(user.email);
  if (!key || !LOCAL_ID.test(localId)) return false;
  const gone = await db
    .delete(documentEditors)
    .where(
      and(
        eq(documentEditors.documentId, remoteId(ownerId, localId)),
        eq(documentEditors.emailKey, key),
      ),
    )
    .returning({ id: documentEditors.id });
  return gone.length > 0;
}

/** Live drafts the person was invited to edit: where they find them. */
export async function sharedWith(db: Db, user: PublicUser) {
  const key = user.emailVerified ? canonicalEmail(user.email) : null;
  if (!key) return [];
  const rows = await db
    .select({
      docId: documents.id,
      ownerId: documents.userId,
      title: documents.title,
      updatedAt: documents.updatedAt,
      ownerName: users.displayName,
    })
    .from(documentEditors)
    .innerJoin(documents, eq(documents.id, documentEditors.documentId))
    .innerJoin(users, eq(users.id, documents.userId))
    .where(
      and(
        eq(documentEditors.emailKey, key),
        eq(documents.collab, 1),
        isNull(documents.deletedAt),
        ownerActive,
      ),
    )
    .orderBy(asc(documents.title));
  return rows.map((r) => ({
    ownerId: r.ownerId,
    id: r.docId.slice(r.ownerId.length + 1),
    title: r.title,
    ownerName: r.ownerName,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Switches a draft to live editing: returns its text, for the room to be seeded with, and the
 * draft as the owner's devices should see it (the flag, and a new version so they hear of it).
 */
export async function enableCollab(
  db: Db,
  ownerId: string,
  localId: string,
  limits: { docs: number },
  now = Date.now(),
): Promise<
  { ok: true; text: string; doc: ServerDoc } | { ok: false; error: "not_found" | "limit_reached" }
> {
  if (!LOCAL_ID.test(localId)) return { ok: false, error: "not_found" };
  const docId = remoteId(ownerId, localId);
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), isNull(documents.deletedAt)));
  if (!row) return { ok: false, error: "not_found" };
  if (row.collab === 1) return { ok: true, text: row.content, doc: toServerDoc(row) };
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(documents)
    .where(
      and(eq(documents.userId, ownerId), eq(documents.collab, 1), isNull(documents.deletedAt)),
    );
  if (n >= limits.docs) return { ok: false, error: "limit_reached" };
  const [updated] = await db
    .update(documents)
    .set({
      collab: 1,
      collabLink: row.collabLink ?? newLink(),
      version: row.version + 1,
      updatedAt: Math.max(now, row.updatedAt),
    })
    .where(and(eq(documents.id, docId), eq(documents.collab, 0)))
    .returning();
  return { ok: true, text: row.content, doc: toServerDoc(updated ?? { ...row, collab: 1 }) };
}

/** Back to ordinary sync: everyone invited is let go. Null when it was not live. */
export async function disableCollab(
  db: Db,
  ownerId: string,
  localId: string,
  now = Date.now(),
): Promise<ServerDoc | null> {
  if (!LOCAL_ID.test(localId)) return null;
  const docId = remoteId(ownerId, localId);
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.collab, 1)));
  if (!row) return null;
  await db.delete(documentEditors).where(eq(documentEditors.documentId, docId));
  const [updated] = await db
    .update(documents)
    // the address stops working with it; starting again makes a new one
    .set({
      collab: 0,
      collabLink: null,
      version: row.version + 1,
      updatedAt: Math.max(now, row.updatedAt),
    })
    .where(eq(documents.id, docId))
    .returning();
  return toServerDoc(updated ?? { ...row, collab: 0 });
}

/** Lets go of everyone invited to a draft (when it is deleted); the draft row itself is not touched. */
export const dropEditors = (db: Db, docId: string) =>
  db
    .delete(documentEditors)
    .where(eq(documentEditors.documentId, docId))
    .then(() => undefined);

/**
 * Refreshes the plain-text copy of a live draft from its room. Everything that reads the text
 * (share links, GitHub, history, the owner's pull) reads this copy. Keeps what it replaces in the
 * history by the same rules as a push; changes nothing when the text is the same.
 */
export async function applyCollabText(
  db: Db,
  docId: string,
  text: string,
  now: number,
  revisions: RevisionConfig,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.collab, 1), isNull(documents.deletedAt)));
  if (!row) return false;
  const title = quickTitle(text, row.title);
  const contentHash = await fieldsHash({
    title,
    name: row.name,
    folder: row.folder,
    content: text,
  });
  if (contentHash === row.contentHash) return false;
  const updatedAt = Math.max(now, row.updatedAt);
  const changed = await db
    .update(documents)
    .set({
      content: text,
      title,
      contentHash,
      version: row.version + 1,
      updatedAt,
      editedAt: now,
    })
    .where(and(eq(documents.id, docId), eq(documents.version, row.version)))
    .returning({ id: documents.id });
  if (!changed.length) return false; // someone else wrote meanwhile; the next refresh catches up
  await recordRevision(
    db,
    row.userId,
    { id: row.id, version: row.version, title: row.title, content: row.content },
    revisions,
    "auto",
    now,
  ).catch((error) => console.error("Couldn't keep a version of a live draft", error));
  return true;
}

/** The ids of an account's drafts that are being edited live (for ending their rooms when it goes). */
export async function liveDocIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.collab, 1)));
  return rows.map((r) => r.id);
}
