// The HTTP side of live editing (the sockets are src/server/realtime/routes.ts): the owner switches a
// draft to live editing and back, invites and removes people; invited people list what is shared with
// them and leave; and any editor can ask for the plain-text copy to be refreshed from the room.
import { eq, inArray } from "drizzle-orm";
import { documentEditors, users } from "../../../infra/db/schema";
import { remoteId } from "@/lib/sync/protocol";
import { canonicalEmail } from "../auth/email";
import { withVerifiedUser } from "../auth/guard";
import { noStoreJson as json, readJson, sameOrigin } from "../auth/http";
import { hit } from "../auth/limits";
import type { Db } from "../db";
import { siteOrigin } from "../env";
import { limitsFor } from "../limits/request";
import { sendQuietly } from "../mail/quiet";
import { publish, publishDocs, userTopic } from "../realtime/publish";
import { revisionConfig } from "../revisions/routes";
import { getSettings } from "../settings/service";
import { getCollabHost } from "./host";
import { collabInviteMail } from "./mail";
import {
  addEditor,
  applyCollabText,
  disableCollab,
  docAccess,
  dropEditors,
  enableCollab,
  ensureLink,
  leaveDoc,
  linkTarget,
  listEditors,
  removeEditor,
  sharedWith,
} from "./service";

const DAY = 86_400_000;
const STATUS: Record<string, number> = {
  invalid: 400,
  not_found: 404,
  not_live: 409,
  limit_reached: 403,
  collab_closed: 403,
  collab_unavailable: 503,
};
const fail = (error: string) => json({ error }, STATUS[error] ?? 400);

/** Where a draft's address leads for this person; anyone not invited gets the same 404 as a wrong address. */
export const openLinkHandler = (request: Request, link: string) =>
  withVerifiedUser(request, async (user, db) => {
    const target = await linkTarget(db, user, link);
    return target ? json(target) : fail("not_found");
  });

/** Drafts others invited this person to edit. */
export const sharedHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) => json({ drafts: await sharedWith(db, user) }));

/** Whether a draft of the caller's is live, who is invited, and what their limits allow. */
export const stateHandler = (request: Request, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    const limits = await limitsFor(request, db, user.id);
    const editors = await listEditors(db, user.id, localId);
    const link = editors ? await ensureLink(db, remoteId(user.id, localId)) : null;
    return json({
      live: editors !== null,
      editors: editors ?? [],
      // where the invited open the draft; the owner can send it themselves too
      link: link ? `${siteOrigin(request)}/c/${link}` : null,
      people: limits.collab_people,
      docs: limits.collab_docs,
      available: limits.collab_enabled && (await getSettings(db)).collabOpen,
    });
  });

/** Switches a draft to live editing: the room is started from the draft's text as the server has it. */
export const enableHandler = (request: Request, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const limits = await limitsFor(request, db, user.id);
    if (!limits.collab_enabled || !(await getSettings(db)).collabOpen) return fail("collab_closed");
    const host = await getCollabHost(request, db);
    if (!host) return fail("collab_unavailable");
    const r = await enableCollab(db, user.id, localId, { docs: limits.collab_docs });
    if (!r.ok) return fail(r.error);
    await host.seed(remoteId(user.id, localId), r.text);
    // the owner's other devices learn the draft is live (and stop treating its text as theirs)
    await publishDocs(request, user.id, [r.doc]);
    return json({ live: true, editors: (await listEditors(db, user.id, localId)) ?? [] });
  });

/** Stops live editing: the room's last text is kept, everyone invited is let go, sync is ordinary again. */
export const disableHandler = (request: Request, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const host = await getCollabHost(request, db);
    if (!host) return fail("collab_unavailable");
    const docId = remoteId(user.id, localId);
    const limits = await limitsFor(request, db, user.id);
    const text = await host.text(docId);
    if (text !== null)
      await applyCollabText(db, docId, text, Date.now(), revisionConfig(request, limits.revisions));
    const invited = (await listEditors(db, user.id, localId)) ?? [];
    const doc = await disableCollab(db, user.id, localId);
    if (!doc) return fail("not_found");
    await host.destroy(docId);
    await notifyPeople(
      request,
      db,
      invited.map((e) => keyOf(e.email)),
    );
    await publishDocs(request, user.id, [doc]);
    return json({ ok: true });
  });

export const addEditorHandler = (request: Request, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const body = await readJson(request);
    if (typeof body?.["email"] !== "string") return fail("invalid");
    const limits = await limitsFor(request, db, user.id);
    const access = await docAccess(db, user, user.id, localId);
    if (!access.ok) return fail("not_found");
    const t = await hit(db, `collab-invite:${user.id}`, limits.invites_per_day, DAY);
    if (!t.allowed) return json({ error: "too_many_requests" }, 429);
    const r = await addEditor(db, user, localId, body["email"], limits.collab_people);
    if (!r.ok) return fail(r.error);
    // only a new address is emailed, so adding the same one again cannot be used to send mail
    const link = r.added ? await ensureLink(db, access.docId) : null;
    const emailed =
      r.added && link
        ? await sendQuietly(
            request,
            collabInviteMail(
              siteOrigin(request),
              access.title,
              r.email,
              user.displayName ?? "",
              link,
            ),
          )
        : false;
    if (r.added) await notifyPeople(request, db, [keyOf(r.email)]);
    return json({ editors: r.editors, emailed });
  });

/** The owner takes someone off the draft; their open connections end at once. */
export const removeEditorHandler = (request: Request, localId: string, editorId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const removed = await removeEditor(db, user.id, localId, editorId);
    if (!removed) return fail("not_found");
    await kickByAddress(request, db, remoteId(user.id, localId), removed.emailKey);
    await notifyPeople(request, db, [removed.emailKey]);
    return json({ ok: true });
  });

/** A person leaves a draft they were invited to. */
export const leaveHandler = (request: Request, ownerId: string, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    if (!(await leaveDoc(db, user, ownerId, localId))) return fail("not_found");
    const host = await getCollabHost(request, db);
    await host?.kick(remoteId(ownerId, localId), user.id);
    return json({ ok: true });
  });

/**
 * Refreshes the plain-text copy of a live draft from its room. Browsers ask a little after the last
 * change and when the page is hidden; asking is cheap (the text is only written when it differs).
 */
export const flushHandler = (request: Request, ownerId: string, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const access = await docAccess(db, user, ownerId, localId);
    if (!access.ok) return fail("not_found");
    const t = await hit(db, `collab-flush:${access.docId}`, 3, 20_000);
    if (!t.allowed) return json({ error: "too_many_requests" }, 429);
    return json({ changed: await refreshCollabText(request, db, ownerId, localId) });
  });

/**
 * Brings the plain-text copy of a draft up to date from its room, if it is live. Whatever reads
 * the draft's text (a share link, GitHub, the owner's pull) calls this first. Returns whether it changed.
 */
export async function refreshCollabText(
  request: Request,
  db: Db,
  ownerId: string,
  localId: string,
): Promise<boolean> {
  const host = await getCollabHost(request, db);
  if (!host) return false;
  const docId = remoteId(ownerId, localId);
  const text = await host.text(docId);
  if (text === null) return false;
  const limits = await limitsFor(request, db, ownerId);
  return applyCollabText(db, docId, text, Date.now(), revisionConfig(request, limits.revisions));
}

/** Ends a draft's room for good: it was deleted. Everyone invited is let go and the room forgotten. */
export async function endCollab(request: Request, db: Db, docId: string) {
  const invited = await db
    .select({ key: documentEditors.emailKey })
    .from(documentEditors)
    .where(eq(documentEditors.documentId, docId));
  await dropEditors(db, docId);
  await notifyPeople(
    request,
    db,
    invited.map((e) => e.key),
  );
  const host = await getCollabHost(request, db);
  await host?.destroy(docId);
}

/**
 * Tells the accounts behind these addresses, wherever they have the studio open, that what is
 * shared with them changed, so their list is read again now and not at the next visit. Addresses
 * with no account are skipped; the event carries nothing about the draft.
 */
async function notifyPeople(request: Request, db: Db, emailKeys: string[]) {
  const keys = [...new Set(emailKeys.filter(Boolean))];
  if (!keys.length) return;
  const people = await db.select({ id: users.id }).from(users).where(inArray(users.emailKey, keys));
  for (const p of people) await publish(request, userTopic(p.id), { t: "collab" });
}
const keyOf = (address: string) => canonicalEmail(address) ?? "";

async function kickByAddress(request: Request, db: Db, docId: string, emailKey: string) {
  const [person] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailKey, emailKey));
  if (!person) return;
  const host = await getCollabHost(request, db);
  await host?.kick(docId, person.id);
}
