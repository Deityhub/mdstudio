import { withUser } from "../auth/guard";
import { sameOrigin } from "../auth/http";
import { getEnv } from "../env";
import { DEFAULT_CLOUD_LIMIT } from "@/lib/sync/protocol";
import { parsePush, pullDocs, pushDocs } from "./service";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** How many drafts one account may keep in the cloud: MAX_CLOUD_DOCS, else 5. */
const cloudLimit = (request: Request) => {
  const n = Number(getEnv(request, "MAX_CLOUD_DOCS"));
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_CLOUD_LIMIT;
};

/** Clients batch their pushes under this; larger bodies are refused before parsing. */
export const MAX_BODY = 5_000_000;

export const pushHandler = (request: Request) =>
  withUser(request, async (user, db) => {
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
    return json({ results: await pushDocs(db, user.id, docs, Date.now(), cloudLimit(request)) });
  });

export const pullHandler = (request: Request) =>
  withUser(request, async (user, db) => {
    const since = Number(new URL(request.url).searchParams.get("since") ?? 0);
    if (!Number.isInteger(since) || since < 0) return json({ error: "invalid" }, 400);
    return json({ ...(await pullDocs(db, user.id, since)), limit: cloudLimit(request) });
  });
