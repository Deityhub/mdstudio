import { integrationSchema } from "@/lib/ai/protocol";
import { withVerifiedUser } from "../auth/guard";
import {
  noStoreJson as json,
  readJson as readBody,
  sameOrigin,
  tooManyResponse as tooMany,
} from "../auth/http";
import { hit } from "../auth/limits";
import { listIntegrations, putIntegration, removeIntegration } from "./service";

const HOUR = 3_600_000;
/** Changes per account per hour: generous for a person, a wall for a script. */
const CHANGES_PER_HOUR = 300;

export const listHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) =>
    json({ integrations: await listIntegrations(db, user.id) }),
  );

/** Saves one integration. The id in the address must match the one in the body. */
export const putHandler = (request: Request, id: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const parsed = integrationSchema.safeParse(await readBody(request));
    if (!parsed.success || parsed.data.id !== id) return json({ error: "invalid" }, 400);
    const t = await hit(db, `ai:${user.id}`, CHANGES_PER_HOUR, HOUR);
    if (!t.allowed) return tooMany(t.retryAfter);
    const r = await putIntegration(db, user.id, parsed.data);
    return r.ok ? json({ integration: r.integration }) : json({ error: r.error }, 409);
  });

export const deleteHandler = (request: Request, id: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const t = await hit(db, `ai:${user.id}`, CHANGES_PER_HOUR, HOUR);
    if (!t.allowed) return tooMany(t.retryAfter);
    return (await removeIntegration(db, user.id, id))
      ? json({ ok: true })
      : json({ error: "not_found" }, 404);
  });
