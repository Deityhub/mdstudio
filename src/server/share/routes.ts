import { type SitemapEntry } from "@/lib/site/seo";
import { DEFAULT_SHARE_DAYS, MAX_SHARE_DAYS, shareUrl } from "@/lib/share/protocol";
import { withVerifiedUser } from "../auth/guard";
import { sameOrigin } from "../auth/http";
import { hit } from "../auth/limits";
import { getDb } from "../db";
import { getEnv, siteOrigin } from "../env";
import {
  type ShareConfig,
  extendShare,
  listShares,
  publishShare,
  revokeShare,
  sitemapShares,
} from "./service";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const HOUR = 3_600_000;
/** Publishing and changing expiry are limited per account, so a script cannot churn addresses. */
const CHANGES_PER_HOUR = 60;
/** The sitemap lists at most this many links, newest first. */
const SITEMAP_LIMIT = 5000;

const whole = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n >= 1 ? n : fallback;
};

/**
 * How long links last: SHARE_MAX_DAYS at most (7 unless set) and SHARE_DEFAULT_DAYS when the writer
 * does not choose (4 unless set, never more than the maximum). Every link expires.
 */
export function shareConfig(request: Request): ShareConfig {
  const maxDays = whole(getEnv(request, "SHARE_MAX_DAYS"), MAX_SHARE_DAYS);
  const defaultDays = Math.min(
    whole(getEnv(request, "SHARE_DEFAULT_DAYS"), DEFAULT_SHARE_DAYS),
    maxDays,
  );
  return { defaultDays, maxDays };
}

const withUrl = <T extends { slug: string }>(request: Request, share: T) => ({
  ...share,
  url: shareUrl(siteOrigin(request), share.slug),
});

const fail = (error: "not_found" | "invalid") => json({ error }, error === "not_found" ? 404 : 400);

const readBody = async (request: Request) => {
  try {
    return (await request.json()) as Record<string, unknown> | null;
  } catch {
    return null;
  }
};

export const listHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) => {
    const config = shareConfig(request);
    return json({
      shares: (await listShares(db, user.id)).map((s) => withUrl(request, s)),
      ...config,
    });
  });

export const publishHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const body = await readBody(request);
    if (typeof body?.["id"] !== "string") return fail("invalid");
    const days = body["days"];
    if (days !== undefined && typeof days !== "number") return fail("invalid");
    const t = await hit(db, `share:${user.id}`, CHANGES_PER_HOUR, HOUR);
    if (!t.allowed)
      return Response.json(
        { error: "too_many_requests" },
        {
          status: 429,
          headers: { "retry-after": String(t.retryAfter), "cache-control": "no-store" },
        },
      );
    const r = await publishShare(db, user.id, body["id"], days, shareConfig(request));
    return r.ok ? json({ share: withUrl(request, r.share), created: r.created }) : fail(r.error);
  });

export const extendHandler = (request: Request, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const body = await readBody(request);
    if (typeof body?.["days"] !== "number") return fail("invalid");
    const t = await hit(db, `share:${user.id}`, CHANGES_PER_HOUR, HOUR);
    if (!t.allowed)
      return Response.json(
        { error: "too_many_requests" },
        {
          status: 429,
          headers: { "retry-after": String(t.retryAfter), "cache-control": "no-store" },
        },
      );
    const r = await extendShare(db, user.id, localId, body["days"], shareConfig(request));
    return r.ok ? json({ share: withUrl(request, r.share) }) : fail(r.error);
  });

export const revokeHandler = (request: Request, localId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    return (await revokeShare(db, user.id, localId)) ? json({ ok: true }) : fail("not_found");
  });

/** Live links for the sitemap; empty when the database is not there, so the sitemap still works. */
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
