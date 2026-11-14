// What a signed-in person changes about their own account: the name shown to others, and the
// password. (The address and the linked sign-ins have their own files.)
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { emailTokens, sessions, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { hashPassword, verifyPassword } from "./password";
import type { PublicUser } from "./service";
import { sha256Hex } from "./tokens";

const Profile = z.object({ displayName: z.string().trim().max(60) });
const NewPassword = z.string().min(10).max(200);

export async function updateProfile(
  db: Db,
  userId: string,
  input: unknown,
  now = Date.now(),
): Promise<{ ok: true; user: Pick<PublicUser, "displayName"> } | { ok: false; error: "invalid" }> {
  const parsed = Profile.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const displayName = parsed.data.displayName || null;
  await db.update(users).set({ displayName, updatedAt: now }).where(eq(users.id, userId));
  return { ok: true, user: { displayName } };
}

/**
 * Sets a new password. An account that has one must give the current one (a stolen session alone
 * cannot change it); one that signs in only with GitHub or Google has none and may just set one.
 * Every other session of the account ends and its reset links stop working; this one stays.
 */
export async function changePassword(
  db: Db,
  userId: string,
  sessionToken: string,
  input: { current?: string; next: string },
  now = Date.now(),
): Promise<{ ok: true } | { ok: false; error: "wrong_password" | "invalid" | "same" }> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) return { ok: false, error: "invalid" };
  if (row.passwordHash) {
    if (!input.current || !(await verifyPassword(input.current, row.passwordHash)))
      return { ok: false, error: "wrong_password" };
    if (input.current === input.next) return { ok: false, error: "same" };
  }
  const parsed = NewPassword.safeParse(input.next);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data), updatedAt: now })
    .where(eq(users.id, userId));

  await Promise.all([
    db
      .delete(emailTokens)
      .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, "reset"))),
    db
      .delete(sessions)
      .where(
        and(eq(sessions.userId, userId), ne(sessions.tokenHash, await sha256Hex(sessionToken))),
      ),
  ]);
  return { ok: true };
}
