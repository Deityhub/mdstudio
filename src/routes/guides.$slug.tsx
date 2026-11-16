import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Button } from "@/components/ui/button";
import { DocLayout } from "@/components/site/DocLayout";
import { Band, TILE } from "@/components/site/SitePieces";
import { cn } from "@/lib/utils";
import { GUIDES, guideBySlug, readingMinutes } from "@/lib/site/guides";
import {
  formatStamp,
  loadGuideMarkdown,
  relatedGuides,
  stampsDiffer,
} from "@/lib/site/guides-content";
import { renderWithToc } from "@/lib/site/render-toc";
import { articleJsonLd, breadcrumbJsonLd, jsonLdScript, pageHead } from "@/lib/site/seo";

export const Route = createFileRoute("/guides/$slug")({
  // Rendered with mdstudio's own pipeline (sanitized), so the guides practice what they preach.
  loader: async ({ params }) => {
    const guide = guideBySlug(params.slug);
    const md = guide ? await loadGuideMarkdown(guide.slug) : null;
    if (!guide || md === null) throw notFound();
    return { guide, minutes: readingMinutes(md), ...renderWithToc(md) };
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

/** When it went out, and when it last changed: with the times if both fall on the same day. */
function Stamps({ published, updated }: { published: string; updated: string }) {
  const differ = stampsDiffer(published, updated);
  const time = differ === "time";
  const at = (iso: string) => <time dateTime={iso}>{formatStamp(iso, time)}</time>;
  return (
    <>
      <span>Published {at(published)}</span>
      {differ !== "none" && <span>Updated {at(updated)}</span>}
    </>
  );
}

function GuidePage() {
  const { guide, html, minutes, toc } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <DocLayout toc={toc} tocTitle="On this page">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-x-2">
            <li>
              <Link to="/" className="hover:text-foreground">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link to="/guides" className="text-primary hover:underline">
                Guides
              </Link>
            </li>
          </ol>
        </nav>
        <article className="mt-3">
          <h1 className="font-display text-[clamp(30px,4vw,42px)] leading-tight font-semibold tracking-tight">
            {guide.title}
          </h1>
          <p className="mt-3 mb-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <Stamps published={guide.published} updated={guide.updated} />
            <span>{minutes} min read</span>
          </p>
          {/* sanitized by renderMarkdown (rehype-sanitize) */}
          <div className="md-preview text-[17px]" dangerouslySetInnerHTML={{ __html: html }} />
        </article>

        <Band className="mt-8">
          <div>
            <h2 className="font-display text-xl font-semibold">Check your own Markdown</h2>
            <p className="mt-1 text-muted-foreground">
              Open source and private. Pick a target platform and see what won&rsquo;t travel.
            </p>
          </div>
          <Button asChild size="lg">
            <Link to="/editor">
              Open the editor <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Band>

        <section className="mt-12" aria-labelledby="more-guides">
          <h2 id="more-guides" className="font-display text-2xl font-semibold">
            More guides
          </h2>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            {relatedGuides(GUIDES, guide.slug).map((g) => (
              <Link
                key={g.slug}
                to="/guides/$slug"
                params={{ slug: g.slug }}
                className={cn(TILE, "transition-colors hover:bg-accent")}
              >
                <h3 className="font-display text-base font-semibold">{g.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{g.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </DocLayout>
      <SiteFooter />
    </div>
  );
}
