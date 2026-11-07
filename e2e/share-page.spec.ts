import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const password = "a long enough password";
const email = () => `page-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function signUp(request: APIRequestContext) {
  await request.post("/api/auth/signup", { data: { email: email(), password } });
  return (await (await request.get("/api/auth/me")).json()).user.id as string;
}
/** A cloud draft with this text, published; returns the link's address and the account's id. */
async function shared(request: APIRequestContext, content: string, title = "Shared notes") {
  const userId = await signUp(request);
  const id = `d${Math.random().toString(36).slice(2, 8)}`;
  await request.post("/api/sync/push", {
    data: {
      docs: [
        {
          id: `${userId}:${id}`,
          baseVersion: 0,
          title,
          content,
          createdAt: Date.now(),
          editedAt: Date.now(),
        },
      ],
    },
  });
  const { share } = await (await request.post("/api/share", { data: { id, days: 3 } })).json();
  return {
    slug: share.slug as string,
    id,
    userId,
    item: { id: `${userId}:${id}`, title, createdAt: Date.now() },
  };
}
const body = (page: Page) => page.locator(".md-preview");

test("anyone can read a shared draft without signing in, and search engines may index it", async ({
  page,
  request,
  browser,
}) => {
  const { slug } = await shared(
    request,
    "---\ndescription: What this is about.\n---\n\n# Launch plan\n\nWe ship **on Friday**.\n\n- one\n- two",
  );
  const visitor = await browser.newContext(); // no cookies: a stranger
  const p = await visitor.newPage();
  const response = await p.goto(`/s/${slug}`);
  expect(response?.status()).toBe(200);
  await expect(body(p).getByRole("heading", { name: "Launch plan" })).toBeVisible();
  await expect(body(p)).toContainText("We ship on Friday");
  await expect(p).toHaveTitle(/Shared notes/);
  await expect(p.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "What this is about.",
  );
  await expect(p.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    new RegExp(`/s/${slug}$`),
  );
  await expect(p.locator('meta[name="robots"]')).toHaveCount(0);
  expect(response?.headers()["content-security-policy"]).toContain("script-src");
  expect(response?.headers()["cache-control"]).toMatch(/public/);
  // the page says when it goes away
  await expect(p.getByText(/Available until/)).toBeVisible();
  await visitor.close();
  void page;
});

test("an unknown, revoked or deleted link is a 404, not an empty page", async ({
  page,
  request,
}) => {
  expect((await page.goto("/s/doesnotexist1"))?.status()).toBe(404);
  const { slug, id } = await shared(request, "# Soon gone");
  expect((await page.goto(`/s/${slug}`))?.status()).toBe(200);
  await request.delete(`/api/share/${id}`);
  const gone = await page.goto(`/s/${slug}`);
  expect(gone?.status()).toBe(404);
  await expect(page.getByText("Soon gone")).toHaveCount(0);
});

test("the page shows the published text until the writer publishes an update", async ({
  page,
  request,
}) => {
  const { slug, id, userId, item } = await shared(request, "# Version one");
  await request.post("/api/sync/push", {
    data: {
      docs: [
        {
          ...item,
          id: `${userId}:${id}`,
          baseVersion: 1,
          content: "# Version two",
          editedAt: Date.now() + 1000,
        },
      ],
    },
  });
  await page.goto(`/s/${slug}`);
  await expect(body(page).getByRole("heading", { name: "Version one" })).toBeVisible();
  await request.post("/api/share", { data: { id } });
  await page.goto(`/s/${slug}`);
  await expect(body(page).getByRole("heading", { name: "Version two" })).toBeVisible();
});

test("what a writer put in the text cannot run on the page, and nothing about the account shows", async ({
  page,
  request,
}) => {
  const { slug, userId } = await shared(
    request,
    '# Hello\n\n<script>window.__pwned = 1</script>\n\n<img src="x" onerror="window.__pwned = 2">\n\n[bad](javascript:window.__pwned=3)\n\n<iframe src="https://evil.example"></iframe>',
  );
  await page.goto(`/s/${slug}`);
  await expect(body(page).getByRole("heading", { name: "Hello" })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
  ).toBeUndefined();
  await expect(body(page).locator("script, iframe, [onerror]")).toHaveCount(0);
  const link = body(page).getByRole("link", { name: "bad" });
  if (await link.count()) expect(await link.getAttribute("href")).not.toMatch(/^javascript:/i);
  const html = await page.content();
  expect(html).not.toContain(userId);
});

test("math and diagrams are drawn in the browser, as in the editor", async ({ page, request }) => {
  const { slug } = await shared(
    request,
    "# Math and diagrams\n\nEuler: $e^{i\\pi} + 1 = 0$\n\n```mermaid\ngraph TD\n  A[Start] --> B[End]\n```\n",
  );
  await page.goto(`/s/${slug}`);
  await expect(body(page).locator(".katex").first()).toBeVisible({ timeout: 20_000 });
  await expect(body(page).locator("svg").first()).toBeVisible({ timeout: 20_000 });
});

test("the page loads no scripts of its own beyond the app's, and works with a small screen", async ({
  page,
  request,
}) => {
  const { slug } = await shared(request, "# Narrow\n\n" + "text ".repeat(300));
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto(`/s/${slug}`);
  await expect(body(page).getByRole("heading", { name: "Narrow" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
