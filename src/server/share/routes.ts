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
import { limitsFor } from "../limits/request";
import type { Limits } from "../limits/catalog";
import { siteOrigin } from "../env";
import { getMailer } from "../mail";
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

/** Mail is best effort: a missing provider or a failure never undoes what the writer did. */
async function sendQuietly(
  request: Request,
  mail: Parameters<NonNullable<Awaited<ReturnType<typeof getMailer>>>>[0],
) {
  try {
    const mailer = await getMailer(request);
    if (!mailer) return false;
    await mailer(mail);
    return true;
  } catch (error) {
    console.error("Couldn't send a share email", error);
    return false;
  }
}

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
    const r = await publishShare(db, user.id, body["id"], days, shareConfig(limits), Date.now(), {
      ...(access !== undefined && { access: access as "public" | "people" }),
      ...(comments !== undefined && { comments: comments as boolean }),
    });
    return r.ok ? json({ share: withUrl(request, r.share), created: r.created }) : fail(r.error);
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
    return r.ok ? json({ share: withUrl(request, r.share) }) : fail(r.error);
  });

export const revokeHandler = (request: Request, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    return (await revokeShare(db, user.id, localId)) ? json({ ok: true }) : fail("not_found");
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
    if (request.method === "DELETE")
      return (await ownerDeleteComment(db, user.id, localId, commentId))
        ? json({ ok: true })
        : fail("not_found");
    const body = await readBody(request);
    if (typeof body?.["resolved"] !== "boolean") return fail("invalid");
    return (await ownerResolveComment(db, user.id, localId, commentId, body["resolved"]))
      ? json({ ok: true })
      : fail("not_found");
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
    return json({ comment: r.comment });
  });

export const commentDeleteHandler = (request: Request, address: string, commentId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    return (await deleteComment(db, user, address, commentId))
      ? json({ ok: true })
      : fail("not_found");
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
