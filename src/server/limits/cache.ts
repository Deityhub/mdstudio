import type { Db } from "../db";
import type { Partials } from "./catalog";
import type { Plan } from "./plans";

/** What every account shares: the plans and the server-wide default limits. Both are a few rows. */
export type Shared = { plans: Plan[]; server: Partials };

const TTL_MS = 60_000;
// Per database handle, so tests (and any second database) never see each other's copy.
const copies = new WeakMap<Db, { at: number; shared: Shared }>();

/**
 * The shared part of limit resolution, read at most once a minute per server instance instead of on
 * every request. A change made in the dashboard forgets it at once on the instance that handled it;
 * other instances catch up within a minute.
 */
export async function sharedLimits(db: Db, now: number, load: () => Promise<Shared>) {
  const hit = copies.get(db);
  if (hit && now - hit.at < TTL_MS && now >= hit.at) return hit.shared;
  const shared = await load();
  copies.set(db, { at: now, shared });
  return shared;
}

export const forgetSharedLimits = (db: Db) => void copies.delete(db);
