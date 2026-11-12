// What the admin dashboard does, independent of HTTP. Every change is written to the audit log by
// the caller (see routes.ts), and none of these ever returns the text of a draft.
import { and, asc, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import {
  aiIntegrations,
  assets,
  auditLog,
  documentEditors,
  documents,
  githubConnections,
  sessions,
  shareLinks,
  users,
} from "../../../infra/db/schema";
import type { ObjectStore } from "../../../infra/storage";
import { deleteAsset } from "../assets/service";
import type { Db } from "../db";
import { removePublicationsOf } from "../github/publish";
import { type EnvReader, accountLimits, changeAccount } from "../limits/service";
import { deleteRevisions } from "../revisions/service";
import { removeShareOf } from "../share/service";

const count = sql<number>`count(*)`;
const idPrefix = (userId: string) => `${userId}:`;

// ---- audit log ----------------------------------------------------------------------------------

export async function audit(
  db: Db,
  actor: { id: string; email: string },
  action: string,
  target?: { id: string; email: string | null },
  detail: unknown = {},
  now = Date.now(),
) {
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    at: now,
    actorId: actor.id,
    actorEmail: actor.email,
    action,
    targetId: target?.id ?? null,
    targetEmail: target?.email ?? null,
    detail: JSON.stringify(detail),
  });
}

export async function listAudit(db: Db, { limit, offset }: { limit: number; offset: number }) {
  const [total] = await db.select({ n: count }).from(auditLog);
  const rows = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(limit)
    .offset(offset);
  return {
    total: total?.n ?? 0,
    entries: rows.map((r) => ({ ...r, detail: safeParse(r.detail) })),
  };
}
const safeParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

// ---- overview -----------------------------------------------------------------------------------

const DAY = 86_400_000;

/** Totals across the site: accounts, what they keep in the cloud, and what is stored. */
export async function overview(db: Db, now = Date.now()) {
  const one = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0;
  const [bytes] = await db
    .select({ n: sql<number>`coalesce(sum(${assets.byteSize}), 0)` })
    .from(assets);
  return {
    accounts: await one(db.select({ n: count }).from(users)),
    admins: await one(db.select({ n: count }).from(users).where(eq(users.role, "admin"))),
    suspended: await one(
      db
        .select({ n: count })
        .from(users)
        .where(sql`${users.suspendedAt} IS NOT NULL`),
    ),
    unverified: await one(db.select({ n: count }).from(users).where(isNull(users.emailVerifiedAt))),
    newThisWeek: await one(
      db
        .select({ n: count })
        .from(users)
        .where(sql`${users.createdAt} > ${now - 7 * DAY}`),
    ),
    drafts: await one(db.select({ n: count }).from(documents).where(isNull(documents.deletedAt))),
    shares: await one(
      db
        .select({ n: count })
        .from(shareLinks)
        .where(sql`${shareLinks.expiresAt} > ${now}`),
    ),
    liveDrafts: await one(
      db
        .select({ n: count })
        .from(documents)
        .where(and(eq(documents.collab, 1), isNull(documents.deletedAt))),
    ),
    collaborators: await one(db.select({ n: count }).from(documentEditors)),
    images: await one(db.select({ n: count }).from(assets)),
    imageBytes: bytes?.n ?? 0,
    integrations: await one(db.select({ n: count }).from(aiIntegrations)),
  };
}

// ---- accounts -----------------------------------------------------------------------------------

export type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  plan: string;
  suspended: boolean;
  emailVerified: boolean;
  createdAt: number;
  drafts: number;
};

/** A page of accounts, newest first; `q` matches part of an address or name. */
export async function listUsers(
  db: Db,
  { q, limit, offset }: { q: string; limit: number; offset: number },
): Promise<{ users: UserRow[]; total: number }> {
  const term = `%${q.trim().replace(/[%_]/g, "")}%`;
  const where = q.trim() ? or(like(users.email, term), like(users.displayName, term)) : undefined;
  const [total] = await db.select({ n: count }).from(users).where(where);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      plan: users.plan,
      suspendedAt: users.suspendedAt,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      drafts: sql<number>`(SELECT count(*) FROM documents d WHERE d.user_id = ${users.id} AND d.deleted_at IS NULL)`,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt), asc(users.id))
    .limit(limit)
    .offset(offset);
  return {
    total: total?.n ?? 0,
    users: rows.map(({ suspendedAt, emailVerifiedAt, ...r }) => ({
      ...r,
      suspended: suspendedAt !== null,
      emailVerified: emailVerifiedAt !== null,
    })),
  };
}

/** One account: who it is, its limits with their sources, and what it uses. */
export async function userDetail(db: Db, env: EnvReader, id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) return null;
  const limits = await accountLimits(db, env, id);
  const one = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0;
  const [bytes] = await db
    .select({ n: sql<number>`coalesce(sum(${assets.byteSize}), 0)` })
    .from(assets)
    .where(eq(assets.userId, id));
  const [github] = await db
    .select({ login: githubConnections.login })
    .from(githubConnections)
    .where(eq(githubConnections.userId, id));
  return {
    account: {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      plan: u.plan,
      suspended: u.suspendedAt !== null,
      suspendedAt: u.suspendedAt,
      emailVerified: u.emailVerifiedAt !== null,
      hasPassword: u.passwordHash !== null,
      createdAt: u.createdAt,
    },
    limits: limits?.limits,
    plans: limits?.plans,
    usage: {
      drafts: await one(
        db
          .select({ n: count })
          .from(documents)
          .where(and(eq(documents.userId, id), isNull(documents.deletedAt))),
      ),
      shares: await one(
        db
          .select({ n: count })
          .from(shareLinks)
          .where(like(shareLinks.documentId, `${idPrefix(id)}%`)),
      ),
      images: await one(db.select({ n: count }).from(assets).where(eq(assets.userId, id))),
      imageBytes: bytes?.n ?? 0,
      integrations: await one(
        db.select({ n: count }).from(aiIntegrations).where(eq(aiIntegrations.userId, id)),
      ),
      sessions: await one(db.select({ n: count }).from(sessions).where(eq(sessions.userId, id))),
      github: github?.login ?? null,
    },
  };
}

type Change = {
  role?: unknown;
  plan?: unknown;
  suspended?: unknown;
  emailVerified?: unknown;
  limits?: Record<string, unknown>;
};
export type ChangeResult =
  { ok: true } | { ok: false; error: "invalid" | "not_found" | "self" | "last_admin" };

const adminCount = async (db: Db) =>
  (await db.select({ n: count }).from(users).where(eq(users.role, "admin")))[0]?.n ?? 0;

/**
 * Changes one account: role, plan, suspension, address confirmation and its own limits. An admin
 * cannot take their own admin role or suspend themselves, and the last admin cannot be demoted or
 * suspended, so the dashboard cannot lock everyone out. Checked first; a refusal changes nothing.
 */
export async function updateUser(
  db: Db,
  actorId: string,
  id: string,
  change: Change,
  now = Date.now(),
): Promise<ChangeResult> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) return { ok: false, error: "not_found" };
  const { role, plan, suspended, emailVerified, limits } = change;
  if (role !== undefined && role !== "admin" && role !== "user")
    return { ok: false, error: "invalid" };
  if (suspended !== undefined && typeof suspended !== "boolean")
    return { ok: false, error: "invalid" };
  if (emailVerified !== undefined && typeof emailVerified !== "boolean")
    return { ok: false, error: "invalid" };
  if (plan !== undefined && typeof plan !== "string") return { ok: false, error: "invalid" };

  const losesAdmin = u.role === "admin" && (role === "user" || suspended === true);
  if (id === actorId && losesAdmin) return { ok: false, error: "self" };
  if (losesAdmin && (await adminCount(db)) <= 1) return { ok: false, error: "last_admin" };

  // limits and plan are validated and written together by the limits service
  if (plan !== undefined || limits !== undefined) {
    const r = await changeAccount(db, id, {
      ...(plan !== undefined && { plan: plan as string }),
      ...(limits !== undefined && { limits }),
    });
    if (!r.ok) return r;
  }
  const set: Partial<typeof users.$inferInsert> = { updatedAt: now };
  if (role !== undefined) set.role = role as string;
  if (suspended !== undefined) set.suspendedAt = suspended ? (u.suspendedAt ?? now) : null;
  if (emailVerified === true && u.emailVerifiedAt === null) set.emailVerifiedAt = now;
  if (emailVerified === false) set.emailVerifiedAt = null;
  await db.update(users).set(set).where(eq(users.id, id));
  if (suspended === true) await db.delete(sessions).where(eq(sessions.userId, id));
  return { ok: true };
}

/** Ends every session of an account. Returns how many there were. */
export async function signOutEverywhere(db: Db, id: string): Promise<number> {
  const gone = await db
    .delete(sessions)
    .where(eq(sessions.userId, id))
    .returning({ id: sessions.id });
  return gone.length;
}

/** Deletes an account and everything of its own, including the stored image files. */
export async function deleteUser(
  db: Db,
  store: ObjectStore | null,
  actorId: string,
  id: string,
): Promise<ChangeResult> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) return { ok: false, error: "not_found" };
  if (id === actorId) return { ok: false, error: "self" };
  if (u.role === "admin" && (await adminCount(db)) <= 1) return { ok: false, error: "last_admin" };
  if (store) {
    const files = await db
      .select({ key: assets.storageKey })
      .from(assets)
      .where(eq(assets.userId, id));
    for (const f of files) await store.delete(f.key).catch(() => undefined);
  }
  await db.delete(users).where(eq(users.id, id));
  return { ok: true };
}

// ---- an account's content (never the text) -----------------------------------------------------

export async function userContent(db: Db, id: string, now = Date.now()) {
  const drafts = await db
    .select({
      id: documents.id,
      title: documents.title,
      bytes: sql<number>`length(${documents.content})`,
      updatedAt: documents.updatedAt,
      deletedAt: documents.deletedAt,
    })
    .from(documents)
    .where(and(eq(documents.userId, id), isNull(documents.deletedAt)))
    .orderBy(desc(documents.updatedAt));
  const shares = await db
    .select({
      documentId: shareLinks.documentId,
      slug: shareLinks.slug,
      title: shareLinks.title,
      access: shareLinks.access,
      expiresAt: shareLinks.expiresAt,
    })
    .from(shareLinks)
    .where(like(shareLinks.documentId, `${idPrefix(id)}%`));
  const images = await db
    .select({
      id: assets.id,
      fileName: assets.fileName,
      bytes: assets.byteSize,
      createdAt: assets.createdAt,
    })
    .from(assets)
    .where(eq(assets.userId, id))
    .orderBy(desc(assets.createdAt));
  const local = (documentId: string) => documentId.slice(idPrefix(id).length);
  return {
    drafts: drafts.map((d) => ({ ...d, id: local(d.id), deletedAt: undefined })),
    shares: shares.map((s) => ({
      id: local(s.documentId),
      slug: s.slug,
      title: s.title,
      access: s.access,
      expiresAt: s.expiresAt,
      live: (s.expiresAt ?? 0) > now,
    })),
    images,
  };
}

/** Takes a link down; false when the account has none for that draft. */
export async function removeShare(db: Db, userId: string, localId: string) {
  const gone = await db
    .delete(shareLinks)
    .where(eq(shareLinks.documentId, `${idPrefix(userId)}${localId}`))
    .returning({ id: shareLinks.id });
  return gone.length > 0;
}

export const removeImage = (db: Db, store: ObjectStore, userId: string, id: string) =>
  deleteAsset(db, store, userId, id);

/**
 * Deletes a cloud draft the way the writer's own delete does: a marker stays, so a device that still
 * has it removes its copy instead of putting it back; the text, its history, its link and its
 * publishing record go.
 */
export async function removeDraft(db: Db, userId: string, localId: string, now = Date.now()) {
  const docId = `${idPrefix(userId)}${localId}`;
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.userId, userId), isNull(documents.deletedAt)));
  if (!row) return false;
  await db
    .update(documents)
    .set({
      deletedAt: now,
      content: "",
      version: row.version + 1,
      updatedAt: Math.max(now, row.updatedAt),
    })
    .where(eq(documents.id, docId));
  await deleteRevisions(db, docId);
  await removeShareOf(db, docId);
  await removePublicationsOf(db, docId);
  return true;
}
