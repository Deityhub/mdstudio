import { describe, expect, it } from "vitest";
import { clearCookie, oauthCookie, readCookie, readToken, sameOrigin, sessionCookie } from "./http";

const req = (
  headers: Record<string, string>,
  url = "https://mdstudio.deityhub.com/api/auth/login",
) => new Request(url, { method: "POST", headers });

describe("session cookie", () => {
  it("is HttpOnly and SameSite=Lax, Secure on https only", () => {
    const secure = sessionCookie("tok", "https:", 60_000);
    expect(secure).toMatch(/^mdstudio_session=tok;/);
    for (const part of ["HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=60", "Secure"])
      expect(secure).toContain(part);
    expect(sessionCookie("tok", "http:", 60_000)).not.toContain("Secure");
  });

  it("clears by expiring", () => expect(clearCookie("https:")).toContain("Max-Age=0"));

  it("reads the token among other cookies", () => {
    expect(readToken(req({ cookie: "a=1; mdstudio_session=abc; b=2" }))).toBe("abc");
    expect(readToken(req({}))).toBeNull();
  });
});

describe("sameOrigin", () => {
  it("allows no Origin, the same origin, and nothing else", () => {
    expect(sameOrigin(req({}))).toBe(true);
    expect(sameOrigin(req({ origin: "https://mdstudio.deityhub.com" }))).toBe(true);
    expect(sameOrigin(req({ origin: "https://evil.example" }))).toBe(false);
    expect(sameOrigin(req({ origin: "null" }))).toBe(false);
  });
});

describe("oauth state cookie", () => {
  it("is HttpOnly, Lax, scoped to the OAuth routes and short-lived", () => {
    const cookie = oauthCookie("st.ver", "https:", 600_000);
    for (const part of [
      "mdstudio_oauth=st.ver",
      "HttpOnly",
      "SameSite=Lax",
      "Path=/api/auth/github",
      "Max-Age=600",
      "Secure",
    ])
      expect(cookie).toContain(part);
  });
  it("reads a named cookie", () =>
    expect(readCookie(req({ cookie: "mdstudio_oauth=a.b; x=1" }), "mdstudio_oauth")).toBe("a.b"));
});
