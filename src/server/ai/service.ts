import { and, asc, eq } from "drizzle-orm";
import { type CloudIntegration } from "@/lib/ai/protocol";
import { aiIntegrations } from "../../../infra/db/schema";
import type { Db } from "../db";

const rowId = (userId: string, id: string) => `${userId}:${id}`;

type Row = typeof aiIntegrations.$inferSelect;
const toIntegration = (r: Row): CloudIntegration => ({
  id: r.id.slice(r.id.indexOf(":") + 1),
  name: r.name,
  provider: r.provider as CloudIntegration["provider"],
  baseUrl: r.baseUrl,
  models: JSON.parse(r.models) as string[],
  updatedAt: r.updatedAt,
});

/** The account's integrations, oldest change first. */
export async function listIntegrations(db: Db, userId: string): Promise<CloudIntegration[]> {
  const rows = await db
    .select()
    .from(aiIntegrations)
    .where(eq(aiIntegrations.userId, userId))
    .orderBy(asc(aiIntegrations.updatedAt), asc(aiIntegrations.id));
  return rows.map(toIntegration);
}

/**
 * Saves one integration (new or changed). An older copy than the one stored is ignored, so two
 * devices cannot undo each other's later change; the stored copy comes back either way.
 */
export async function putIntegration(
  db: Db,
  userId: string,
  item: CloudIntegration,
  /** How many the account may keep (an account limit). */
  limit: number,
): Promise<{ ok: true; integration: CloudIntegration } | { ok: false; error: "limit_reached" }> {
  const id = rowId(userId, item.id);
  const [existing] = await db.select().from(aiIntegrations).where(eq(aiIntegrations.id, id));
  if (existing && existing.updatedAt > item.updatedAt)
    return { ok: true, integration: toIntegration(existing) };
  const values = {
    name: item.name,
    provider: item.provider,
    baseUrl: item.baseUrl,
    models: JSON.stringify(item.models),
    updatedAt: item.updatedAt,
  };
  if (existing) await db.update(aiIntegrations).set(values).where(eq(aiIntegrations.id, id));
  else {
    const count = (
      await db
        .select({ id: aiIntegrations.id })
        .from(aiIntegrations)
        .where(eq(aiIntegrations.userId, userId))
    ).length;
    if (count >= limit) return { ok: false, error: "limit_reached" };
    await db.insert(aiIntegrations).values({ id, userId, ...values });
  }
  return { ok: true, integration: item };
}

/** Removes one; false when the account has none by that id. */
export async function removeIntegration(db: Db, userId: string, id: string): Promise<boolean> {
  const where = and(eq(aiIntegrations.id, rowId(userId, id)), eq(aiIntegrations.userId, userId));
  const [row] = await db.select({ id: aiIntegrations.id }).from(aiIntegrations).where(where);
  if (!row) return false;
  await db.delete(aiIntegrations).where(where);
  return true;
}
