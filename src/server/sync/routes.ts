import { withUser } from "../auth/guard";
import { sameOrigin } from "../auth/http";
import { parsePush, pullDocs, pushDocs } from "./service";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

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
    return json({ results: await pushDocs(db, user.id, docs) });
  });

export const pullHandler = (request: Request) =>
  withUser(request, async (user, db) => {
    const since = Number(new URL(request.url).searchParams.get("since") ?? 0);
    if (!Number.isInteger(since) || since < 0) return json({ error: "invalid" }, 400);
    return json(await pullDocs(db, user.id, since));
  });
