// Runs a handler for the signed-in user, or answers 401. Every authenticated request goes through
// here, so the session slides in one place and the browser's cookie is renewed with it (the
// database expiry alone would leave the cookie to lapse at its original time).
import { type Db, getDb } from "../db";
import { getMailer } from "../mail";
import { readToken, sessionCookie } from "./http";
import { type PublicUser, userForToken } from "./service";

export async function withUser(
  request: Request,
  handler: (user: PublicUser, db: Db) => Promise<Response>,
): Promise<Response> {
  const token = readToken(request);
  const db = await getDb(request);
  const session = token ? await userForToken(db, token) : null;
  if (!session || !token)
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  const response = await handler(session.user, db);
  response.headers.append(
    "set-cookie",
    sessionCookie(token, new URL(request.url).protocol, session.expiresAt - Date.now()),
  );
  return response;
}

/**
 * `withUser` for what lives in the cloud: an account must have confirmed its email first. On a
 * server that sends no mail there is nothing to confirm with, so everyone counts as confirmed.
 */
export const withVerifiedUser = (
  request: Request,
  handler: (user: PublicUser, db: Db) => Promise<Response>,
) =>
  withUser(request, async (user, db) => {
    if (!user.emailVerified && (await getMailer(request)) !== null)
      return Response.json(
        { error: "email_unverified" },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    return handler(user, db);
  });

/**
 * `withVerifiedUser` for the admin dashboard: only an admin gets in. Everyone else, signed in or
 * not, gets the same "not found" as for a page that does not exist, so nothing says it is there.
 */
export const withAdmin = async (
  request: Request,
  handler: (user: PublicUser, db: Db) => Promise<Response>,
) => {
  const notFound = () =>
    Response.json(
      { error: "not_found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  let ran = false;
  const res = await withVerifiedUser(request, async (user, db) => {
    if (!user.isAdmin) return notFound();
    ran = true;
    return handler(user, db);
  });
  // signed out or not confirmed yet is also "not found": nothing says the dashboard is there
  return ran ? res : notFound();
};
