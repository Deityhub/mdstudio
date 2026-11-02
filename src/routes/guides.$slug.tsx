import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Button } from "@/components/ui/button";
import { GUIDES, guideBySlug, readingMinutes } from "@/lib/site/guides";
import {
  formatDate,
  headingIds,
  loadGuideMarkdown,
  relatedGuides,
  withHeadingIds,
} from "@/lib/site/guides-content";
import { getOutline, renderMarkdown } from "@/lib/markdown/markdown";
import { articleJsonLd, breadcrumbJsonLd, jsonLdScript, pageHead } from "@/lib/site/seo";

export const Route = createFileRoute("/guides/$slug")({
  // Rendered with mdstudio's own pipeline (sanitized), so the guides practice what they preach.
  loader: async ({ params }) => {
    const guide = guideBySlug(params.slug);
    const md = guide ? await loadGuideMarkdown(guide.slug) : null;
    if (!guide || md === null) throw notFound();
    const sections = getOutline(md).filter((h) => h.depth === 2);
    const ids = headingIds(sections.map((s) => s.text));
    return {
      guide,
      html: withHeadingIds(renderMarkdown(md, "github"), ids),
      minutes: readingMinutes(md),
      toc: sections.map((s, i) => ({ text: s.text, id: ids[i]! })),
    };
  },
  head: ({ loaderData, params }) => {
    const guide = loaderData?.guide ?? guideBySlug(params.slug);
    if (!guide) return {};
    return {
      ...pageHead({
        title: `${guide.title} | mdstudio`,
        description: guide.description,
        path: `/guides/${guide.slug}`,
      }),
      scripts: [
        jsonLdScript(articleJsonLd(guide)),
        jsonLdScript(
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Guides", path: "/guides" },
            { name: guide.title, path: `/guides/${guide.slug}` },
          ]),
        ),
      ],
    };
  },
  component: GuidePage,
});

function GuidePage() {
  const { guide, html, minutes, toc } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-x-2">
            <li>
              <Link to="/" className="hover:text-foreground">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link to="/guides" className="hover:text-foreground">
                Guides
              </Link>
            </li>
          </ol>
        </nav>
        <article className="mt-6">
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {guide.title}
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Updated {formatDate(guide.updated)} · {minutes} min read
          </p>
          <nav
            aria-label="On this page"
            className="mt-6 rounded-xl border border-border bg-card p-5"
          >
            <p className="font-display text-lg font-semibold">On this page</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              {toc.map((t) => (
                <li key={t.id}>
                  <a className="text-primary hover:underline" href={`#${t.id}`}>
                    {t.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          {/* sanitized by renderMarkdown (rehype-sanitize) */}
          <div className="md-preview mt-8" dangerouslySetInnerHTML={{ __html: html }} />
        </article>

        <section className="mt-12 rounded-2xl bg-primary px-6 py-10 text-center text-primary-foreground">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">
            Check your own Markdown
          </h2>
          <p className="mx-auto mt-2 max-w-md opacity-90">
            Free, open source and private. Pick a target platform and see what won&rsquo;t travel.
          </p>
          <div className="mt-6">
            <Button asChild size="lg" variant="secondary">
              <Link to="/editor">
                Open the editor <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="more-guides">
          <h2 id="more-guides" className="font-display text-2xl font-semibold">
            More guides
          </h2>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {relatedGuides(GUIDES, guide.slug).map((g) => (
              <li key={g.slug} className="py-4">
                <Link
                  to="/guides/$slug"
                  params={{ slug: g.slug }}
                  className="font-medium hover:text-primary"
                >
                  {g.title}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">{g.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
