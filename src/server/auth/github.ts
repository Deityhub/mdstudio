// GitHub OAuth (authorization code + PKCE). Only the account's id, name, avatar and verified email
// are used; the access token is never stored, it lives for the two calls made in the callback.
import type { Db } from "../db";
import type { PublicUser } from "./service";
import { linkSocial } from "./links";
import { type SocialFailure, type SocialProfile, socialSignIn } from "./social";

export type GithubConfig = { clientId: string; clientSecret: string };
type Failure = { error: "github_failed" } | SocialFailure;

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
  /** `scope` and the GitHub address to ask, for connecting (see ../github/) and for tests. */
  opts: { scope?: string; web?: string } = {},
) =>
  `${opts.web ?? "https://github.com"}/login/oauth/authorize?` +
  new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    scope: opts.scope ?? "read:user user:email",
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

type Input = { code: string; verifier: string; redirectUri: string };

/** Who GitHub says the person is, after the code was exchanged; nothing is stored. */
async function githubProfile(
  cfg: GithubConfig,
  input: Input,
  fetchFn: typeof fetch,
): Promise<SocialProfile | { error: "github_failed" }> {
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

  const verified = emails.filter((e) => e.verified);
  const email = (verified.find((e) => e.primary) ?? verified[0])?.email ?? null;
  return {
    id: String(profile.id),
    email,
    verified: email !== null, // GitHub only lists addresses it has verified
    name: profile.name ?? profile.login ?? null,
    avatar: profile.avatar_url ?? null,
  };
}

export async function githubSignIn(
  db: Db,
  cfg: GithubConfig,
  input: Input,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
): Promise<{ user: PublicUser; token: string } | Failure> {
  const profile = await githubProfile(cfg, input, fetchFn);
  return "error" in profile ? profile : socialSignIn(db, "github", profile, now);
}

/** Adds the person's GitHub identity to the signed-in account (see links.ts). */
export async function githubLink(
  db: Db,
  cfg: GithubConfig,
  input: Input,
  userId: string,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
) {
  const profile = await githubProfile(cfg, input, fetchFn);
  if ("error" in profile) return { ok: false as const, error: profile.error };
  return linkSocial(db, "github", profile, userId, now);
}
