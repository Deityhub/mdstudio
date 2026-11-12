import { eq } from "drizzle-orm";
import { appSettings } from "../../../infra/db/schema";
import type { Db } from "../db";
import { forgetSharedLimits } from "../limits/cache";
import {
  LIMITS,
  parseChange,
  type LimitKey,
  type LimitValue,
  type Partials,
} from "../limits/catalog";

export const NOTICE_MAX = 300;

async function read<T>(db: Db, key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}
const write = (db: Db, key: string, value: unknown) =>
  db
    .insert(appSettings)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(value) } });

/** Limits an admin set for the whole server in the dashboard (they beat the environment variables). */
export async function getServerLimits(db: Db): Promise<Partials> {
  const raw = await read<Record<string, unknown>>(db, "limits", {});
  const out: Partials = {};
  for (const [k, v] of Object.entries(raw))
    if (k in LIMITS && parseChange(k, v) === v) out[k as LimitKey] = v as LimitValue;
  return out;
}

export type ServerSettings = {
  limits: Partials;
  signupsOpen: boolean;
  /** The kill switch for live editing: closed, no new connections to any room (open ones end in minutes). */
  collabOpen: boolean;
  notice: string | null;
};

/** Whether new accounts may be made, the site-wide notice, and the server-wide limit defaults. */
export async function getSettings(db: Db): Promise<ServerSettings> {
  return {
    limits: await getServerLimits(db),
    signupsOpen: (await read<unknown>(db, "signups_open", true)) !== false,
    collabOpen: (await read<unknown>(db, "collab_open", true)) !== false,
    notice: (await read<string | null>(db, "notice", null)) || null,
  };
}

/** Just what the pages need before anyone signs in. */
export const getPublicSettings = async (db: Db) => {
  const s = await getSettings(db);
  return { signupsOpen: s.signupsOpen, notice: s.notice };
};

/**
 * Changes some settings: `limits` (a value, or null to remove a server-wide default), `signupsOpen`
 * and `notice` (null or empty clears it). Everything is checked first, so a bad change changes nothing.
 */
export async function updateSettings(
  db: Db,
  patch: {
    limits?: Record<string, unknown>;
    signupsOpen?: unknown;
    collabOpen?: unknown;
    notice?: unknown;
  },
): Promise<{ ok: true } | { ok: false; error: "invalid" }> {
  const limits: [string, LimitValue | null][] = [];
  for (const [k, v] of Object.entries(patch.limits ?? {})) {
    const parsed = parseChange(k, v);
    if (parsed === "invalid") return { ok: false, error: "invalid" };
    limits.push([k, parsed]);
  }
  if (patch.signupsOpen !== undefined && typeof patch.signupsOpen !== "boolean")
    return { ok: false, error: "invalid" };
  if (patch.collabOpen !== undefined && typeof patch.collabOpen !== "boolean")
    return { ok: false, error: "invalid" };
  const notice = patch.notice;
  if (
    notice !== undefined &&
    notice !== null &&
    (typeof notice !== "string" || notice.length > NOTICE_MAX)
  )
    return { ok: false, error: "invalid" };
  if (limits.length) {
    const current: Record<string, LimitValue> = { ...(await getServerLimits(db)) };
    for (const [k, v] of limits) {
      if (v === null) delete current[k];
      else current[k] = v;
    }
    await write(db, "limits", current);
  }
  if (patch.signupsOpen !== undefined) await write(db, "signups_open", patch.signupsOpen);
  if (patch.collabOpen !== undefined) await write(db, "collab_open", patch.collabOpen);
  if (notice !== undefined) await write(db, "notice", (notice as string | null)?.trim() || null);
  forgetSharedLimits(db);
  return { ok: true };
}
