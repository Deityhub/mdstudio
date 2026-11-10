import { withVerifiedUser } from "../auth/guard";
import { sameOrigin } from "../auth/http";
import { limitsFor } from "../limits/request";
import { revisionConfig } from "../revisions/routes";
import { parsePush, pullDocs, pushDocs } from "./service";

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
    return json({
      results: await pushDocs(
        db,
        user.id,
        docs,
        Date.now(),
        limits.cloud_docs,
        revisionConfig(request, limits.revisions),
      ),
    });
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
