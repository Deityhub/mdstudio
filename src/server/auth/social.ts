// Signing in with a social provider (GitHub, Google), once the provider's own code has proved who
// the person is. The provider-specific files fetch the profile; this decides what it means.
import { and, eq, or } from "drizzle-orm";
import { emailTokens, oauthAccounts, sessions, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { getPublicSettings } from "../settings/service";
import { canonicalEmail } from "./email";
import { type PublicUser, firstAccountIsAdmin, startSession } from "./service";

export type SocialProvider = "github" | "google";
export type SocialProfile = {
  /** The provider's stable id for the person, never their email. */
  id: string;
  email: string | null;
  /** Whether the provider itself has confirmed the person owns the email. */
  verified: boolean;
  name: string | null;
  avatar: string | null;
};
export type SocialFailure = {
  error: "no_verified_email" | "email_in_use" | "suspended" | "signups_closed";
};

const asUser = (u: {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}): PublicUser => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl,
  emailVerified: true,
  isAdmin: u.role === "admin",
});

/**
 * 1. A known identity signs in. 2. Otherwise the provider must vouch for the email. 3. An account
 * with that email gets the identity added (the inbox is proven on both sides). 4. Else a new
 * account is made, if sign-ups are open.
 */
export async function socialSignIn(
  db: Db,
  provider: SocialProvider,
  profile: SocialProfile,
  now = Date.now(),
): Promise<{ user: PublicUser; token: string } | SocialFailure> {
  const columns = {
    id: users.id,
    email: users.email,
    displayName: users.displayName,
    avatarUrl: users.avatarUrl,
    emailVerifiedAt: users.emailVerifiedAt,
    role: users.role,
    suspendedAt: users.suspendedAt,
  };
  const [linked] = await db
    .select(columns)
    .from(oauthAccounts)
    .innerJoin(users, eq(users.id, oauthAccounts.userId))
    .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerUserId, profile.id)));
  if (linked) {
    if (linked.suspendedAt !== null) return { error: "suspended" };
    return startSession(
      db,
      { ...asUser(linked), emailVerified: linked.emailVerifiedAt !== null },
      now,
    );
  }

  const email = profile.verified ? profile.email?.toLowerCase() : null;
  const emailKey = email ? canonicalEmail(email) : null;
  if (!email || !emailKey) return { error: "no_verified_email" };

  const [existing] = await db
    .select(columns)
    .from(users)
    .where(or(eq(users.emailKey, emailKey), eq(users.email, email)));
  if (existing) {
    if (existing.suspendedAt !== null) return { error: "suspended" };
    if (existing.emailVerifiedAt === null) {
      // Sign-up with mail on does not confirm the address, so whoever made this account may have
      // done it for an address that is not theirs, with a password they know. The real owner is
      // here now: remove everything that person could use.
      await db
        .update(users)
        .set({ passwordHash: null, emailVerifiedAt: now, updatedAt: now })
        .where(eq(users.id, existing.id));
      await db.delete(sessions).where(eq(sessions.userId, existing.id));
      await db.delete(emailTokens).where(eq(emailTokens.userId, existing.id));
    }
    try {
      await db.insert(oauthAccounts).values({
        id: crypto.randomUUID(),
        userId: existing.id,
        provider,
        providerUserId: profile.id,
        createdAt: now,
      });
    } catch {
      return { error: "email_in_use" };
    }
    // a name or picture the account lacks is filled in; one it has is kept
    const fill = {
      displayName: existing.displayName ?? profile.name,
      avatarUrl: existing.avatarUrl ?? profile.avatar,
    };
    if (fill.displayName !== existing.displayName || fill.avatarUrl !== existing.avatarUrl)
      await db
        .update(users)
        .set({ ...fill, updatedAt: now })
        .where(eq(users.id, existing.id));
    return startSession(db, asUser({ ...existing, ...fill }), now);
  }

  // an admin can close sign-ups; a provider cannot be used to get round that
  if (!(await getPublicSettings(db)).signupsOpen) return { error: "signups_closed" };

  const id = crypto.randomUUID();
  try {
    await db.insert(users).values({
      id,
      email,
      emailKey,
      emailVerifiedAt: now,
      displayName: profile.name,
      avatarUrl: profile.avatar,
      role: firstAccountIsAdmin,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    return { error: "email_in_use" }; // two first sign-ins for one inbox raced
  }
  try {
    await db.insert(oauthAccounts).values({
      id: crypto.randomUUID(),
      userId: id,
      provider,
      providerUserId: profile.id,
      createdAt: now,
    });
  } catch {
    // no half-made account: it would block the address without being reachable
    await db.delete(users).where(eq(users.id, id));
    return { error: "email_in_use" };
  }
  const [made] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
  return startSession(
    db,
    asUser({
      id,
      email,
      displayName: profile.name,
      avatarUrl: profile.avatar,
      role: made?.role ?? "user",
    }),
    now,
  );
}
