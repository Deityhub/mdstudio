const COOKIE = "mdstudio_session";

export const sessionCookie = (token: string, protocol: string, maxAgeMs: number) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${
    protocol === "https:" ? "; Secure" : ""
  }`;

export const clearCookie = (protocol: string) => sessionCookie("", protocol, 0);

export function readToken(request: Request) {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

/** Cookies are SameSite=Lax; this also refuses a cross-site POST that carries an Origin header. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
}
