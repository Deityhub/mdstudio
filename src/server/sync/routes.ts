import { withVerifiedUser } from "../auth/guard";
import { sameOrigin } from "../auth/http";
import { limitsFor } from "../limits/request";
import { endCollab } from "../collab/routes";
import { publishDocs } from "../realtime/publish";
import { revisionConfig } from "../revisions/routes";
import { type ServerDoc, parsePush, pullDocs, pushDocs } from "./service";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Clients batch their pushes under this; larger bodies are refused before parsing. */
export const MAX_BODY = 5_000_000;

export const pushHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: "too_large" }, 413);
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      // falls through to the validation error
    }
    const docs = parsePush(body);
    if (!docs) return json({ error: "invalid" }, 400);
    // how many drafts and versions this account may keep (its plan and own limits apply)
    const limits = await limitsFor(request, db, user.id);
    const changed: ServerDoc[] = [];
    const results = await pushDocs(
      db,
      user.id,
      docs,
      Date.now(),
      limits.cloud_docs,
      revisionConfig(request, limits.revisions),
      changed,
    );
    // the account's other devices hear about it now, instead of at their next poll
    await publishDocs(request, user.id, changed);
    // a live draft that was deleted: its room, and everyone invited, end with it
    for (const doc of changed) if (doc.deleted && doc.collab) await endCollab(request, db, doc.id);
    return json({ results });
  });

export const pullHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) => {
    const since = Number(new URL(request.url).searchParams.get("since") ?? 0);
    if (!Number.isInteger(since) || since < 0) return json({ error: "invalid" }, 400);
    return json({
      ...(await pullDocs(db, user.id, since)),
      limit: (await limitsFor(request, db, user.id)).cloud_docs,
    });
  });
