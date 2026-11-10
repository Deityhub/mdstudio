// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { deletePlan, getPlan, listPlans, savePlan } from "../limits/plans";
import { getPublicSettings, getSettings, updateSettings } from "./service";

let db: Db;
beforeEach(() => {
  db = createNodeDb(":memory:") as unknown as Db;
});

describe("server settings", () => {
  it("start open, with no notice and no default limits", async () => {
    expect(await getSettings(db)).toEqual({ limits: {}, signupsOpen: true, notice: null });
  });
  it("close sign-ups, set and clear a notice, and set and remove a default limit", async () => {
    await updateSettings(db, {
      signupsOpen: false,
      notice: "  Back at noon  ",
      limits: { cloud_docs: 9 },
    });
    expect(await getSettings(db)).toEqual({
      limits: { cloud_docs: 9 },
      signupsOpen: false,
      notice: "Back at noon",
    });
    expect(await getPublicSettings(db)).toEqual({ signupsOpen: false, notice: "Back at noon" });
    await updateSettings(db, { notice: "", limits: { cloud_docs: null } });
    expect(await getSettings(db)).toMatchObject({ limits: {}, notice: null, signupsOpen: false });
  });
  it("refuses a bad change and changes nothing", async () => {
    for (const patch of [
      { signupsOpen: "no" },
      { notice: 5 },
      { notice: "x".repeat(301) },
      { limits: { cloud_docs: -1 } },
      { limits: { nope: 1 } },
    ])
      expect(await updateSettings(db, patch)).toEqual({ ok: false, error: "invalid" });
    await updateSettings(db, { notice: "keep", limits: { cloud_docs: 3 } });
    expect(await updateSettings(db, { notice: "new", limits: { cloud_docs: -1 } })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await getSettings(db)).toMatchObject({ notice: "keep", limits: { cloud_docs: 3 } });
  });
});

describe("plans", () => {
  it("always has free, which changes nothing", async () => {
    expect(await listPlans(db)).toEqual([{ name: "free", label: "Free", limits: {} }]);
  });
  it("makes and changes a plan, and refuses odd names, free and bad limits", async () => {
    expect(
      await savePlan(db, {
        name: "pro",
        label: "Pro",
        limits: { cloud_docs: 100, private_links: true },
      }),
    ).toEqual({ ok: true });
    await savePlan(db, { name: "pro", label: "Pro plus", limits: { cloud_docs: 200 } });
    expect(await getPlan(db, "pro")).toEqual({
      name: "pro",
      label: "Pro plus",
      limits: { cloud_docs: 200 },
    });
    for (const input of [
      { name: "Pro!", label: "x", limits: {} },
      { name: "free", label: "x", limits: {} },
      { name: "ok", label: "", limits: {} },
      { name: "ok", label: "x", limits: { cloud_docs: -5 } },
      { name: "ok", label: "x", limits: [] },
    ])
      expect(await savePlan(db, input)).toEqual({ ok: false, error: "invalid" });
  });
  it("cannot be removed while someone is on it", async () => {
    await savePlan(db, { name: "pro", label: "Pro", limits: {} });
    await db
      .insert(users)
      .values({ id: "a", email: "a@x.co", plan: "pro", createdAt: 1, updatedAt: 1 });
    expect(await deletePlan(db, "pro")).toEqual({ ok: false, error: "in_use" });
    expect(await deletePlan(db, "free")).toEqual({ ok: false, error: "invalid" });
    expect(await deletePlan(db, "ghost")).toEqual({ ok: false, error: "not_found" });
    await db.delete(users);
    expect(await deletePlan(db, "pro")).toEqual({ ok: true });
  });
});
