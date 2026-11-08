// A stand-in for github.com and api.github.com for the specs about connecting and publishing. The
// sign-in side (authorize, token, who am I, revoke) is here; the repository side is the in-memory
// fake the unit tests use (src/server/github/fake.ts). Run with bun: `bun e2e/fake-github.ts`.
import { createServer } from "node:http";
import { fakeGithub } from "../src/server/github/fake";

const PORT = Number(process.env["PORT"] ?? 4382);
const state = { revoked: 0 };
const api = fakeGithub("gho_fake");
api.addRepo("octo/blog", { files: { "README.md": "# blog" } });
api.addRepo("octo/readonly", { push: false });

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const method = req.method ?? "GET";
  let text = "";
  for await (const chunk of req) text += chunk;
  const send = (status: number, body?: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };

  if (url.pathname === "/login/oauth/authorize") {
    // the code carries the scope that was asked for, so the token exchange can report it
    const code = `code.${Buffer.from(url.searchParams.get("scope") ?? "").toString("base64url")}`;
    const back = new URL(url.searchParams.get("redirect_uri")!);
    back.searchParams.set("code", code);
    back.searchParams.set("state", url.searchParams.get("state")!);
    return send(302, undefined, { location: back.toString() });
  }
  if (url.pathname === "/login/oauth/access_token" && method === "POST") {
    const { code } = JSON.parse(text || "{}");
    const scope = Buffer.from(String(code).split(".")[1] ?? "", "base64url").toString();
    return send(200, { access_token: "gho_fake", scope: scope.split(" ").join(",") });
  }
  if (url.pathname === "/user")
    return req.headers.authorization === "Bearer gho_fake"
      ? send(200, { id: 7, login: "octo" })
      : send(401, { message: "Bad credentials" });
  if (url.pathname.startsWith("/applications/") && method === "DELETE") {
    state.revoked += 1;
    return send(204);
  }
  if (url.pathname === "/__state") return send(200, state);
  // what the specs look at: a file as a branch has it, and the pull requests of a repository
  if (url.pathname === "/__file") {
    const p = url.searchParams;
    const file = api.fileAt(p.get("repo")!, p.get("branch")!, p.get("path")!);
    return file ? send(200, file) : send(404, { message: "no such file" });
  }
  if (url.pathname === "/__pulls")
    return send(200, api.repos.get(url.searchParams.get("repo")!)?.pulls ?? []);
  if (url.pathname === "/__gists") return send(200, Object.fromEntries(api.gists));

  const reply = await api.fetch(`http://localhost:${PORT}${url.pathname}${url.search}`, {
    method,
    headers: { authorization: req.headers.authorization ?? "" },
    ...(text ? { body: text } : {}),
  });
  res.writeHead(reply.status, { "content-type": "application/json" });
  res.end(await reply.text());
}).listen(PORT);
