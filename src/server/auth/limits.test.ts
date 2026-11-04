// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import type { Db } from "../db";
import { blockedFor, clearLimit, clientIp, hit, lockedOut } from "./limits";

let db: Db;
const t0 = 1_700_000_000_000;
const HOUR = 3_600_000;
beforeEach(() => void (db = createNodeDb(":memory:") as unknown as Db));

describe("hit", () => {
  it("allows the limit, then refuses until the window ends", async () => {
    for (let i = 0; i < 3; i++) expect((await hit(db, "k", 3, HOUR, t0 + i)).allowed).toBe(true);
    const over = await hit(db, "k", 3, HOUR, t0 + 10);
    expect(over.allowed).toBe(false);
    expect(over.retryAfter).toBe(Math.ceil((HOUR - 10) / 1000));
    expect((await hit(db, "k", 3, HOUR, t0 + HOUR - 1)).allowed).toBe(false);
    // a new window starts the count again
    expect((await hit(db, "k", 3, HOUR, t0 + HOUR + 1)).allowed).toBe(true);
  });

  it("counts each key on its own", async () => {
    for (let i = 0; i < 2; i++) await hit(db, "a", 2, HOUR, t0);
    expect((await hit(db, "a", 2, HOUR, t0)).allowed).toBe(false);
    expect((await hit(db, "b", 2, HOUR, t0)).allowed).toBe(true);
  });
});

describe("blockedFor and clearLimit", () => {
  it("reports a block without counting, and a clear lifts it", async () => {
    expect(await blockedFor(db, "k", 2, t0)).toBeNull();
    await hit(db, "k", 2, HOUR, t0);
    await hit(db, "k", 2, HOUR, t0);
    expect(await blockedFor(db, "k", 2, t0)).toBeNull(); // at the limit, not past it
    await hit(db, "k", 2, HOUR, t0);
    expect(await blockedFor(db, "k", 2, t0 + 1000)).toBe(Math.ceil((HOUR - 1000) / 1000));
    expect(await blockedFor(db, "k", 2, t0 + HOUR + 1)).toBeNull(); // window over
    await clearLimit(db, "k");
    expect(await blockedFor(db, "k", 2, t0 + 1000)).toBeNull();
  });
});

describe("lockedOut", () => {
  it("locks as soon as the failures reach the maximum", async () => {
    for (let i = 0; i < 2; i++) await hit(db, "f", 3, HOUR, t0);
    expect(await lockedOut(db, "f", 3, t0)).toBeNull();
    await hit(db, "f", 3, HOUR, t0);
    expect(await lockedOut(db, "f", 3, t0 + 1000)).toBe(Math.ceil((HOUR - 1000) / 1000));
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("https://x.test/", { headers });
  it("trusts Cloudflare's header, and a forwarded header only when told to", () => {
    expect(
      clientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }), false),
    ).toBe("1.2.3.4");
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }), true)).toBe("9.9.9.9");
    // anyone can send X-Forwarded-For, so without a trusted proxy it must not choose the bucket
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9" }), false)).toBe("unknown");
    expect(clientIp(req({}), true)).toBe("unknown");
  });
});
