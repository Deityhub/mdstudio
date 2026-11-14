// The GitHub and Google identities of an account: which are linked, linking another (from a
// signed-in session, whatever email the provider has) and unlinking one. Signing in with a
// provider is in social.ts.
import { and, eq } from "drizzle-orm";
import { oauthAccounts, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import type { SocialProfile, SocialProvider } from "./social";

export async function linkedProviders(db: Db, userId: string): Promise<SocialProvider[]> {
  const rows = await db
    .select({ provider: oauthAccounts.provider })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, userId));
  return rows.map((r) => r.provider as SocialProvider).sort();
}

/**
 * Adds the identity to the account. The person is proven twice: signed in here, and signed in at
 * the provider just now. An identity belongs to one account, and an account has one per provider.
 */
export async function linkSocial(
  db: Db,
  provider: SocialProvider,
  profile: SocialProfile,
  userId: string,
  now = Date.now(),
): Promise<{ ok: true } | { ok: false; error: "already_linked" | "provider_taken" }> {
  const [known] = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerUserId, profile.id)));
  if (known) return known.userId === userId ? { ok: true } : { ok: false, error: "already_linked" };
  const [mine] = await db
    .select({ id: oauthAccounts.id })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, provider)));
  if (mine) return { ok: false, error: "provider_taken" };
  try {
    await db.insert(oauthAccounts).values({
      id: crypto.randomUUID(),
      userId,
      provider,
      providerUserId: profile.id,
      createdAt: now,
    });
  } catch {
    return { ok: false, error: "already_linked" }; // two links of one identity raced
  }
  // a name or picture the account lacks is filled in; one it has is kept
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (row && (!row.displayName || !row.avatarUrl))
    await db
      .update(users)
      .set({
        displayName: row.displayName ?? profile.name,
        avatarUrl: row.avatarUrl ?? profile.avatar,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
  return { ok: true };
}

/** Removes a provider, unless it is the account's last way to sign in. */
export async function unlinkSocial(
  db: Db,
  provider: SocialProvider,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: "not_linked" | "last_method" }> {
  const linked = await linkedProviders(db, userId);
  if (!linked.includes(provider)) return { ok: false, error: "not_linked" };
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId));
  if (!row?.passwordHash && linked.length < 2) return { ok: false, error: "last_method" };
  await db
    .delete(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, provider)));
  return { ok: true };
}
