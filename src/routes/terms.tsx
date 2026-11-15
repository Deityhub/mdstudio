import { createFileRoute, notFound } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { legalBySlug, legalPath } from "@/lib/site/legal";
import { loadLegalMarkdown } from "@/lib/site/legal-content";
import { renderWithToc } from "@/lib/site/render-toc";
import { pageHead } from "@/lib/site/seo";

const page = legalBySlug("terms")!;

export const Route = createFileRoute("/terms")({
  loader: async () => {
    const md = await loadLegalMarkdown(page.slug);
    if (md === null) throw notFound();
    return renderWithToc(md);
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
  const { html, toc } = Route.useLoaderData();
  return <LegalPage page={page} html={html} toc={toc} />;
}
