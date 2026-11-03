import { describe, expect, it } from "vitest";
import { clearCookie, readToken, sameOrigin, sessionCookie } from "./http";

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
