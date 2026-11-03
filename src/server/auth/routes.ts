// Shared by the /api/auth/* route files so each stays a one-liner.
import { getDb } from "../db";
import { clearCookie, readToken, sameOrigin, sessionCookie } from "./http";
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
  if (!session || !token) return json({ user: null });
  // Re-issue the cookie so the browser keeps it exactly as long as the (sliding) session lives.
  return json({ user: session.user }, 200, {
    "set-cookie": sessionCookie(token, protocol(request), session.expiresAt - Date.now()),
  });
}
