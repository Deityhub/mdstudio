// The people a private link is shared with, by the inbox their address stands for, so every
// spelling of one inbox is one person. They open the link by signing in with a confirmed account
// on that address (see viewShare); nothing here says whether such an account exists.
import { and, asc, count, eq } from "drizzle-orm";
import { sharePeople, users } from "../../../infra/db/schema";
import { MAX_SHARE_PEOPLE } from "@/lib/share/protocol";
import { canonicalEmail } from "../auth/email";
import type { Db } from "../db";
import { findOwnShare } from "./service";

export type Person = { id: string; email: string };

export async function listPeople(
  db: Db,
  userId: string,
  localId: string,
): Promise<Person[] | null> {
  const share = await findOwnShare(db, userId, localId);
  if (!share) return null;
  return db
    .select({ id: sharePeople.id, email: sharePeople.email })
    .from(sharePeople)
    .where(eq(sharePeople.shareId, share.id))
    .orderBy(asc(sharePeople.createdAt), asc(sharePeople.email));
}

export async function addPerson(
  db: Db,
  userId: string,
  localId: string,
  raw: string,
  now = Date.now(),
): Promise<
  { ok: true; people: Person[] } | { ok: false; error: "not_found" | "invalid" | "limit_reached" }
> {
  const share = await findOwnShare(db, userId, localId);
  if (!share) return { ok: false, error: "not_found" };
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const key = email.length <= 254 ? canonicalEmail(email) : null;
  if (!key) return { ok: false, error: "invalid" };
  // the owner already has access
  const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (me && canonicalEmail(me.email) === key) return { ok: false, error: "invalid" };

  const here = await listPeople(db, userId, localId);
  if (here && !here.some((p) => canonicalEmail(p.email) === key)) {
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(sharePeople)
      .where(eq(sharePeople.shareId, share.id));
    if (n >= MAX_SHARE_PEOPLE) return { ok: false, error: "limit_reached" };
    await db
      .insert(sharePeople)
      .values({ id: crypto.randomUUID(), shareId: share.id, email, emailKey: key, createdAt: now })
      .onConflictDoNothing();
  }
  return { ok: true, people: (await listPeople(db, userId, localId)) ?? [] };
}

export async function removePerson(db: Db, userId: string, localId: string, personId: string) {
  const share = await findOwnShare(db, userId, localId);
  if (!share) return false;
  const gone = await db
    .delete(sharePeople)
    .where(and(eq(sharePeople.id, personId), eq(sharePeople.shareId, share.id)))
    .returning({ id: sharePeople.id });
  return gone.length > 0;
}
