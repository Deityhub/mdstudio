// A writer's GitHub connection, independent of HTTP. Signing in with GitHub (../auth/github.ts)
// asks for no repository access and keeps no token. Connecting is a separate, explicit step that
// asks for it, and the token is kept sealed so publishing can use it later.
import { eq } from "drizzle-orm";
import { githubConnections } from "../../../infra/db/schema";
import type { Db } from "../db";
import { type GithubApp, type GithubUrls, exchangeCode, githubViewer, revokeToken } from "./client";
import { openToken, sealToken } from "./crypto";

/** Public repositories and gists by default; `repo` only when the writer asks for private ones. */
export const PUBLIC_SCOPE = "public_repo gist";
export const PRIVATE_SCOPE = "repo gist";

const canWrite = (scope: string) => /(^| )(public_repo|repo)( |$)/.test(scope);

export async function connectGithub(
  db: Db,
  key: CryptoKey,
  app: GithubApp,
  urls: GithubUrls,
  userId: string,
  input: { code: string; verifier: string; redirectUri: string },
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
): Promise<
  | { ok: true; login: string; scope: string }
  | { ok: false; error: "github_failed" | "github_scope" }
> {
  const grant = await exchangeCode(urls, app, input, fetchFn);
  if (!grant) return { ok: false, error: "github_failed" };
  if (!canWrite(grant.scope)) return { ok: false, error: "github_scope" };
  const who = await githubViewer(urls, grant.token, fetchFn);
  if (!who) return { ok: false, error: "github_failed" };

  const row = {
    githubUserId: who.id,
    login: who.login,
    scope: grant.scope,
    tokenSealed: await sealToken(key, grant.token, userId),
    updatedAt: now,
  };
  await db
    .insert(githubConnections)
    .values({ userId, createdAt: now, ...row })
    .onConflictDoUpdate({ target: githubConnections.userId, set: row });
  return { ok: true, login: who.login, scope: grant.scope };
}

export type ConnectionStatus =
  { connected: false } | { connected: true; login: string; private: boolean };

export async function connectionStatus(db: Db, userId: string): Promise<ConnectionStatus> {
  const [row] = await db
    .select({ login: githubConnections.login, scope: githubConnections.scope })
    .from(githubConnections)
    .where(eq(githubConnections.userId, userId));
  if (!row) return { connected: false };
  return { connected: true, login: row.login, private: /(^| )repo( |$)/.test(row.scope) };
}

/** The account's GitHub token, or null when not connected or when it cannot be opened (the key changed). */
export async function githubToken(db: Db, key: CryptoKey, userId: string) {
  const [row] = await db
    .select({ sealed: githubConnections.tokenSealed })
    .from(githubConnections)
    .where(eq(githubConnections.userId, userId));
  return row ? openToken(key, row.sealed, userId) : null;
}

/** Revokes the token at GitHub (if it can) and forgets it. False when nothing was connected. */
export async function disconnectGithub(
  db: Db,
  key: CryptoKey,
  app: GithubApp,
  urls: GithubUrls,
  userId: string,
  fetchFn: typeof fetch = fetch,
) {
  const token = await githubToken(db, key, userId);
  if (token) await revokeToken(urls, app, token, fetchFn);
  const gone = await db
    .delete(githubConnections)
    .where(eq(githubConnections.userId, userId))
    .returning({ id: githubConnections.userId });
  return gone.length > 0;
}
