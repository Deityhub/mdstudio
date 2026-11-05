import { withVerifiedUser } from "../auth/guard";
import { getEnv } from "../env";
import { remoteId } from "@/lib/sync/protocol";
import { DEFAULT_REVISIONS, type RevisionConfig, getRevision, listRevisions } from "./service";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const whole = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * How much history the server keeps: MAX_REVISIONS versions per draft (10 unless set, 0 switches it
 * off) and at most one automatic version per REVISION_INTERVAL_MINUTES (5 unless set).
 */
export const revisionConfig = (request: Request): RevisionConfig => ({
  max: Math.floor(whole(getEnv(request, "MAX_REVISIONS"), DEFAULT_REVISIONS.max)),
  intervalMs:
    whole(getEnv(request, "REVISION_INTERVAL_MINUTES"), DEFAULT_REVISIONS.intervalMs / 60_000) *
    60_000,
});

/** A draft id from the URL is only ever read inside the caller's own namespace. */
const own = (userId: string, id: string) => id.startsWith(remoteId(userId, ""));

export const listHandler = (request: Request, documentId: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!own(user.id, documentId)) return json({ revisions: [] });
    return json({
      revisions: await listRevisions(db, user.id, documentId),
      max: revisionConfig(request).max,
    });
  });

export const getHandler = (request: Request, documentId: string, revisionId: string) =>
  withVerifiedUser(request, async (user, db) => {
    const found = own(user.id, documentId)
      ? await getRevision(db, user.id, documentId, revisionId)
      : null;
    return found ? json({ revision: found }) : json({ error: "not_found" }, 404);
  });
