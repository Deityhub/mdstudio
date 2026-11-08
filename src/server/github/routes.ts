// HTTP side of the GitHub connection: the redirect to GitHub and back, who is connected, and
// disconnecting. The callback address is shared with signing in (see githubCallbackHandler).
import { authorizeUrl, pkcePair, randomState } from "../auth/github";
import { withVerifiedUser } from "../auth/guard";
import { CONNECT_COOKIE, connectCookie, readCookie, readToken, sameOrigin } from "../auth/http";
import { hit } from "../auth/limits";
import { redirectUri } from "../auth/routes";
import { userForToken } from "../auth/service";
import { getDb } from "../db";
import { getEnv } from "../env";
import { getMailer } from "../mail";
import { type GithubApp, githubUrls } from "./client";
import {
  PRIVATE_SCOPE,
  PUBLIC_SCOPE,
  connectGithub,
  connectionStatus,
  disconnectGithub,
} from "./connect";
import { importTokenKey } from "./crypto";

const HOUR = 3_600_000;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** The OAuth app and the key that seals tokens; null unless this server has both. */
async function setup(request: Request) {
  const clientId = getEnv(request, "GITHUB_CLIENT_ID");
  const clientSecret = getEnv(request, "GITHUB_CLIENT_SECRET");
  const key = await importTokenKey(getEnv(request, "GH_TOKEN_KEY"));
  if (!clientId || !clientSecret || !key) return null;
  const app: GithubApp = { clientId, clientSecret };
  return { app, key, urls: githubUrls(request) };
}

/** Whether publishing to GitHub is switched on for this server. */
export const publishingAvailable = async (request: Request) => (await setup(request)) !== null;

const redirect = (to: string, ...cookies: string[]) => {
  const headers = new Headers({ location: to, "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
};
const protocol = (request: Request) => new URL(request.url).protocol;

/** Sends a signed-in, confirmed writer to GitHub to allow publishing. `?private=1` asks for private repositories too. */
export async function connectStartHandler(request: Request) {
  const back = (code: string) => redirect(`/editor?github_error=${code}`);
  const cfg = await setup(request);
  if (!cfg) return back("github_unavailable");
  const db = await getDb(request);
  const token = readToken(request);
  const session = token ? await userForToken(db, token) : null;
  if (!session) return back("signed_out");
  if (!session.user.emailVerified && (await getMailer(request)) !== null)
    return back("email_unverified");
  if (!(await hit(db, `ghconnect:${session.user.id}`, 20, HOUR)).allowed) return back("too_many");

  const wantsPrivate = new URL(request.url).searchParams.get("private") === "1";
  const { verifier, challenge } = await pkcePair();
  const state = randomState();
  return redirect(
    authorizeUrl(cfg.app, redirectUri(request), state, challenge, {
      scope: wantsPrivate ? PRIVATE_SCOPE : PUBLIC_SCOPE,
      web: cfg.urls.web,
    }),
    connectCookie(`${state}.${verifier}`, protocol(request), 10 * 60 * 1000),
  );
}

/** Where GitHub sends the writer back to after allowing (or refusing) publishing. */
export async function connectCallbackHandler(request: Request) {
  const clear = connectCookie("", protocol(request), 0);
  const back = (code: string) => redirect(`/editor?github_error=${code}`, clear);
  const cfg = await setup(request);
  const params = new URL(request.url).searchParams;
  const [state, verifier] = readCookie(request, CONNECT_COOKIE)?.split(".") ?? [];
  const code = params.get("code");
  if (!cfg || !state || !verifier || params.get("state") !== state) return back("github_failed");
  if (!code) return back("github_denied"); // the writer said no on GitHub

  const db = await getDb(request);
  const token = readToken(request);
  const session = token ? await userForToken(db, token) : null;
  if (!session) return back("signed_out");
  const result = await connectGithub(db, cfg.key, cfg.app, cfg.urls, session.user.id, {
    code,
    verifier,
    redirectUri: redirectUri(request),
  });
  return result.ok ? redirect("/editor?github=connected", clear) : back(result.error);
}

export const statusHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) => {
    const available = (await setup(request)) !== null;
    return json({
      available,
      ...(available ? await connectionStatus(db, user.id) : { connected: false }),
    });
  });

export const disconnectHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const cfg = await setup(request);
    if (!cfg) return json({ error: "feature_unavailable" }, 403);
    await disconnectGithub(db, cfg.key, cfg.app, cfg.urls, user.id);
    return json({ ok: true });
  });
