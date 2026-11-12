import { type SitemapEntry } from "@/lib/site/seo";
import { shareUrl } from "@/lib/share/protocol";
import { withVerifiedUser } from "../auth/guard";
import {
  noStoreJson as json,
  readJson as readBody,
  sameOrigin,
  tooManyResponse as tooMany,
} from "../auth/http";
import { hit } from "../auth/limits";
import type { PublicUser } from "../auth/service";
import { type Db, getDb } from "../db";
import { refreshCollabText } from "../collab/routes";
import { limitsFor } from "../limits/request";
import type { Limits } from "../limits/catalog";
import { siteOrigin } from "../env";
import { publish, shareTopic, userTopic } from "../realtime/publish";
import type { RealtimeEvent } from "@/lib/realtime/protocol";
import { getMailer } from "../mail";
import { sendQuietly } from "../mail/quiet";
import { users } from "../../../infra/db/schema";
import { eq } from "drizzle-orm";
import {
  addComment,
  commentTarget,
  deleteComment,
  listComments,
  ownerComments,
  ownerDeleteComment,
  ownerResolveComment,
} from "./comments";
import { commentMail, inviteMail } from "./mail";
import { addPerson, listPeople, removePerson } from "./people";
import {
  type ShareConfig,
  findOwnShare,
  listShares,
  publishShare,
  revokeShare,
  sitemapShares,
  updateShare,
} from "./service";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The sitemap lists at most this many links, newest first. */
const SITEMAP_LIMIT = 5000;

/**
 * How long links last and whether private links are open to this account: all account limits
 * (`share_max_days`, `share_default_days`, `private_links`), so a plan can change them. A default
 * longer than the maximum is cut to it.
 */
export const shareConfig = (limits: Limits): ShareConfig => ({
  defaultDays: Math.min(limits.share_default_days, limits.share_max_days),
  maxDays: limits.share_max_days,
  privateLinks: limits.private_links,
});

const withUrl = <T extends { slug: string }>(request: Request, share: T) => ({
  ...share,
  url: shareUrl(siteOrigin(request), share.slug),
});

const STATUS = {
  not_found: 404,
  invalid: 400,
  unavailable: 403,
  forbidden: 403,
  limit_reached: 409,
} as const;
const fail = (error: keyof typeof STATUS) =>
  json({ error: error === "unavailable" ? "feature_unavailable" : error }, STATUS[error]);

// What the open pages and panels on a link are told: its own topic for the readers and the writer's
// comments panel, and the writer's account topic so their other devices refresh their list of links.
const tell = (request: Request, slug: string, event: RealtimeEvent) =>
  publish(request, shareTopic(slug), event);
const tellOwner = (request: Request, userId: string) =>
  publish(request, userTopic(userId), { t: "shares" });

// ---- the owner: links -------------------------------------------------------------------------

export const listHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) => {
    const config = shareConfig(await limitsFor(request, db, user.id));
    return json({
      shares: (await listShares(db, user.id)).map((s) => withUrl(request, s)),
      defaultDays: config.defaultDays,
      maxDays: config.maxDays,
      privateLinks: config.privateLinks,
    });
  });

export const publishHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const body = await readBody(request);
    if (typeof body?.["id"] !== "string") return fail("invalid");
    const days = body["days"];
    if (days !== undefined && typeof days !== "number") return fail("invalid");
    const limits = await limitsFor(request, db, user.id);
    const t = await hit(db, `share:${user.id}`, limits.share_changes_per_hour, HOUR);
    if (!t.allowed) return tooMany(t.retryAfter);
    const { access, comments } = body;
    // a draft edited live is published as its room has it now, not as the last saved copy
    await refreshCollabText(request, db, user.id, body["id"]);
    const r = await publishShare(db, user.id, body["id"], days, shareConfig(limits), Date.now(), {
      ...(access !== undefined && { access: access as "public" | "people" }),
      ...(comments !== undefined && { comments: comments as boolean }),
    });
    if (!r.ok) return fail(r.error);
    await tell(request, r.share.slug, { t: "share", change: r.created ? "settings" : "updated" });
    await tellOwner(request, user.id);
    return json({ share: withUrl(request, r.share), created: r.created });
  });

/** Changes a live link: `days`, `access` ("public" or "people") and `comments`, any of them. */
export const updateHandler = (request: Request, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const body = await readBody(request);
    if (!body) return fail("invalid");
    const limits = await limitsFor(request, db, user.id);
    const t = await hit(db, `share:${user.id}`, limits.share_changes_per_hour, HOUR);
    if (!t.allowed) return tooMany(t.retryAfter);
    const { days, access, comments } = body;
    const r = await updateShare(
      db,
      user.id,
      localId,
      {
        ...(days !== undefined && { days: days as number }),
        ...(access !== undefined && { access: access as "public" | "people" }),
        ...(comments !== undefined && { comments: comments as boolean }),
      },
      shareConfig(limits),
    );
    if (!r.ok) return fail(r.error);
    await tell(request, r.share.slug, { t: "share", change: "settings" });
    await tellOwner(request, user.id);
    return json({ share: withUrl(request, r.share) });
  });

export const revokeHandler = (request: Request, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const share = await findOwnShare(db, user.id, localId);
    if (!(await revokeShare(db, user.id, localId))) return fail("not_found");
    if (share) await tell(request, share.slug, { t: "share", change: "revoked" });
    await tellOwner(request, user.id);
    return json({ ok: true });
  });

// ---- the owner: people ------------------------------------------------------------------------

export const peopleListHandler = (request: Request, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    const people = await listPeople(db, user.id, localId);
    return people ? json({ people }) : fail("not_found");
  });

/** Adds an address to a private link and emails it. The answer never says whether it has an account. */
export const peopleAddHandler = (request: Request, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const limits = await limitsFor(request, db, user.id);
    if (!limits.private_links) return fail("unavailable");
    const body = await readBody(request);
    if (typeof body?.["email"] !== "string") return fail("invalid");
    const before = (await listPeople(db, user.id, localId))?.length ?? 0;
    const t = await hit(db, `invite:${user.id}`, limits.invites_per_day, DAY);
    if (!t.allowed) return tooMany(t.retryAfter);
    const r = await addPerson(db, user.id, localId, body["email"]);
    if (!r.ok) return fail(r.error);
    // only a new address is emailed, so adding the same one again cannot be used to send mail
    let emailed = false;
    const share = await findOwnShare(db, user.id, localId);
    if (r.people.length > before && share && (share.expiresAt ?? 0) > Date.now())
      emailed = await sendQuietly(
        request,
        inviteMail(
          siteOrigin(request),
          share.slug,
          share.title,
          body["email"].trim().toLowerCase(),
          user.displayName ?? "",
          share.expiresAt ?? 0,
        ),
      );
    return json({ people: r.people, emailed });
  });

export const personRemoveHandler = (request: Request, localId: string, personId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    return (await removePerson(db, user.id, localId, personId))
      ? json({ ok: true })
      : fail("not_found");
  });

// ---- the owner: comments ----------------------------------------------------------------------

export const ownerCommentsHandler = (request: Request, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    const comments = await ownerComments(db, user.id, localId);
    return comments ? json({ comments }) : fail("not_found");
  });

export const ownerCommentHandler = (request: Request, localId: string, commentId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const slug = (await findOwnShare(db, user.id, localId))?.slug;
    if (request.method === "DELETE") {
      if (!(await ownerDeleteComment(db, user.id, localId, commentId))) return fail("not_found");
      if (slug) await tell(request, slug, { t: "comment_deleted", id: commentId });
      return json({ ok: true });
    }
    const body = await readBody(request);
    if (typeof body?.["resolved"] !== "boolean") return fail("invalid");
    const resolved = body["resolved"];
    if (!(await ownerResolveComment(db, user.id, localId, commentId, resolved)))
      return fail("not_found");
    if (slug) await tell(request, slug, { t: "comment_resolved", id: commentId, resolved });
    return json({ ok: true });
  });

// ---- readers: comments ------------------------------------------------------------------------

export const commentsListHandler = (request: Request, address: string) =>
  withVerifiedUser(request, async (user, db) => {
    const r = await listComments(db, user, address);
    return r.ok ? json({ comments: r.comments }) : fail("not_found");
  });

export const commentsAddHandler = (request: Request, address: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const body = await readBody(request);
    if (!body) return fail("invalid");
    const t = await hit(
      db,
      `comment:${user.id}`,
      (await limitsFor(request, db, user.id)).comments_per_hour,
      HOUR,
    );
    if (!t.allowed) return tooMany(t.retryAfter);
    const r = await addComment(db, user, address, {
      body: body["body"] as string,
      line: body["line"] as number,
      ...(typeof body["snippet"] === "string" && { snippet: body["snippet"] }),
      ...(typeof body["parentId"] === "string" && { parentId: body["parentId"] }),
    });
    if (!r.ok) return fail(r.error);
    await notifyOwner(request, db, user, address, r.comment.author);
    // everyone listening on the link sees it now; "mine" is each viewer's own to work out
    await tell(request, address, { t: "comment", comment: { ...r.comment, mine: false } });
    return json({ comment: r.comment });
  });

export const commentDeleteHandler = (request: Request, address: string, commentId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    if (!(await deleteComment(db, user, address, commentId))) return fail("not_found");
    await tell(request, address, { t: "comment_deleted", id: commentId });
    return json({ ok: true });
  });

/** At most one email an hour per link tells the writer something was said, and never what. */
async function notifyOwner(
  request: Request,
  db: Db,
  author: PublicUser,
  address: string,
  name: string,
) {
  const target = await commentTarget(db, address);
  if (!target) return;
  const ownerId = target.documentId.slice(0, target.documentId.indexOf(":"));
  if (ownerId === author.id) return;
  const t = await hit(db, `notify:${target.id}`, 1, HOUR);
  if (!t.allowed) return;
  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, ownerId));
  if (owner)
    await sendQuietly(
      request,
      commentMail(siteOrigin(request), address, target.title, name, owner.email),
    );
}

// ---- the sitemap ------------------------------------------------------------------------------

/** Live public links for the sitemap; empty when the database is not there, so it still works. */
export async function sitemapShareEntries(request: Request): Promise<SitemapEntry[]> {
  try {
    const rows = await sitemapShares(await getDb(request), Date.now(), SITEMAP_LIMIT);
    return rows.map((r) => ({
      path: `/s/${r.slug}`,
      lastmod: new Date(r.updatedAt).toISOString().slice(0, 10),
    }));
  } catch (error) {
    console.error("Couldn't list share links for the sitemap", error);
    return [];
  }
}
