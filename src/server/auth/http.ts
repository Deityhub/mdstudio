const COOKIE = "mdstudio_session";

export const sessionCookie = (token: string, protocol: string, maxAgeMs: number) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${
    protocol === "https:" ? "; Secure" : ""
  }`;

export const clearCookie = (protocol: string) => sessionCookie("", protocol, 0);

export function readCookie(request: Request, name: string) {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ?? null;
}

export const readToken = (request: Request) => readCookie(request, COOKIE);

/** Holds the OAuth state and PKCE verifier between the redirect to GitHub and the callback. */
export const OAUTH_COOKIE = "mdstudio_oauth";
export const oauthCookie = (value: string, protocol: string, maxAgeMs: number) =>
  `${OAUTH_COOKIE}=${value}; Path=/api/auth/github; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${
    protocol === "https:" ? "; Secure" : ""
  }`;

/** Cookies are SameSite=Lax; this also refuses a cross-site POST that carries an Origin header. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
}
