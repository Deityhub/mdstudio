// The few GitHub calls the connection needs. The addresses can be changed (GITHUB_URL and
// GITHUB_API_URL) so tests and GitHub Enterprise can point somewhere else.
import { getEnv } from "../env";

export type GithubUrls = { web: string; api: string };
export type GithubApp = { clientId: string; clientSecret: string };

export const githubUrls = (request: Request): GithubUrls => ({
  web: getEnv(request, "GITHUB_URL")?.replace(/\/$/, "") ?? "https://github.com",
  api: getEnv(request, "GITHUB_API_URL")?.replace(/\/$/, "") ?? "https://api.github.com",
});

export const apiHeaders = (token: string) => ({
  authorization: `Bearer ${token}`,
  accept: "application/vnd.github+json",
  "user-agent": "mdstudio",
});

/** Trades the one-time code for an access token and the scopes that were granted. */
export async function exchangeCode(
  urls: GithubUrls,
  app: GithubApp,
  input: { code: string; verifier: string; redirectUri: string },
  fetchFn: typeof fetch,
): Promise<{ token: string; scope: string } | null> {
  const res = await fetchFn(`${urls.web}/login/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token?: unknown; scope?: unknown };
  if (typeof body.access_token !== "string") return null;
  const scope = typeof body.scope === "string" ? body.scope : "";
  return {
    token: body.access_token,
    scope: scope
      .split(/[,\s]+/)
      .filter(Boolean)
      .join(" "),
  };
}

export async function githubViewer(urls: GithubUrls, token: string, fetchFn: typeof fetch) {
  const res = await fetchFn(`${urls.api}/user`, { headers: apiHeaders(token) });
  if (!res.ok) return null;
  const body = (await res.json()) as { id?: unknown; login?: unknown };
  return typeof body.id === "number" && typeof body.login === "string"
    ? { id: String(body.id), login: body.login }
    : null;
}

/** Asks GitHub to stop honouring a token. Best effort: the caller forgets it either way. */
export async function revokeToken(
  urls: GithubUrls,
  app: GithubApp,
  token: string,
  fetchFn: typeof fetch,
) {
  try {
    const res = await fetchFn(`${urls.api}/applications/${app.clientId}/token`, {
      method: "DELETE",
      headers: {
        ...apiHeaders(token),
        authorization: `Basic ${btoa(`${app.clientId}:${app.clientSecret}`)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ access_token: token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
