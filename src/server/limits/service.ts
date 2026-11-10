import { eq } from "drizzle-orm";
import { users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { getServerLimits } from "../settings/service";
import { forgetSharedLimits, sharedLimits } from "./cache";
import { getPlan, listPlans } from "./plans";
import {
  DEFAULT_PLAN,
  LIMITS,
  parseChange,
  resolveLimits,
  type LimitKey,
  type LimitValue,
  type Limits,
  type Partials,
  type Source,
} from "./catalog";

export type EnvReader = (name: string) => string | undefined;

/** An account's own limits from its row: only known limits with allowed values, whatever else is stored. */
function readOverrides(text: string): Partials {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const out: Partials = {};
    for (const [k, v] of Object.entries(raw))
      if (k in LIMITS && parseChange(k, v) === v) out[k as LimitKey] = v as LimitValue;
    return out;
  } catch {
    return {};
  }
}

/** One read of the account's row, plus the plans and server defaults (shared, read once a minute). */
async function layers(db: Db, userId: string, now: number) {
  const [user] = await db
    .select({ plan: users.plan, limits: users.limits })
    .from(users)
    .where(eq(users.id, userId));
  const shared = await sharedLimits(db, now, async () => ({
    plans: await listPlans(db),
    server: await getServerLimits(db),
  }));
  const plan = user?.plan ?? DEFAULT_PLAN;
  return {
    exists: !!user,
    plan,
    overrides: readOverrides(user?.limits ?? "{}"),
    planLimits: shared.plans.find((p) => p.name === plan)?.limits ?? {},
    server: shared.server,
    planNames: shared.plans.map((p) => p.name),
  };
}

/** What this account may use, and where each value comes from. */
export async function getLimits(db: Db, env: EnvReader, userId: string, now = Date.now()) {
  const l = await layers(db, userId, now);
  return resolveLimits(env, { overrides: l.overrides, plan: l.planLimits, server: l.server });
}

/** An account's plan and limits for the admin (always read fresh), or null when there is no such account. */
export async function accountLimits(db: Db, env: EnvReader, userId: string) {
  forgetSharedLimits(db);
  const l = await layers(db, userId, Date.now());
  if (!l.exists) return null;
  const { values, sources } = resolveLimits(env, {
    overrides: l.overrides,
    plan: l.planLimits,
    server: l.server,
  });
  const limits = Object.fromEntries(
    (Object.keys(LIMITS) as LimitKey[]).map((k) => [
      k,
      { value: values[k] as LimitValue, source: sources[k] as Source },
    ]),
  ) as Record<LimitKey, { value: LimitValue; source: Source }>;
  return { plan: l.plan, limits, plans: l.planNames };
}

/**
 * Moves an account to a plan and/or sets or removes (null) its own limits, in one update of its row.
 * Everything is checked before anything is written, so a bad change changes nothing.
 */
export async function changeAccount(
  db: Db,
  userId: string,
  change: { plan?: string; limits?: Record<string, unknown> },
): Promise<{ ok: true } | { ok: false; error: "invalid" }> {
  if (change.plan !== undefined && !(await getPlan(db, change.plan)))
    return { ok: false, error: "invalid" };
  const parsed: [LimitKey, LimitValue | null][] = [];
  for (const [key, value] of Object.entries(change.limits ?? {})) {
    const v = parseChange(key, value);
    if (v === "invalid") return { ok: false, error: "invalid" };
    parsed.push([key as LimitKey, v]);
  }
  const [row] = await db.select({ limits: users.limits }).from(users).where(eq(users.id, userId));
  const next: Record<string, LimitValue> = { ...readOverrides(row?.limits ?? "{}") };
  for (const [key, value] of parsed) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  await db
    .update(users)
    .set({
      ...(change.plan !== undefined && { plan: change.plan }),
      ...(change.limits !== undefined && { limits: JSON.stringify(next) }),
      updatedAt: Date.now(),
    })
    .where(eq(users.id, userId));
  return { ok: true };
}

export type { Limits };
