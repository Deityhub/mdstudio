import { expect, test, type APIRequestContext } from "@playwright/test";

const password = "a long enough password";
const email = () => `sync-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
const doc = (over: Record<string, unknown> = {}) => ({
  id: `doc-${Math.random().toString(36).slice(2)}`,
  baseVersion: 0,
  title: "Notes",
  content: "# Notes",
  createdAt: Date.now(),
  ...over,
});
const push = (request: APIRequestContext, docs: unknown[]) =>
  request.post("/api/sync/push", { data: { docs } });

test("sync needs a session and is limited to your own documents", async ({
  playwright,
  request,
}) => {
  expect((await request.get("/api/sync/pull")).status()).toBe(401);
  expect((await push(request, [doc()])).status()).toBe(401);

  await request.post("/api/auth/signup", { data: { email: email(), password } });
  const mine = doc();
  const first = await (await push(request, [mine])).json();
  expect(first.results[0]).toMatchObject({ status: "ok", version: 1 });

  // A second account cannot read it, overwrite it or claim its id.
  const other = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await other.post("/api/auth/signup", { data: { email: email(), password } });
  expect((await (await other.get("/api/sync/pull")).json()).docs).toEqual([]);
  const stolen = await (await push(other, [{ ...mine, baseVersion: 1, content: "stolen" }])).json();
  expect(stolen.results[0]).toEqual({ id: mine.id, status: "rejected" });

  const pulled = await (await request.get("/api/sync/pull?since=0")).json();
  expect(pulled.docs).toEqual([expect.objectContaining({ id: mine.id, content: "# Notes" })]);
  await other.dispose();
});

test("a stale push is a conflict that returns the server copy", async ({ request }) => {
  await request.post("/api/auth/signup", { data: { email: email(), password } });
  const d = doc();
  await push(request, [d]);
  await push(request, [{ ...d, baseVersion: 1, content: "device one" }]);
  const late = await (
    await push(request, [{ ...d, baseVersion: 1, content: "device two" }])
  ).json();
  expect(late.results[0]).toMatchObject({
    status: "conflict",
    server: { version: 2, content: "device one" },
  });
});

test("refuses cross-site and malformed pushes", async ({ request }) => {
  await request.post("/api/auth/signup", { data: { email: email(), password } });
  const cross = await request.post("/api/sync/push", {
    data: { docs: [doc()] },
    headers: { origin: "https://evil.example" },
  });
  expect(cross.status()).toBe(403);
  expect((await request.post("/api/sync/push", { data: { docs: "nope" } })).status()).toBe(400);
  expect((await request.get("/api/sync/pull?since=-1")).status()).toBe(400);
});
