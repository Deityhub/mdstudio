import { createFileRoute } from "@tanstack/react-router";
import { SITEMAP_ENTRIES, sitemapXml } from "@/lib/site/seo";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      // the fixed pages, plus the share links that are live right now
      GET: async ({ request }) => {
        const shares = await (await import("@/server/share/routes")).sitemapShareEntries(request);
        return new Response(sitemapXml([...SITEMAP_ENTRIES, ...shares]), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
