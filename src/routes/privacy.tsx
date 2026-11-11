import { createFileRoute, notFound } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { renderMarkdown } from "@/lib/markdown/markdown";
import { legalBySlug, legalPath } from "@/lib/site/legal";
import { loadLegalMarkdown } from "@/lib/site/legal-content";
import { pageHead } from "@/lib/site/seo";

const page = legalBySlug("privacy")!;

export const Route = createFileRoute("/privacy")({
  loader: async () => {
    const md = await loadLegalMarkdown(page.slug);
    if (md === null) throw notFound();
    return { html: renderMarkdown(md, "gfm-extended") };
  },
  head: () =>
    pageHead({
      title: `${page.title} | mdstudio`,
      description: page.description,
      path: legalPath(page.slug),
    }),
  component: Page,
});

function Page() {
  return <LegalPage page={page} html={Route.useLoaderData().html} />;
}
