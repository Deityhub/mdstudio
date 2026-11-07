import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthExpiredError, UnverifiedError } from "@/lib/sync/api";
import { ShareError, shareApi } from "./api";

const reply = (body: unknown, status = 200) => Response.json(body, { status });
const mockFetch = (r: Response | (() => Response)) => {
  const fn = vi.fn(async (_path: string, _init?: RequestInit) =>
    typeof r === "function" ? r() : r.clone(),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
};
afterEach(() => vi.unstubAllGlobals());

const share = { id: "d1", slug: "abc123abc123", publishedAt: 1, expiresAt: 2, hash: "h", url: "u" };

describe("shareApi", () => {
  it("lists the links with the day limits", async () => {
    const fn = mockFetch(reply({ shares: [share], defaultDays: 4, maxDays: 7 }));
    expect(await shareApi.list()).toEqual({ shares: [share], defaultDays: 4, maxDays: 7 });
    expect(fn).toHaveBeenCalledWith("/api/share", undefined);
  });

  it("publishes a draft, sending the days only when given", async () => {
    const fn = mockFetch(reply({ share, created: true }));
    await shareApi.publish("d1");
    await shareApi.publish("d1", 3);
    const bodies = fn.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies).toEqual([{ id: "d1" }, { id: "d1", days: 3 }]);
    expect((fn.mock.calls[0]![1] as RequestInit).method).toBe("POST");
  });

  it("changes the expiry and revokes with the draft's id in the address", async () => {
    const fn = mockFetch(reply({ share }));
    await shareApi.extend("d 1/x", 5);
    expect(fn.mock.calls[0]![0]).toBe("/api/share/d%201%2Fx");
    expect((fn.mock.calls[0]![1] as RequestInit).method).toBe("PATCH");
    mockFetch(reply({ ok: true }));
    await shareApi.revoke("d1");
  });

  it("names what went wrong", async () => {
    mockFetch(reply({ error: "not_found" }, 404));
    await expect(shareApi.publish("x")).rejects.toMatchObject({ code: "not_found" });
    mockFetch(reply({ error: "invalid" }, 400));
    await expect(shareApi.publish("x", 99)).rejects.toMatchObject({ code: "invalid" });
    mockFetch(reply({ error: "too_many_requests" }, 429));
    await expect(shareApi.publish("x")).rejects.toMatchObject({ code: "too_many" });
    mockFetch(reply({}, 500));
    const error = await shareApi.publish("x").catch((e) => e);
    expect(error).toBeInstanceOf(ShareError);
    expect(error.code).toBe("failed");
  });

  it("passes on an ended session and an unconfirmed email so the studio can react", async () => {
    mockFetch(reply({ error: "unauthorized" }, 401));
    await expect(shareApi.list()).rejects.toBeInstanceOf(AuthExpiredError);
    mockFetch(reply({ error: "email_unverified" }, 403));
    await expect(shareApi.list()).rejects.toBeInstanceOf(UnverifiedError);
  });
});
