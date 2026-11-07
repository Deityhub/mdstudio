import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { hydrateDiagrams, renderDiagramFor } from "@/lib/markdown/diagrams";
import { ensureMath, hasMathSyntax, isMathLoaded } from "@/lib/markdown/math";
import { renderMarkdown } from "@/lib/markdown/markdown";
import { loadSharedPage } from "@/lib/share/load";
import { shareDate, shareDescription, shareTitle } from "@/lib/share/page";
import { pageHead, SITE } from "@/lib/site/seo";
import { useResolvedTheme } from "@/lib/ui/useResolvedTheme";

export const Route = createFileRoute("/s/$slug")({
  loader: async ({ params }) => {
    const shared = await loadSharedPage({ data: { slug: params.slug } });
    if (!shared) throw notFound();
    return shared;
  },
  // Public, but a browser always asks again, so a revoked link or a published update shows at once;
  // a shared cache in front may keep it for a minute.
  headers: () => ({ "cache-control": "public, max-age=0, s-maxage=60" }),
  head: ({ loaderData, params }) =>
    loaderData
      ? pageHead({
          title: `${shareTitle(loaderData.title, loaderData.content)} | mdstudio`,
          description: shareDescription(loaderData.content),
          path: `/s/${params.slug}`,
        })
      : {},
  component: SharedPage,
});

function SharedPage() {
  const { slug } = Route.useParams();
  const shared = Route.useLoaderData();
  const title = shareTitle(shared.title, shared.content);
  // Math loads only for text that uses it, and the page is drawn again once it has.
  const [mathVersion, setMathVersion] = useState(0);
  useEffect(() => {
    if (!hasMathSyntax(shared.content) || isMathLoaded()) return;
    ensureMath()
      .then(() => setMathVersion((v) => v + 1))
      .catch((error) => console.error(error));
  }, [shared.content]);
  const html = useMemo(
    () => renderMarkdown(shared.content, "obsidian"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shared.content, mathVersion],
  );
  // Diagrams are drawn in the browser, in the colors of the theme in use.
  const theme = useResolvedTheme();
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current)
      hydrateDiagrams(body.current, renderDiagramFor(theme)).catch((e) => console.error(e));
  }, [html, theme]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          A copy shared with mdstudio on {shareDate(shared.publishedAt)}. Available until{" "}
          {shareDate(shared.expiresAt)}.{" "}
          <a
            className="text-primary underline-offset-4 hover:underline"
            href={`${SITE.repo}/issues/new?title=${encodeURIComponent("Report a shared page")}&body=${encodeURIComponent(`/s/${slug}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Report this page
          </a>
        </p>
        <article className="mt-8">
          {!/<h1[\s>]/.test(html) && <h1 className="sr-only">{title}</h1>}
          <div
            ref={body}
            className="md-preview"
            // sanitized by the same pipeline as the editor's preview
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
