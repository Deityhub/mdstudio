// A stand-in for github.com and api.github.com, for the specs about connecting and publishing.
// It allows whatever scopes are asked for, and remembers what was revoked at /__state.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4382);
const state = { revoked: 0 };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const read = async () => {
    let text = "";
    for await (const chunk of req) text += chunk;
    return text ? JSON.parse(text) : {};
  };

  if (url.pathname === "/login/oauth/authorize") {
    // the code carries the scope that was asked for, so the token exchange can report it
    const code = `code.${Buffer.from(url.searchParams.get("scope") ?? "").toString("base64url")}`;
    const back = new URL(url.searchParams.get("redirect_uri"));
    back.searchParams.set("code", code);
    back.searchParams.set("state", url.searchParams.get("state"));
    return send(302, undefined, { location: back.toString() });
  }
  if (url.pathname === "/login/oauth/access_token" && req.method === "POST") {
    const { code } = await read();
    const scope = Buffer.from(String(code).split(".")[1] ?? "", "base64url").toString();
    return send(200, { access_token: "gho_fake", scope: scope.split(" ").join(",") });
  }
  if (url.pathname === "/user")
    return req.headers.authorization === "Bearer gho_fake"
      ? send(200, { id: 7, login: "octo" })
      : send(401, { message: "Bad credentials" });
  if (url.pathname.startsWith("/applications/") && req.method === "DELETE") {
    state.revoked += 1;
    return send(204);
  }
  if (url.pathname === "/__state") return send(200, state);
  return send(404, { message: "Not Found" });
}).listen(PORT);
