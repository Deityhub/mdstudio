import { describe, expect, it } from "vitest";
import { buildCsp, createNonce, getRequestNonce, securityHeaders, setRequestNonce } from "./csp";

describe("csp", () => {
  it("creates unique base64 nonces of 16 bytes", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });

  it("ties the nonce to script-src and never allows unsafe-inline scripts", () => {
    const csp = buildCsp("abc123");
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).toBe("script-src 'self' 'nonce-abc123'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("allows BYOK providers over https and local runners over localhost only", () => {
    const connect = buildCsp("n")
      .split("; ")
      .find((d) => d.startsWith("connect-src"))!;
    expect(connect).toContain(" https:");
    expect(connect).toContain("http://localhost:*");
    expect(connect).not.toMatch(/ http:(?!\/\/(localhost|127\.0\.0\.1))/);
  });

  it("emits the full header set and remembers the nonce per request", () => {
    expect(Object.keys(securityHeaders("n"))).toEqual(
      expect.arrayContaining(["Content-Security-Policy", "X-Content-Type-Options"]),
    );
    const req = new Request("http://localhost/");
    setRequestNonce(req, "n1");
    expect(getRequestNonce(req)).toBe("n1");
    expect(getRequestNonce(new Request("http://localhost/"))).toBeUndefined();
  });
});
