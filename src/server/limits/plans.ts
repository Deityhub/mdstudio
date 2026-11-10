import { eq } from "drizzle-orm";
import { plans, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { forgetSharedLimits } from "./cache";
import {
  DEFAULT_PLAN,
  LIMITS,
  parseChange,
  type LimitKey,
  type LimitValue,
  type Partials,
} from "./catalog";

export type Plan = { name: string; label: string; limits: Partials };

function parseLimits(raw: string): Partials {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Partials = {};
    for (const [k, v] of Object.entries(obj))
      if (k in LIMITS && parseChange(k, v) === v) out[k as LimitKey] = v as LimitValue;
    return out;
  } catch {
    return {};
  }
}

/** The plans an admin made, with "free" (which changes nothing) always first. */
export async function listPlans(db: Db): Promise<Plan[]> {
  const rows = await db.select().from(plans);
  return [
    { name: DEFAULT_PLAN, label: "Free", limits: {} },
    ...rows
      .filter((r) => r.name !== DEFAULT_PLAN)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({ name: r.name, label: r.label, limits: parseLimits(r.limits) })),
  ];
}

export async function getPlan(db: Db, name: string): Promise<Plan | null> {
  return (await listPlans(db)).find((p) => p.name === name) ?? null;
}

const NAME = /^[a-z][a-z0-9-]{0,29}$/;

/** Makes or changes a plan: a short lowercase name, a label and the limits it sets. "free" cannot change. */
export async function savePlan(
  db: Db,
  input: { name: unknown; label: unknown; limits: unknown },
  now = Date.now(),
): Promise<{ ok: true } | { ok: false; error: "invalid" }> {
  const { name, label } = input;
  if (typeof name !== "string" || !NAME.test(name) || name === DEFAULT_PLAN)
    return { ok: false, error: "invalid" };
  if (typeof label !== "string" || !label.trim() || label.length > 40)
    return { ok: false, error: "invalid" };
  const limits: Record<string, LimitValue> = {};
  const given = input.limits ?? {};
  if (typeof given !== "object" || given === null || Array.isArray(given))
    return { ok: false, error: "invalid" };
  for (const [k, v] of Object.entries(given)) {
    const parsed = parseChange(k, v);
    if (parsed === "invalid") return { ok: false, error: "invalid" };
    if (parsed !== null) limits[k] = parsed;
  }
  const row = { label: label.trim(), limits: JSON.stringify(limits), updatedAt: now };
  await db
    .insert(plans)
    .values({ name, ...row })
    .onConflictDoUpdate({ target: plans.name, set: row });
  forgetSharedLimits(db);
  return { ok: true };
}

/** Removes a plan nobody is on. */
export async function deletePlan(
  db: Db,
  name: string,
): Promise<{ ok: true } | { ok: false; error: "invalid" | "in_use" | "not_found" }> {
  if (name === DEFAULT_PLAN) return { ok: false, error: "invalid" };
  const [row] = await db.select().from(plans).where(eq(plans.name, name));
  if (!row) return { ok: false, error: "not_found" };
  const [onIt] = await db.select({ id: users.id }).from(users).where(eq(users.plan, name)).limit(1);
  if (onIt) return { ok: false, error: "in_use" };
  await db.delete(plans).where(eq(plans.name, name));
  forgetSharedLimits(db);
  return { ok: true };
}
