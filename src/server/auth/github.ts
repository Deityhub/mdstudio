// GitHub OAuth (authorization code + PKCE). Only the account's id, name, avatar and verified email
// are used; the access token is never stored, it lives for the two calls made in the callback.
import { eq, or } from "drizzle-orm";
import { oauthAccounts, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { canonicalEmail } from "./email";
import { type PublicUser, startSession } from "./service";

export type GithubConfig = { clientId: string; clientSecret: string };
type Failure = { error: "github_failed" | "no_verified_email" | "email_in_use" };

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

export async function pkcePair() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

export const randomState = () => b64url(crypto.getRandomValues(new Uint8Array(16)));

export const authorizeUrl = (
  cfg: GithubConfig,
  redirectUri: string,
  state: string,
  challenge: string,
) =>
  "https://github.com/login/oauth/authorize?" +
  new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

const api = (token: string) => ({
  headers: {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "mdstudio",
  },
});

export async function githubSignIn(
  db: Db,
  cfg: GithubConfig,
  input: { code: string; verifier: string; redirectUri: string },
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
): Promise<{ user: PublicUser; token: string } | Failure> {
  const tokenRes = await fetchFn("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    }),
  });
  const accessToken = tokenRes.ok
    ? ((await tokenRes.json()) as { access_token?: unknown }).access_token
    : null;
  if (typeof accessToken !== "string") return { error: "github_failed" };

  const [profileRes, emailsRes] = await Promise.all([
    fetchFn("https://api.github.com/user", api(accessToken)),
    fetchFn("https://api.github.com/user/emails", api(accessToken)),
  ]);
  if (!profileRes.ok || !emailsRes.ok) return { error: "github_failed" };
  const profile = (await profileRes.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    avatar_url?: string;
  };
  const emails = (await emailsRes.json()) as {
    email: string;
    primary: boolean;
    verified: boolean;
  }[];
  if (typeof profile.id !== "number") return { error: "github_failed" };

  const providerUserId = String(profile.id);
  const [linked] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(oauthAccounts)
    .innerJoin(users, eq(users.id, oauthAccounts.userId))
    .where(eq(oauthAccounts.providerUserId, providerUserId));
  if (linked)
    return startSession(db, { ...linked, emailVerified: linked.emailVerifiedAt !== null }, now);

  const verified = emails.filter((e) => e.verified);
  const email = (verified.find((e) => e.primary) ?? verified[0])?.email.toLowerCase();
  if (!email) return { error: "no_verified_email" };

  // Never attach to an existing account by email: sign-up does not verify addresses, so someone
  // could have registered this one first, with a password they know.
  const emailKey = canonicalEmail(email);
  if (!emailKey) return { error: "no_verified_email" };
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.emailKey, emailKey), eq(users.email, email)));
  if (existing) return { error: "email_in_use" };

  // GitHub only reports addresses it has verified, so there is nothing left to confirm.
  const user = {
    id: crypto.randomUUID(),
    email,
    displayName: profile.name ?? profile.login ?? null,
    emailVerified: true,
  };
  try {
    await db.insert(users).values({
      id: user.id,
      email,
      emailKey,
      emailVerifiedAt: now,
      displayName: user.displayName,
      avatarUrl: profile.avatar_url ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(oauthAccounts).values({
      id: crypto.randomUUID(),
      userId: user.id,
      provider: "github",
      providerUserId,
      createdAt: now,
    });
  } catch {
    return { error: "email_in_use" };
  }
  return startSession(db, user, now);
}
