// Runs a handler for the signed-in user, or answers 401. Every authenticated request goes through
// here, so the session slides in one place and the browser's cookie is renewed with it (the
// database expiry alone would leave the cookie to lapse at its original time).
import { type Db, getDb } from "../db";
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
