import { expect, test, type APIRequestContext } from "@playwright/test";
import { SITE, password, signUp as signUpOnMailServer, unique } from "./mail-server";

const email = () => `share-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
const DAY = 86_400_000;

// Ids are sent as `<userId>:<id>`, so a spec learns its user id after signing up.
async function signUp(request: APIRequestContext) {
  await request.post("/api/auth/signup", { data: { email: email(), password } });
  return (await (await request.get("/api/auth/me")).json()).user.id as string;
}
async function cloudDraft(
  request: APIRequestContext,
  userId: string,
  content = "# Notes\n\nfirst",
) {
  const id = `d${Math.random().toString(36).slice(2, 8)}`;
  const item = {
    id: `${userId}:${id}`,
    baseVersion: 0,
    title: "Notes",
    content,
    createdAt: Date.now(),
    editedAt: Date.now(),
  };
  await request.post("/api/sync/push", { data: { docs: [item] } });
  return { id, item };
}
const publish = (request: APIRequestContext, id: string, days?: number) =>
  request.post("/api/share", { data: { id, ...(days === undefined ? {} : { days }) } });
const sitemap = async (request: APIRequestContext) => (await request.get("/sitemap.xml")).text();

test("sharing needs a session", async ({ request }) => {
  expect((await request.get("/api/share")).status()).toBe(401);
  expect((await publish(request, "x")).status()).toBe(401);
  expect((await request.delete("/api/share/x")).status()).toBe(401);
});

test("a cloud draft is published for 4 days, listed, and in the sitemap", async ({ request }) => {
  const me = await signUp(request);
  const { id } = await cloudDraft(request, me);
  const r = await publish(request, id);
  expect(r.status()).toBe(200);
  const { share, created } = await r.json();
  expect(created).toBe(true);
  expect(share.slug).toMatch(/^[\w-]{12}$/);
  expect(share.url).toMatch(new RegExp(`/s/${share.slug}$`));
  expect(share.expiresAt - share.publishedAt).toBe(4 * DAY);

  const listed = await (await request.get("/api/share")).json();
  expect(listed.shares).toEqual([expect.objectContaining({ id, slug: share.slug })]);
  expect(listed).toMatchObject({ defaultDays: 4, maxDays: 7 });
  expect(await sitemap(request)).toContain(`/s/${share.slug}`);
});

test("a draft that is not in the cloud, or bad days, are refused", async ({ request }) => {
  const me = await signUp(request);
  expect((await publish(request, "never-pushed")).status()).toBe(404);
  const { id } = await cloudDraft(request, me);
  for (const days of [0, 8, 1.5])
    expect((await publish(request, id, days)).status(), String(days)).toBe(400);
  expect((await publish(request, id, 7)).status()).toBe(200);
});

test("publishing again copies the new text, extending changes the expiry, revoking removes it", async ({
  request,
}) => {
  const me = await signUp(request);
  const { id, item } = await cloudDraft(request, me);
  const first = (await (await publish(request, id, 2)).json()).share;

  await request.post("/api/sync/push", {
    data: {
      docs: [{ ...item, baseVersion: 1, content: "# Notes\n\nsecond", editedAt: Date.now() + 1 }],
    },
  });
  const unchanged = (await (await request.get("/api/share")).json()).shares[0];
  expect(unchanged.hash).toBe(first.hash); // the public copy waits for the writer

  const again = await (await publish(request, id)).json();
  expect(again.created).toBe(false);
  expect(again.share.slug).toBe(first.slug);
  expect(again.share.hash).not.toBe(first.hash);
  expect(again.share.expiresAt).toBe(first.expiresAt);

  const longer = await request.patch(`/api/share/${id}`, { data: { days: 6 } });
  expect(longer.status()).toBe(200);
  const { share } = await longer.json();
  expect(Math.abs(share.expiresAt - (Date.now() + 6 * DAY))).toBeLessThan(60_000);
  expect((await request.patch(`/api/share/${id}`, { data: { days: 9 } })).status()).toBe(400);

  expect((await request.delete(`/api/share/${id}`)).status()).toBe(200);
  expect((await request.delete(`/api/share/${id}`)).status()).toBe(404);
  expect((await (await request.get("/api/share")).json()).shares).toEqual([]);
  expect(await sitemap(request)).not.toContain(`/s/${first.slug}`);
});

test("deleting the draft from the cloud takes its link down", async ({ request }) => {
  const me = await signUp(request);
  const { id, item } = await cloudDraft(request, me);
  const { share } = await (await publish(request, id)).json();
  expect(await sitemap(request)).toContain(share.slug);
  await request.post("/api/sync/push", {
    data: { docs: [{ ...item, baseVersion: 1, deleted: true, editedAt: Date.now() + 1 }] },
  });
  expect((await (await request.get("/api/share")).json()).shares).toEqual([]);
  expect(await sitemap(request)).not.toContain(share.slug);
});

test("nobody else can read, change or remove your link, and cross-site requests are refused", async ({
  playwright,
  request,
}) => {
  const me = await signUp(request);
  const { id } = await cloudDraft(request, me);
  await publish(request, id);

  const other = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signUp(other);
  expect((await (await other.get("/api/share")).json()).shares).toEqual([]);
  expect((await publish(other, id)).status()).toBe(404);
  expect((await other.patch(`/api/share/${id}`, { data: { days: 2 } })).status()).toBe(404);
  expect((await other.delete(`/api/share/${id}`)).status()).toBe(404);
  await other.dispose();

  const cross = await request.post("/api/share", {
    data: { id },
    headers: { origin: "https://evil.example" },
  });
  expect(cross.status()).toBe(403);
  const crossDelete = await request.delete(`/api/share/${id}`, {
    headers: { origin: "https://evil.example" },
  });
  expect(crossDelete.status()).toBe(403);
  expect((await (await request.get("/api/share")).json()).shares).toHaveLength(1);
});

test.describe("on a server that confirms email addresses", () => {
  test.use({ baseURL: SITE });

  test("an unconfirmed account cannot share", async ({ request }) => {
    expect((await signUpOnMailServer(request, `share-${unique()}@example.com`)).status()).toBe(200);
    for (const response of [await request.get("/api/share"), await publish(request, "x")]) {
      expect(response.status()).toBe(403);
      expect((await response.json()).error).toBe("email_unverified");
    }
  });
});
