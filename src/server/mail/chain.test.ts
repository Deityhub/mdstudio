// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import type { Db } from "../db";
import { sendWithChain, type ConfiguredProvider } from "./chain";
import { ProviderError } from "./types";

let db: Db;
const day = Date.UTC(2026, 10, 4, 12); // 4 Nov 2026, noon UTC
const mail = { to: "ada@example.com", subject: "Hi", text: "Hello" };

beforeEach(() => void (db = createNodeDb(":memory:") as unknown as Db));

function provider(id: string, daily: number, monthly = 10_000, send = vi.fn(async () => {})) {
  return { id, caps: { daily, monthly }, send } satisfies ConfiguredProvider;
}

describe("choosing a provider", () => {
  it("sends through the one with the most room left today, so load spreads out", async () => {
    const small = provider("small", 100);
    const big = provider("big", 300);
    // 300 vs 100 of headroom: the big one first, until it has less room than the small one
    for (let i = 0; i < 202; i++) await sendWithChain(db, [small, big], mail, day);
    expect(big.send).toHaveBeenCalledTimes(201);
    expect(small.send).toHaveBeenCalledTimes(1);
  });

  it("keeps the configured order when two have equal room", async () => {
    const a = provider("a", 100);
    const b = provider("b", 100);
    await sendWithChain(db, [a, b], mail, day);
    expect(a.send).toHaveBeenCalledTimes(1);
    expect(b.send).not.toHaveBeenCalled();
  });

  it("stops using a provider that reached its daily or monthly limit, and starts again on the next day", async () => {
    const a = provider("a", 2);
    const b = provider("b", 1);
    for (let i = 0; i < 3; i++) await sendWithChain(db, [a, b], mail, day);
    await expect(sendWithChain(db, [a, b], mail, day + 1000)).rejects.toThrow(/no mail provider/i);
    // a new UTC day: counts start again
    await sendWithChain(db, [a, b], mail, day + 24 * 3_600_000);
    expect(a.send.mock.calls.length + b.send.mock.calls.length).toBe(4);

    const m = provider("m", 100, 1);
    await sendWithChain(db, [m], mail, day);
    await expect(sendWithChain(db, [m], mail, day + 3_600_000)).rejects.toThrow(
      /no mail provider/i,
    );
    await sendWithChain(db, [m], mail, Date.UTC(2026, 11, 2)); // next month
    expect(m.send).toHaveBeenCalledTimes(2);
  });
});

describe("when a provider fails", () => {
  it("tries the next one, and only counts the send that worked", async () => {
    const broken = provider(
      "broken",
      300,
      10_000,
      vi.fn(async () => Promise.reject(new ProviderError("boom", 503))),
    );
    const fine = provider("fine", 100);
    await sendWithChain(db, [broken, fine], mail, day);
    expect(broken.send).toHaveBeenCalledTimes(1);
    expect(fine.send).toHaveBeenCalledTimes(1);
  });

  it("leaves a failing provider alone for a few minutes instead of waiting on it every time", async () => {
    const broken = provider(
      "broken",
      300,
      10_000,
      vi.fn(async () => Promise.reject(new ProviderError("down", 500))),
    );
    const fine = provider("fine", 100);
    await sendWithChain(db, [broken, fine], mail, day);
    await sendWithChain(db, [broken, fine], mail, day + 60_000);
    expect(broken.send).toHaveBeenCalledTimes(1);
    await sendWithChain(db, [broken, fine], mail, day + 6 * 60_000);
    expect(broken.send).toHaveBeenCalledTimes(2);
  });

  it("treats a 429 as 'full for today', whatever our own count says", async () => {
    const limited = provider(
      "limited",
      300,
      10_000,
      vi.fn(async () => Promise.reject(new ProviderError("too many", 429))),
    );
    const other = provider("other", 100);
    await sendWithChain(db, [limited, other], mail, day);
    for (let i = 0; i < 3; i++)
      await sendWithChain(db, [limited, other], mail, day + 10 * 60_000 * (i + 1));
    expect(limited.send).toHaveBeenCalledTimes(1);
    expect(other.send).toHaveBeenCalledTimes(4);
  });

  it("throws, naming each provider's status and nothing secret, when all fail", async () => {
    const a = provider(
      "a",
      100,
      10_000,
      vi.fn(async () => Promise.reject(new ProviderError("key sk_live_123 rejected", 401))),
    );
    const b = provider(
      "b",
      100,
      10_000,
      vi.fn(async () => Promise.reject(new Error("socket hang up"))),
    );
    const error = await sendWithChain(db, [a, b], mail, day).catch((e: Error) => e);
    expect((error as Error).message).toMatch(/a \(401\)/);
    expect((error as Error).message).toMatch(/b/);
    expect((error as Error).message).not.toContain("sk_live_123");
  });

  it("says so when there is nothing to send with", async () => {
    await expect(sendWithChain(db, [], mail, day)).rejects.toThrow(/no mail provider/i);
  });
});
