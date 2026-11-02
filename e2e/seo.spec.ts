import { readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const ORIGIN = "https://mdstudio.deityhub.com";

test("home page carries canonical, social meta and structured data", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${ORIGIN}/`);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    `${ORIGIN}/og.png`,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );

  const ld = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "",
  );
  expect(ld).toMatchObject({ "@type": "WebApplication", isAccessibleForFree: true });
  const faq = (await page.locator('script[type="application/ld+json"]').allTextContents())
    .map((t) => JSON.parse(t))
    .find((d) => d["@type"] === "FAQPage");
  expect(faq.mainEntity.length).toBeGreaterThan(5);
  // FAQ structured data is only valid when the same questions are visible on the page
  for (const q of faq.mainEntity)
    await expect(page.locator("summary", { hasText: q.name })).toBeVisible();
  expect(errors).toEqual([]);
});

test("editor pages ask not to be indexed", async ({ page }) => {
  await page.goto("/editor");
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test("crawler files are served", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  expect(robots).toContain("User-agent: GPTBot");
  expect(robots).toContain("Disallow: /api/");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.headers()["content-type"]).toContain("application/xml");
  expect(await sitemap.text()).toContain(`<loc>${ORIGIN}/</loc>`);

  expect(await (await request.get("/llms.txt")).text()).toContain("# mdstudio");
  expect((await request.get("/manifest.webmanifest")).ok()).toBe(true);
  for (const f of [
    "/og.png",
    "/favicon.svg",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/icon-512.png",
  ])
    expect((await request.get(f)).ok(), f).toBe(true);
});

test("the IndexNow key file answers with its own key", async ({ request }) => {
  const file = readdirSync("public").find((f) => /^[0-9a-f]{32}\.txt$/.test(f))!;
  expect(await (await request.get(`/${file}`)).text()).toBe(file.replace(".txt", ""));
});
