// A stand-in for Google's sign-in servers (token and user info), for the specs about signing in
// with Google. The "code" a spec hands to the callback is the profile itself (base64url JSON), so
// each spec chooses who is signing in without sharing state with the others.
// Run with bun: `bun e2e/fake-google.ts`.
import { createServer } from "node:http";

const PORT = Number(process.env["PORT"] ?? 4383);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  let text = "";
  for await (const chunk of req) text += chunk;
  const send = (status: number, body?: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  if (url.pathname === "/ready") return send(200, {});
  if (url.pathname === "/auth") {
    // a browser that follows the redirect signs in as this default person
    const profile = { sub: "default", email: "default@example.com", email_verified: true };
    const back = new URL(url.searchParams.get("redirect_uri")!);
    back.searchParams.set("code", Buffer.from(JSON.stringify(profile)).toString("base64url"));
    back.searchParams.set("state", url.searchParams.get("state")!);
    return send(302, undefined, { location: back.toString() });
  }
  if (url.pathname === "/token" && req.method === "POST") {
    const code = new URLSearchParams(text).get("code");
    return code && code !== "bad"
      ? send(200, { access_token: `g.${code}` })
      : send(400, { error: "invalid_grant" });
  }
  if (url.pathname === "/userinfo") {
    const token = (req.headers.authorization ?? "").replace("Bearer g.", "");
    return token
      ? send(200, JSON.parse(Buffer.from(token, "base64url").toString()))
      : send(401, { error: "invalid_token" });
  }
  send(404);
}).listen(PORT);
