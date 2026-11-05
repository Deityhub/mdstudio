import { describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "./turnstile";

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => Response.json(body, { status })) as unknown as typeof fetch;

describe("verifyTurnstile", () => {
  it("asks Cloudflare with the secret, the token and the caller's address", async () => {
    const fetchFn = reply({ success: true });
    expect(await verifyTurnstile("sec", "tok", "1.2.3.4", fetchFn)).toBe(true);
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({
      secret: "sec",
      response: "tok",
      remoteip: "1.2.3.4",
    });
  });

  it("fails closed: no token, a refusal, a bad status or an unreachable service", async () => {
    expect(await verifyTurnstile("s", "", "ip", reply({ success: true }))).toBe(false);
    expect(await verifyTurnstile("s", undefined, "ip", reply({ success: true }))).toBe(false);
    expect(await verifyTurnstile("s", "t", "ip", reply({ success: false }))).toBe(false);
    expect(await verifyTurnstile("s", "t", "ip", reply({}, 500))).toBe(false);
    const down = (async () => Promise.reject(new TypeError("offline"))) as typeof fetch;
    expect(await verifyTurnstile("s", "t", "ip", down)).toBe(false);
  });

  it("leaves out the address when it is unknown", async () => {
    const fetchFn = reply({ success: true });
    await verifyTurnstile("s", "t", "unknown", fetchFn);
    const [, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(new URLSearchParams(init.body).has("remoteip")).toBe(false);
  });
});
