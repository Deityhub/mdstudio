// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { plans, users } from "../../../infra/db/schema";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { LIMITS, parseChange, resolveLimits } from "./catalog";
import { deletePlan, savePlan } from "./plans";
import { updateSettings } from "../settings/service";
import { accountLimits, changeAccount, getLimits } from "./service";

const noEnv = () => undefined;

describe("resolving a limit", () => {
  it("uses the built-in default when nothing else says", () => {
    const { values, sources } = resolveLimits(noEnv, {});
    expect(values.cloud_docs).toBe(5);
    expect(values.private_links).toBe(true);
    expect(sources.cloud_docs).toBe("default");
  });
  it("lets the server's setting replace the default", () => {
    const env = (n: string) =>
      ({ MAX_CLOUD_DOCS: "9", PRIVATE_LINKS: "off", MAX_REVISIONS: "0" })[n];
    const { values, sources } = resolveLimits(env, {});
    expect(values).toMatchObject({ cloud_docs: 9, private_links: false, revisions: 0 });
    expect(sources.cloud_docs).toBe("env");
  });
  it("ignores a setting that is not a whole number of at least zero", () => {
    const env = (n: string) => ({ MAX_CLOUD_DOCS: "-3", MAX_ASSETS: "lots" })[n];
    const { values } = resolveLimits(env, {});
    expect(values.cloud_docs).toBe(5);
    expect(values.assets).toBe(10);
  });
  it("orders the layers: account, plan, server setting, environment, default", () => {
    const env = (n: string) => ({ MAX_CLOUD_DOCS: "9", MAX_ASSETS: "9", SHARE_MAX_DAYS: "9" })[n];
    const { values, sources } = resolveLimits(env, {
      overrides: { assets: 7 },
      plan: { cloud_docs: 50, assets: 100 },
      server: { cloud_docs: 30, share_max_days: 14 },
    });
    expect(values).toMatchObject({ cloud_docs: 50, assets: 7, share_max_days: 14, revisions: 10 });
    expect(sources).toMatchObject({
      cloud_docs: "plan",
      assets: "override",
      share_max_days: "server",
      revisions: "default",
    });
    expect(resolveLimits(env, {}).sources.share_max_days).toBe("env");
  });
  it("covers storage, sharing and rate limits", () => {
    for (const key of [
      "cloud_docs",
      "revisions",
      "assets",
      "asset_bytes",
      "ai_integrations",
      "share_max_days",
      "share_default_days",
      "private_links",
      "invites_per_day",
      "github_publish",
      "share_changes_per_hour",
      "comments_per_hour",
      "github_publishes_per_hour",
      "github_reads_per_hour",
      "ai_changes_per_hour",
    ])
      expect(LIMITS).toHaveProperty(key);
  });
});

describe("checking a change", () => {
  it("accepts whole numbers and switches, and null to remove an override", () => {
    expect(parseChange("cloud_docs", 20)).toBe(20);
    expect(parseChange("private_links", false)).toBe(false);
    expect(parseChange("cloud_docs", null)).toBeNull();
  });
  it("refuses unknown limits, the wrong type, fractions, negatives and absurd sizes", () => {
    for (const [key, value] of [
      ["nope", 1],
      ["cloud_docs", "20"],
      ["cloud_docs", 1.5],
      ["cloud_docs", -1],
      ["cloud_docs", 1e12],
      ["private_links", 1],
      ["github_publish", "yes"],
    ] as const)
      expect(parseChange(key, value)).toBe("invalid");
  });
});

describe("a server-wide default set in the dashboard", () => {
  it("applies to every account, below a plan and an account override", async () => {
    const db = createNodeDb(":memory:") as unknown as Db;
    for (const id of ["a", "b"])
      await db.insert(users).values({ id, email: `${id}@x.co`, createdAt: 1, updatedAt: 1 });
    await updateSettings(db, { limits: { cloud_docs: 12 } });
    await changeAccount(db, "b", { limits: { cloud_docs: 99 } });
    const a = await getLimits(db, noEnv, "a");
    expect(a.values.cloud_docs).toBe(12);
    expect(a.sources.cloud_docs).toBe("server");
    expect((await getLimits(db, noEnv, "b")).values.cloud_docs).toBe(99);
  });
});

describe("an account's limits", () => {
  let db: Db;
  beforeEach(async () => {
    db = createNodeDb(":memory:") as unknown as Db;
    for (const id of ["a", "b"])
      await db.insert(users).values({ id, email: `${id}@x.co`, createdAt: 1, updatedAt: 1 });
  });
  it("starts on the free plan with the defaults", async () => {
    expect((await getLimits(db, noEnv, "a")).values.cloud_docs).toBe(5);
    expect((await accountLimits(db, noEnv, "a"))?.plan).toBe("free");
  });
  it("raises one account without touching another, and a removed override goes back", async () => {
    expect(
      await changeAccount(db, "a", { limits: { cloud_docs: 40, share_max_days: 30 } }),
    ).toEqual({ ok: true });
    expect((await getLimits(db, noEnv, "a")).values).toMatchObject({
      cloud_docs: 40,
      share_max_days: 30,
    });
    expect((await getLimits(db, noEnv, "b")).values.cloud_docs).toBe(5);
    await changeAccount(db, "a", { limits: { cloud_docs: null } });
    const after = await getLimits(db, noEnv, "a");
    expect(after.values).toMatchObject({ cloud_docs: 5, share_max_days: 30 });
    expect(after.sources.cloud_docs).toBe("default");
  });
  it("changes an override rather than adding a second", async () => {
    await changeAccount(db, "a", { limits: { assets: 20 } });
    await changeAccount(db, "a", { limits: { assets: 30 } });
    expect((await getLimits(db, noEnv, "a")).values.assets).toBe(30);
  });
  it("moves an account to a known plan only", async () => {
    await savePlan(db, { name: "pro-test", label: "Pro", limits: { cloud_docs: 100 } });
    expect(await changeAccount(db, "a", { plan: "pro-test" })).toEqual({ ok: true });
    expect((await getLimits(db, noEnv, "a")).values.cloud_docs).toBe(100);
    expect(await changeAccount(db, "a", { plan: "made-up" })).toEqual({
      ok: false,
      error: "invalid",
    });
  });
  it("refuses a bad change and changes nothing", async () => {
    expect(await changeAccount(db, "a", { limits: { cloud_docs: 10, assets: -1 } })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect((await getLimits(db, noEnv, "a")).values.cloud_docs).toBe(5);
  });
  it("reports where each value came from", async () => {
    await changeAccount(db, "a", { limits: { cloud_docs: 40 } });
    const info = await accountLimits(db, noEnv, "a");
    expect(info?.limits.cloud_docs).toEqual({ value: 40, source: "override" });
    expect(info?.limits.assets).toEqual({ value: 10, source: "default" });
  });
});

describe("where an account's own limits are kept", () => {
  let db: Db;
  beforeEach(async () => {
    db = createNodeDb(":memory:") as unknown as Db;
    await db.insert(users).values({ id: "a", email: "a@x.co", createdAt: 1, updatedAt: 1 });
  });
  const stored = async () =>
    (await db.select({ limits: users.limits }).from(users).where(eq(users.id, "a")))[0]!.limits;

  it("is one JSON value on the account's own row, nothing more", async () => {
    expect(await stored()).toBe("{}");
    await changeAccount(db, "a", { limits: { cloud_docs: 40, private_links: false } });
    expect(JSON.parse(await stored())).toEqual({ cloud_docs: 40, private_links: false });
    await changeAccount(db, "a", { limits: { cloud_docs: null } });
    expect(JSON.parse(await stored())).toEqual({ private_links: false });
    await changeAccount(db, "a", { limits: { private_links: null } });
    expect(await stored()).toBe("{}");
  });
  it("ignores what cannot be read or is no longer allowed, so the next layer applies", async () => {
    await db.update(users).set({ limits: "not json" }).where(eq(users.id, "a"));
    expect((await getLimits(db, noEnv, "a")).values.cloud_docs).toBe(5);
    await db
      .update(users)
      .set({ limits: '{"cloud_docs":-5,"gone":1,"assets":12}' })
      .where(eq(users.id, "a"));
    const { values, sources } = await getLimits(db, noEnv, "a");
    expect(values).toMatchObject({ cloud_docs: 5, assets: 12 });
    expect(sources.assets).toBe("override");
  });
});

describe("plans and server settings are read once a minute", () => {
  const t0 = 1_700_000_000_000;
  let db: Db;
  beforeEach(async () => {
    db = createNodeDb(":memory:") as unknown as Db;
    await db
      .insert(users)
      .values({ id: "a", email: "a@x.co", plan: "pro", createdAt: 1, updatedAt: 1 });
    await savePlan(db, { name: "pro", label: "Pro", limits: { cloud_docs: 50 } });
  });
  it("keeps what it read for a minute, then reads again", async () => {
    expect((await getLimits(db, noEnv, "a", t0)).values.cloud_docs).toBe(50);
    // changed behind its back (another server instance): not seen until the minute is up
    await db.update(plans).set({ limits: '{"cloud_docs":60}' }).where(eq(plans.name, "pro"));
    expect((await getLimits(db, noEnv, "a", t0 + 59_000)).values.cloud_docs).toBe(50);
    expect((await getLimits(db, noEnv, "a", t0 + 61_000)).values.cloud_docs).toBe(60);
  });
  it("sees a change made through the dashboard at once", async () => {
    expect((await getLimits(db, noEnv, "a", t0)).values.cloud_docs).toBe(50);
    await savePlan(db, { name: "pro", label: "Pro", limits: { cloud_docs: 70 } });
    expect((await getLimits(db, noEnv, "a", t0 + 1)).values.cloud_docs).toBe(70);
    await updateSettings(db, { limits: { assets: 3 } });
    expect((await getLimits(db, noEnv, "a", t0 + 2)).values.assets).toBe(3);
    await deletePlan(db, "ghost");
  });
  it("is per database, so one server's cache never answers for another", async () => {
    const other = createNodeDb(":memory:") as unknown as Db;
    await other
      .insert(users)
      .values({ id: "a", email: "a@x.co", plan: "pro", createdAt: 1, updatedAt: 1 });
    expect((await getLimits(db, noEnv, "a", t0)).values.cloud_docs).toBe(50);
    expect((await getLimits(other, noEnv, "a", t0)).values.cloud_docs).toBe(5);
  });
});
