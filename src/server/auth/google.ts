// Google sign-in (OpenID Connect authorization code + PKCE, over the server). Only the account's
// id, name, picture and verified email are used; the access token is never stored, it lives for
// the one call made in the callback.
import type { Db } from "../db";
import type { PublicUser } from "./service";
import { type SocialFailure, socialSignIn } from "./social";

export type GoogleConfig = { clientId: string; clientSecret: string };

/** Google's three addresses; `base` points them at a stand-in server for tests. */
export function googleUrls(base?: string) {
  const root = base?.replace(/\/$/, "");
  return root
    ? { auth: `${root}/auth`, token: `${root}/token`, userinfo: `${root}/userinfo` }
    : {
        auth: "https://accounts.google.com/o/oauth2/v2/auth",
        token: "https://oauth2.googleapis.com/token",
        userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
      };
}

export const googleAuthorizeUrl = (
  cfg: GoogleConfig,
  redirectUri: string,
  state: string,
  challenge: string,
  base?: string,
) =>
  `${googleUrls(base).auth}?` +
  new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

export async function googleSignIn(
  db: Db,
  cfg: GoogleConfig,
  input: { code: string; verifier: string; redirectUri: string },
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
  base?: string,
): Promise<{ user: PublicUser; token: string } | { error: "google_failed" } | SocialFailure> {
  const urls = googleUrls(base);
  const failed = { error: "google_failed" } as const;
  try {
    const tokenRes = await fetchFn(urls.token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code: input.code,
        code_verifier: input.verifier,
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const accessToken = tokenRes.ok
      ? ((await tokenRes.json()) as { access_token?: unknown }).access_token
      : null;
    if (typeof accessToken !== "string") return failed;

    const profileRes = await fetchFn(urls.userinfo, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    });
    if (!profileRes.ok) return failed;
    const profile = (await profileRes.json()) as {
      sub?: unknown;
      email?: unknown;
      email_verified?: unknown;
      name?: unknown;
      picture?: unknown;
    };
    if (typeof profile.sub !== "string" || !profile.sub) return failed;
    const text = (v: unknown) => (typeof v === "string" && v ? v : null);
    return socialSignIn(
      db,
      "google",
      {
        id: profile.sub,
        email: text(profile.email),
        verified: profile.email_verified === true || profile.email_verified === "true",
        name: text(profile.name),
        avatar: text(profile.picture),
      },
      now,
    );
  } catch {
    return failed; // Google unreachable, or an answer that was not JSON
  }
}
