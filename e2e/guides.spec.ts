import { expect, test } from "@playwright/test";
import { GUIDES } from "../src/lib/site/guides";

const ORIGIN = "https://mdstudio.deityhub.com";

test("the guides index lists every guide with a canonical URL and breadcrumbs", async ({
  page,
}) => {
  await page.goto("/guides");
  await expect(page.getByRole("heading", { level: 1, name: "Markdown guides" })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${ORIGIN}/guides`);
  for (const g of GUIDES)
    await expect(page.getByRole("link", { name: g.title, exact: true })).toBeVisible();
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) =>
    JSON.parse(t),
  );
  expect(ld.some((d) => d["@type"] === "BreadcrumbList")).toBe(true);
});

for (const g of GUIDES) {
  test(`guide: ${g.slug}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    const response = await page.goto(`/guides/${g.slug}`);
    expect(response?.status()).toBe(200);

    // one h1 (the title), several sections, real content
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(g.title);
    expect(await page.locator(".md-preview h2").count()).toBeGreaterThanOrEqual(3);
    expect((await page.locator("article").innerText()).split(/\s+/).length).toBeGreaterThan(350);

    // head: title, description, canonical, article and breadcrumb data
    await expect(page).toHaveTitle(`${g.title} | mdstudio`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      g.description,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${ORIGIN}/guides/${g.slug}`,
    );
    const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).map(
      (t) => JSON.parse(t),
    );
    expect(ld.find((d) => d["@type"] === "TechArticle")).toMatchObject({
      headline: g.title,
      datePublished: g.published,
      dateModified: g.updated,
    });
    expect(ld.find((d) => d["@type"] === "BreadcrumbList").itemListElement).toHaveLength(3);

    // every "On this page" link points at a heading that exists
    const targets = await page
      .getByRole("navigation", { name: "On this page" })
      .getByRole("link")
      .evaluateAll((links) => links.map((a) => a.getAttribute("href")!.slice(1)));
    expect(targets.length).toBeGreaterThanOrEqual(3);
    for (const id of targets) await expect(page.locator(`h2[id="${id}"]`)).toHaveCount(1);

    // sanitized output and no console errors under the production CSP
    await expect(page.locator(".md-preview script")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("an unknown guide is a real 404", async ({ page }) => {
  const response = await page.goto("/guides/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Page not found")).toBeVisible();
});

test("the sitemap and llms.txt list the guides", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const llms = await (await request.get("/llms.txt")).text();
  expect(sitemap).toContain(`<loc>${ORIGIN}/guides</loc>`);
  for (const g of GUIDES) {
    expect(sitemap).toContain(`<loc>${ORIGIN}/guides/${g.slug}</loc>`);
    expect(llms).toContain(`${ORIGIN}/guides/${g.slug}`);
  }
});

test("the home page links into the guides", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: GUIDES[0]!.title }).click();
  await expect(page).toHaveURL(new RegExp(`/guides/${GUIDES[0]!.slug}$`));
  await expect(page.locator("h1")).toHaveText(GUIDES[0]!.title);
  await page.getByRole("link", { name: "Open the editor" }).last().click();
  await expect(page).toHaveURL(/\/editor/);
});
