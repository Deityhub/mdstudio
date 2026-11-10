// HTTP side of the admin dashboard. Every handler is for a signed-in admin only (anyone else gets a
// plain 404), writes check the origin, and every change is written to the audit log.
import { withAdmin } from "../auth/guard";
import { noStoreJson as json, readJson, sameOrigin } from "../auth/http";
import type { PublicUser } from "../auth/service";
import { getStore } from "../assets/store";
import type { Db } from "../db";
import { getEnv } from "../env";
import { LIMITS, resolveLimits } from "../limits/catalog";
import { deletePlan, listPlans, savePlan } from "../limits/plans";
import { getSettings, updateSettings } from "../settings/service";
import {
  audit,
  deleteUser,
  listAudit,
  listUsers,
  overview,
  removeDraft,
  removeImage,
  removeShare,
  signOutEverywhere,
  updateUser,
  userContent,
  userDetail,
} from "./service";

const PAGE = 25;
const num = (v: string | null, fallback: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, max) : fallback;
};
const env = (request: Request) => (name: string) => getEnv(request, name);
const who = (u: PublicUser) => ({ id: u.id, email: u.email });
const ERRORS = {
  invalid: 400,
  not_found: 404,
  self: 409,
  last_admin: 409,
  in_use: 409,
} as const;
const fail = (error: keyof typeof ERRORS) => json({ error }, ERRORS[error]);

/** What the page needs to draw the limit controls: each limit's type, and what applies with no override. */
const catalog = (request: Request) => {
  const { values, sources } = resolveLimits(env(request), {});
  return Object.fromEntries(
    (Object.keys(LIMITS) as (keyof typeof LIMITS)[]).map((k) => [
      k,
      { type: LIMITS[k].type, base: values[k], baseSource: sources[k] },
    ]),
  );
};

/** A read-only handler for admins. */
const read =
  (run: (request: Request, user: PublicUser, db: Db) => Promise<Response>) => (request: Request) =>
    withAdmin(request, (user, db) => run(request, user, db));

/** A handler that changes something: it must come from this site, and it is audited by `run`. */
const write =
  (run: (request: Request, user: PublicUser, db: Db) => Promise<Response>) => (request: Request) =>
    withAdmin(request, async (user, db) =>
      sameOrigin(request) ? run(request, user, db) : json({ error: "forbidden" }, 403),
    );

const target = async (db: Db, id: string) => {
  const d = await userDetail(db, () => undefined, id);
  return d ? { id, email: d.account.email } : null;
};

export const overviewHandler = read(async (_r, _u, db) => json({ overview: await overview(db) }));

export const usersHandler = read(async (request, _u, db) => {
  const url = new URL(request.url);
  const page = num(url.searchParams.get("page"), 0, 100_000);
  const result = await listUsers(db, {
    q: (url.searchParams.get("q") ?? "").slice(0, 100),
    limit: PAGE,
    offset: page * PAGE,
  });
  return json({ ...result, page, pageSize: PAGE });
});

export const userHandler = (request: Request, id: string) =>
  read(async (r, _u, db) => {
    const detail = await userDetail(db, env(r), id);
    return detail ? json({ ...detail, catalog: catalog(r) }) : fail("not_found");
  })(request);

export const updateUserHandler = (request: Request, id: string) =>
  write(async (r, actor, db) => {
    const body = await readJson(r);
    if (!body) return fail("invalid");
    const who_ = await target(db, id);
    const result = await updateUser(db, actor.id, id, body);
    if (!result.ok) return fail(result.error);
    await audit(db, who(actor), "user.update", who_ ?? undefined, body);
    return json({ ...(await userDetail(db, env(r), id)), catalog: catalog(r) });
  })(request);

export const deleteUserHandler = (request: Request, id: string) =>
  write(async (r, actor, db) => {
    const who_ = await target(db, id);
    const result = await deleteUser(db, await getStore(r), actor.id, id);
    if (!result.ok) return fail(result.error);
    await audit(db, who(actor), "user.delete", who_ ?? undefined);
    return json({ ok: true });
  })(request);

export const signOutHandler = (request: Request, id: string) =>
  write(async (_r, actor, db) => {
    const who_ = await target(db, id);
    if (!who_) return fail("not_found");
    const ended = await signOutEverywhere(db, id);
    await audit(db, who(actor), "user.sign_out", who_, { sessions: ended });
    return json({ ended });
  })(request);

export const contentHandler = (request: Request, id: string) =>
  read(async (_r, _u, db) =>
    (await target(db, id)) ? json(await userContent(db, id)) : fail("not_found"),
  )(request);

/** Removes one thing an account holds: `kind` is `shares`, `images` or `drafts`. */
export const removeContentHandler = (request: Request, id: string, kind: string, item: string) =>
  write(async (r, actor, db) => {
    const who_ = await target(db, id);
    if (!who_) return fail("not_found");
    let done = false;
    if (kind === "shares") done = await removeShare(db, id, item);
    else if (kind === "drafts") done = await removeDraft(db, id, item);
    else if (kind === "images") {
      const store = await getStore(r);
      done = store ? await removeImage(db, store, id, item) : false;
    } else return fail("invalid");
    if (!done) return fail("not_found");
    await audit(db, who(actor), `${kind.slice(0, -1)}.remove`, who_, { id: item });
    return json({ ok: true });
  })(request);

export const plansHandler = read(async (r, _u, db) =>
  json({ plans: await listPlans(db), catalog: catalog(r) }),
);

export const savePlanHandler = write(async (r, actor, db) => {
  const body = await readJson(r);
  if (!body) return fail("invalid");
  const result = await savePlan(db, body as never);
  if (!result.ok) return fail(result.error);
  await audit(db, who(actor), "plan.save", undefined, body);
  return json({ plans: await listPlans(db) });
});

export const deletePlanHandler = (request: Request, name: string) =>
  write(async (_r, actor, db) => {
    const result = await deletePlan(db, name);
    if (!result.ok) return fail(result.error);
    await audit(db, who(actor), "plan.delete", undefined, { name });
    return json({ ok: true });
  })(request);

export const settingsHandler = read(async (r, _u, db) =>
  json({ settings: await getSettings(db), catalog: catalog(r) }),
);

export const updateSettingsHandler = write(async (r, actor, db) => {
  const body = await readJson(r);
  if (!body) return fail("invalid");
  const result = await updateSettings(db, body);
  if (!result.ok) return fail(result.error);
  await audit(db, who(actor), "settings.update", undefined, body);
  return json({ settings: await getSettings(db), catalog: catalog(r) });
});

export const auditHandler = read(async (request, _u, db) => {
  const page = num(new URL(request.url).searchParams.get("page"), 0, 100_000);
  return json({
    ...(await listAudit(db, { limit: PAGE, offset: page * PAGE })),
    page,
    pageSize: PAGE,
  });
});
