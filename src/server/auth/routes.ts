// Shared by the /api/auth/* route files so each stays a one-liner.
import { getDb } from "../db";
import { getEnv } from "../env";
import { authorizeUrl, githubSignIn, pkcePair, randomState } from "./github";
import {
  OAUTH_COOKIE,
  clearCookie,
  oauthCookie,
  readCookie,
  readToken,
  sameOrigin,
  sessionCookie,
} from "./http";
import { SESSION_MS, login, logout, signup, userForToken } from "./service";

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

const protocol = (request: Request) => new URL(request.url).protocol;

async function body(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

const STATUS = { invalid: 400, email_taken: 409, invalid_credentials: 401 } as const;

async function authenticate(request: Request, action: typeof signup | typeof login) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const result = await action(await getDb(request), await body(request));
  if ("error" in result) return json({ error: result.error }, STATUS[result.error]);
  return json({ user: result.user }, 200, {
    "set-cookie": sessionCookie(result.token, protocol(request), SESSION_MS),
  });
}

export const signupHandler = (request: Request) => authenticate(request, signup);
export const loginHandler = (request: Request) => authenticate(request, login);

export async function logoutHandler(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const token = readToken(request);
  if (token) await logout(await getDb(request), token);
  return json({ ok: true }, 200, { "set-cookie": clearCookie(protocol(request)) });
}

export async function meHandler(request: Request) {
  const token = readToken(request);
  const session = token ? await userForToken(await getDb(request), token) : null;
  const providers = { github: githubConfig(request) !== null };
  if (!session || !token) return json({ user: null, providers });
  // Re-issue the cookie so the browser keeps it exactly as long as the (sliding) session lives.
  return json({ user: session.user, providers }, 200, {
    "set-cookie": sessionCookie(token, protocol(request), session.expiresAt - Date.now()),
  });
}

// ---- GitHub OAuth -------------------------------------------------------------------------

const githubConfig = (request: Request) => {
  const clientId = getEnv(request, "GITHUB_CLIENT_ID");
  const clientSecret = getEnv(request, "GITHUB_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

/** PUBLIC_URL overrides the origin for self-hosting behind a proxy that rewrites it. */
const redirectUri = (request: Request) =>
  `${getEnv(request, "PUBLIC_URL")?.replace(/\/$/, "") ?? new URL(request.url).origin}/api/auth/github/callback`;

const redirect = (to: string, ...cookies: string[]) => {
  const headers = new Headers({ location: to, "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
};

export async function githubStartHandler(request: Request) {
  const cfg = githubConfig(request);
  if (!cfg) return redirect("/editor?auth_error=github_unavailable");
  const { verifier, challenge } = await pkcePair();
  const state = randomState();
  return redirect(
    authorizeUrl(cfg, redirectUri(request), state, challenge),
    oauthCookie(`${state}.${verifier}`, protocol(request), 10 * 60 * 1000),
  );
}

export async function githubCallbackHandler(request: Request) {
  const cfg = githubConfig(request);
  const clear = oauthCookie("", protocol(request), 0);
  const fail = (code: string) => redirect(`/editor?auth_error=${code}`, clear);
  const params = new URL(request.url).searchParams;
  const [state, verifier] = readCookie(request, OAUTH_COOKIE)?.split(".") ?? [];
  const code = params.get("code");
  // The state in the URL must be the one this browser was given, or the callback was forged.
  if (!cfg || !state || !verifier || !code || params.get("state") !== state)
    return fail("github_failed");
  const result = await githubSignIn(await getDb(request), cfg, {
    code,
    verifier,
    redirectUri: redirectUri(request),
  });
  if ("error" in result) return fail(result.error);
  return redirect("/editor", sessionCookie(result.token, protocol(request), SESSION_MS), clear);
}
