// HTTP side of the GitHub connection: the redirect to GitHub and back, who is connected, and
// disconnecting. The callback address is shared with signing in (see githubCallbackHandler).
import { authorizeUrl, pkcePair, randomState } from "../auth/github";
import { withVerifiedUser } from "../auth/guard";
import {
  CONNECT_COOKIE,
  connectCookie,
  noStoreJson as json,
  readCookie,
  readJson,
  readToken,
  sameOrigin,
  tooManyResponse as tooMany,
} from "../auth/http";
import { hit } from "../auth/limits";
import { limitsFor } from "../limits/request";
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
import {
  type PublishError,
  getPublications,
  listBranches,
  listRepos,
  publishFile,
  publishGist,
} from "./publish";

const HOUR = 3_600_000;

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

// ---- repositories, branches and publishing ------------------------------------------------------

const STATUS: Record<PublishError, number> = {
  not_found: 404,
  invalid: 400,
  not_connected: 409,
  repo_not_found: 404,
  branch_not_found: 404,
  no_access: 403,
  exists: 409,
  conflict: 409,
  too_large: 413,
  github_failed: 502,
};
const fail = (error: PublishError) => json({ error }, STATUS[error]);
const unavailable = () => json({ error: "feature_unavailable" }, 403);

export const reposHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) => {
    const cfg = await setup(request);
    const limits = await limitsFor(request, db, user.id);
    if (!cfg || !limits.github_publish) return unavailable();
    // reading GitHub's lists costs a request each, so it is limited per account
    const t = await hit(db, `ghread:${user.id}`, limits.github_reads_per_hour, HOUR);
    if (!t.allowed) return tooMany(t.retryAfter);
    const r = await listRepos(db, cfg.key, cfg.urls, user.id);
    return r.ok ? json({ repos: r.repos }) : fail(r.error);
  });

export const branchesHandler = (request: Request, owner: string, name: string) =>
  withVerifiedUser(request, async (user, db) => {
    const cfg = await setup(request);
    const limits = await limitsFor(request, db, user.id);
    if (!cfg || !limits.github_publish) return unavailable();
    // reading GitHub's lists costs a request each, so it is limited per account
    const t = await hit(db, `ghread:${user.id}`, limits.github_reads_per_hour, HOUR);
    if (!t.allowed) return tooMany(t.retryAfter);
    const r = await listBranches(db, cfg.key, cfg.urls, user.id, `${owner}/${name}`);
    return r.ok ? json({ branches: r.branches, defaultBranch: r.defaultBranch }) : fail(r.error);
  });

/** What was last published from a draft (a file and/or a gist). Reads only our own database. */
export const publicationsHandler = (request: Request, localId: string) =>
  withVerifiedUser(request, async (user, db) =>
    json({ publications: await getPublications(db, user.id, localId) }),
  );

/** `{ target: "file", ... }` commits (or opens a pull request); `{ target: "gist", ... }` makes a gist. */
export const publishHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const cfg = await setup(request);
    const limits = await limitsFor(request, db, user.id);
    if (!cfg || !limits.github_publish) return unavailable();
    const body = await readJson(request);
    if (!body || (body["target"] !== "file" && body["target"] !== "gist")) return fail("invalid");
    // publishing is limited per account, so a script cannot churn commits
    const t = await hit(db, `ghpublish:${user.id}`, limits.github_publishes_per_hour, HOUR);
    if (!t.allowed) return tooMany(t.retryAfter);
    const r =
      body["target"] === "file"
        ? await publishFile(db, cfg.key, cfg.urls, user.id, body as never)
        : await publishGist(db, cfg.key, cfg.urls, user.id, body as never);
    return r.ok ? json({ result: r.result }) : fail(r.error);
  });
