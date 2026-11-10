import { expect, test } from "@playwright/test";
import { email, makeAdmin, password, signUp } from "./admin-helpers";

test("the admin API and page are invisible to anyone who is not an admin", async ({
  page,
  request,
}) => {
  // signed out
  expect((await request.get("/api/admin/overview")).status()).toBe(404);
  await signUp(page.request);
  expect((await page.request.get("/api/admin/overview")).status()).toBe(404);
  expect((await page.request.get("/api/admin/users")).status()).toBe(404);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("an admin looks after an account: suspend, limits, sign-in and the audit log", async ({
  page,
  playwright,
  baseURL,
}) => {
  const admin = await signUp(page.request);
  makeAdmin(admin.address);
  const writerAddress = email("writer");
  const writer = await playwright.request.newContext({ baseURL: baseURL! });
  const { id: writerId } = await signUp(writer, writerAddress);

  await page.goto("/admin");
  await expect(page.getByText("Accounts", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Accounts" }).click();
  await page.getByLabel("Search accounts").fill(writerAddress);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: writerAddress }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: writerAddress })).toBeVisible();

  // suspend: its session stops working at once, and it cannot sign in
  await dialog.getByRole("switch", { name: /Suspended/ }).click();
  await dialog.getByRole("button", { name: "Save account" }).click();
  await expect(dialog.getByText("suspended", { exact: true })).toBeVisible();
  expect((await writer.get("/api/sync/pull")).status()).toBe(401);
  const blocked = await writer.post("/api/auth/login", {
    data: { email: writerAddress, password },
  });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).error).toBe("suspended");

  // reinstate
  await dialog.getByRole("switch", { name: /Suspended/ }).click();
  await dialog.getByRole("button", { name: "Save account" }).click();
  await expect(dialog.getByText("suspended", { exact: true })).toBeHidden();
  expect(
    (await writer.post("/api/auth/login", { data: { email: writerAddress, password } })).status(),
  ).toBe(200);

  // a limit for this account only
  await dialog.getByLabel("Cloud drafts", { exact: true }).fill("2");
  await dialog.getByRole("button", { name: "Save limits" }).click();
  await expect(dialog.getByText("Set here").first()).toBeVisible();
  const detail = await (await page.request.get(`/api/admin/users/${writerId}`)).json();
  expect(detail.limits.cloud_docs).toEqual({ value: 2, source: "override" });
  expect((await (await writer.get("/api/sync/pull")).json()).limit).toBe(2);

  // the work is in the audit log
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Audit log" }).click();
  await expect(page.getByText("Changed an account").first()).toBeVisible();
  await expect(page.getByText(writerAddress).first()).toBeVisible();
  await writer.dispose();
});

test("an admin can make a plan, and the dashboard refuses to lock out the last admin", async ({
  page,
}) => {
  const admin = await signUp(page.request);
  makeAdmin(admin.address);
  const name = `e2e-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/admin?tab=plans");
  await page.getByRole("button", { name: "New plan" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Label").fill("E2E plan");
  await page.getByLabel("Cloud drafts", { exact: true }).fill("77");
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByText(name)).toBeVisible();
  const plans = await (await page.request.get("/api/admin/plans")).json();
  expect(plans.plans.find((p: { name: string }) => p.name === name).limits).toEqual({
    cloud_docs: 77,
  });
  await page
    .getByRole("listitem")
    .filter({ hasText: name })
    .getByRole("button", { name: "Delete" })
    .click();
  await page.getByRole("button", { name: "Delete plan?" }).click();
  await expect(page.getByText(name)).toBeHidden();

  // an admin cannot demote themselves
  const own = await page.request.patch(`/api/admin/users/${admin.id}`, {
    headers: { origin: new URL(page.url()).origin },
    data: { role: "user" },
  });
  expect(own.status()).toBe(409);
});
