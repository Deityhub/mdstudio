import { expect, test } from "@playwright/test";
import { readLegalCatalogue } from "../infra/legal-catalogue";
import { SITE } from "../src/lib/site/site";

for (const p of readLegalCatalogue()) {
  test(`${p.slug}: a public, indexable page with the contact address`, async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/${p.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: p.title })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${SITE.url}/${p.slug}`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("link", { name: SITE.contactEmail }).first(),
    ).toHaveAttribute("href", `mailto:${SITE.contactEmail}`);
    // reachable from the footer of any page, and listed for search engines
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Footer" })
      .getByRole("link", { name: /Privacy|Terms/ })
      .first()
      .waitFor();
    await expect(
      page
        .getByRole("navigation", { name: "Footer" })
        .getByRole("link", { name: p.slug === "privacy" ? "Privacy" : "Terms" }),
    ).toHaveAttribute("href", `/${p.slug}`);
    expect(await (await request.get("/sitemap.xml")).text()).toContain(`${SITE.url}/${p.slug}`);
    expect(errors).toEqual([]);
  });
}
