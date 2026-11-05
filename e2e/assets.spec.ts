import { expect, test, type APIRequestContext } from "@playwright/test";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
// Same picture with different trailing bytes: a different file to the server, still a PNG.
const variant = (n: number) => Buffer.concat([PNG, Buffer.from(`v${n}`)]);

async function signUp(request: APIRequestContext) {
  const email = `img-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await request.post("/api/auth/signup", { data: { email, password: "a long enough password" } });
}
const upload = (request: APIRequestContext, buffer: Buffer, name = "pic.png") =>
  request.post("/api/assets", { multipart: { file: { name, mimeType: "image/png", buffer } } });

test("uploads an image, serves it publicly with safe headers, and deletes it", async ({
  request,
  playwright,
}) => {
  expect((await upload(request, PNG)).status()).toBe(401);
  await signUp(request);
  const res = await upload(request, PNG);
  expect(res.status()).toBe(200);
  const { asset } = await res.json();
  expect(asset.url).toMatch(/\/a\/[0-9a-f]{32}\.png$/);

  // Anyone can fetch it, without a session, from any page.
  const visitor = await playwright.request.newContext();
  const pub = await visitor.get(asset.url);
  expect(pub.status()).toBe(200);
  expect(pub.headers()["content-type"]).toBe("image/png");
  expect(pub.headers()["cache-control"]).toContain("immutable");
  expect(pub.headers()["x-content-type-options"]).toBe("nosniff");
  expect(pub.headers()["content-security-policy"]).toContain("sandbox");
  expect(pub.headers()["cross-origin-resource-policy"]).toBe("cross-origin");
  expect(Buffer.compare(await pub.body(), PNG)).toBe(0);

  // The same picture again is the same asset.
  expect((await (await upload(request, PNG, "again.png")).json()).asset.id).toBe(asset.id);
  const listed = await (await request.get("/api/assets")).json();
  expect(listed.assets).toHaveLength(1);
  expect(listed.usage).toMatchObject({ count: 1, maxAssets: 10 });

  // Someone else cannot delete it; its owner can, and the link stops working.
  const other = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await signUp(other);
  expect((await other.delete(`/api/assets/${asset.id}`)).status()).toBe(404);
  expect((await request.delete(`/api/assets/${asset.id}`)).status()).toBe(200);
  expect((await visitor.get(asset.url)).status()).toBe(404);
  await Promise.all([visitor.dispose(), other.dispose()]);
});

test("refuses SVG and other files, cross-site uploads, and an eleventh image", async ({
  request,
}) => {
  await signUp(request);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
  const bad = await upload(request, svg, "x.svg");
  expect(bad.status()).toBe(415);
  const cross = await request.post("/api/assets", {
    multipart: { file: { name: "p.png", mimeType: "image/png", buffer: PNG } },
    headers: { origin: "https://evil.example" },
  });
  expect(cross.status()).toBe(403);

  for (let n = 0; n < 10; n++) expect((await upload(request, variant(n))).status()).toBe(200);
  const eleventh = await upload(request, variant(99));
  expect(eleventh.status()).toBe(409);
  expect((await eleventh.json()).error).toBe("limit_count");
});

test("me reports whether hosted images are available", async ({ request }) => {
  await signUp(request);
  expect((await (await request.get("/api/auth/me")).json()).providers.images).toBe(true);
});

test("an unknown or malformed image link is a 404", async ({ request }) => {
  for (const file of ["nope.png", `${"0".repeat(32)}.png`, "..%2Fx.png"])
    expect((await request.get(`/a/${file}`)).status()).toBe(404);
});
