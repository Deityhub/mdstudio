// Account and session logic, independent of HTTP so it can be tested against a real database.
// Sessions are database rows, not JWTs (ADR 10): revoking one takes effect immediately.
import { and, eq, gt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { sessions, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { canonicalEmail } from "./email";
import { hashPassword, needsRehash, verifyPassword } from "./password";

export const SESSION_MS = 24 * 60 * 60 * 1000;
// A session never outlives this, however active the user is: after it, sign in again.
export const SESSION_MAX_MS = 5 * SESSION_MS;

const Credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).max(200),
});

export type PublicUser = {
  id: string;
  email: string;
  displayName: string | null;
  /** True once the address was confirmed, or when this server sends no mail to confirm with. */
  emailVerified: boolean;
  /** May use the admin dashboard. The first account ever made is an admin. */
  isAdmin: boolean;
  /** The picture a social sign-in brought, shown in the account menu. */
  avatarUrl?: string | null;
  /** False for an account that only signs in with GitHub or Google (it may set a password). */
  hasPassword?: boolean;
};
type Signed = { user: PublicUser; token: string };

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const publicUser = (u: {
  id: string;
  email: string;
  displayName: string | null;
  emailVerifiedAt: number | null;
  role?: string;
  avatarUrl?: string | null;
  passwordHash?: string | null;
}): PublicUser => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  emailVerified: u.emailVerifiedAt !== null,
  isAdmin: u.role === "admin",
  avatarUrl: u.avatarUrl ?? null,
  ...(u.passwordHash !== undefined && { hasPassword: u.passwordHash !== null }),
});

/** The role a new account gets: admin when it is the very first account, in one statement so two sign-ups cannot both win. */
export const firstAccountIsAdmin = sql<string>`CASE WHEN (SELECT COUNT(*) FROM users) = 0 THEN 'admin' ELSE 'user' END`;

export async function startSession(db: Db, user: PublicUser, now: number): Promise<Signed> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: tokenHash,
    expiresAt: now + SESSION_MS,
    createdAt: now,
  });
  return { user, token };
}

export async function signup(
  db: Db,
  input: unknown,
  now = Date.now(),
  opts: { verifyByEmail?: boolean } = {},
): Promise<Signed | { error: "invalid" | "email_taken" }> {
  const parsed = Credentials.safeParse(input);
  const emailKey = parsed.success ? canonicalEmail(parsed.data.email) : null;
  if (!parsed.success || !emailKey) return { error: "invalid" };
  const { email, password } = parsed.data;
  // The inbox is the identity: spellings that reach the same mailbox are the same account.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.emailKey, emailKey), eq(users.email, email)));
  if (existing) return { error: "email_taken" };
  // With no way to send mail there is nothing to confirm the address with, so it counts as confirmed.
  const emailVerifiedAt = opts.verifyByEmail ? null : now;
  const user = { id: crypto.randomUUID(), email, displayName: null, emailVerifiedAt };
  const passwordHash = await hashPassword(password);
  try {
    await db.insert(users).values({
      ...user,
      emailKey,
      passwordHash,
      role: firstAccountIsAdmin,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    // Two signups for one inbox raced; the unique index let only one through.
    return { error: "email_taken" };
  }
  const [made] = await db.select({ role: users.role }).from(users).where(eq(users.id, user.id));
  return startSession(db, publicUser({ ...user, passwordHash, role: made?.role ?? "user" }), now);
}

// Verified against this when the email is unknown, so both failures take the same time.
let decoy: Promise<string> | undefined;

export async function login(
  db: Db,
  input: unknown,
  now = Date.now(),
): Promise<Signed | { error: "invalid_credentials" | "suspended" }> {
  const parsed = Credentials.safeParse(input);
  if (!parsed.success) return { error: "invalid_credentials" };
  const { email, password } = parsed.data;
  const emailKey = canonicalEmail(email);
  const [row] = await db
    .select()
    .from(users)
    .where(
      emailKey ? or(eq(users.emailKey, emailKey), eq(users.email, email)) : eq(users.email, email),
    );
  const hash = row?.passwordHash ?? (await (decoy ??= hashPassword("decoy")));
  const ok = await verifyPassword(password, hash);
  if (!row || !row.passwordHash || !ok) return { error: "invalid_credentials" };
  // said only after the password was right, so it never tells a stranger that an address exists
  if (row.suspendedAt !== null) return { error: "suspended" };
  // Accounts from before the key existed get one the first time they sign in.
  if (!row.emailKey && emailKey)
    await db
      .update(users)
      .set({ emailKey: canonicalEmail(row.email) ?? emailKey })
      .where(eq(users.id, row.id))
      .catch(() => undefined);
  if (needsRehash(row.passwordHash))
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password), updatedAt: now })
      .where(eq(users.id, row.id));
  return startSession(db, publicUser(row), now);
}

/**
 * The signed-in user for a token, or null. Sessions slide: once less than half the lifetime is
 * left, use pushes the expiry a full lifetime out, so someone who keeps working is not signed out,
 * and the write happens at most about every 12 hours rather than on every request. The expiry
 * never passes SESSION_MAX_MS after sign-in.
 */
export async function userForToken(
  db: Db,
  token: string,
  now = Date.now(),
): Promise<{ user: PublicUser; expiresAt: number } | null> {
  const tokenHash = await sha256Hex(token);
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      passwordHash: users.passwordHash,
      emailVerifiedAt: users.emailVerifiedAt,
      role: users.role,
      suspendedAt: users.suspendedAt,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)));
  // a suspended account's sessions stop working at once
  if (!row || row.suspendedAt !== null) return null;
  let { expiresAt } = row;
  const slid = Math.min(now + SESSION_MS, row.createdAt + SESSION_MAX_MS);
  if (expiresAt - now < SESSION_MS / 2 && slid > expiresAt) {
    expiresAt = slid;
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.tokenHash, tokenHash));
  }
  return { user: publicUser(row), expiresAt };
}

export async function logout(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, await sha256Hex(token)));
}
