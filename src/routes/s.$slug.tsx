import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReaderSignIn } from "@/components/share/ReaderSignIn";
import { ShareComments } from "@/components/share/Comments";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Button } from "@/components/ui/button";
import { accountStore } from "@/lib/account/store";
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
  // A public page is the same for everyone: a browser always asks again, so a revoke or a published
  // update shows at once, and a shared cache in front may keep it for a minute. A private page is
  // for one reader, so nothing may keep it, and it is not for search engines.
  headers: ({ loaderData }) =>
    loaderData?.kind === "public"
      ? { "cache-control": "public, max-age=0, s-maxage=60" }
      : { "cache-control": "private, no-store", "x-robots-tag": "noindex" },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {};
    if (loaderData.kind === "sign_in")
      return pageHead({
        title: "Sign in to read | mdstudio",
        description: "This document is shared with specific people.",
        path: `/s/${params.slug}`,
        noindex: true,
      });
    return pageHead({
      title: `${shareTitle(loaderData.title, loaderData.content)} | mdstudio`,
      description: shareDescription(loaderData.content),
      path: `/s/${params.slug}`,
      noindex: loaderData.kind === "private",
    });
  },
  component: SharedPage,
});

function SharedPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  // the account is only needed for private pages and comments; learn who is signed in
  useEffect(() => void accountStore.refresh(), []);
  const [signIn, setSignIn] = useState(false);
  const reload = () => void router.invalidate();

  if (data.kind === "sign_in")
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl font-semibold">This document is private</h1>
          <p className="mt-2 text-muted-foreground">
            The writer shared it with specific people. Sign in with the email address they used to
            open it.
          </p>
          <Button className="mt-6" onClick={() => setSignIn(true)}>
            Sign in
          </Button>
        </main>
        <SiteFooter />
        <ReaderSignIn
          open={signIn}
          onOpenChange={setSignIn}
          onSignedIn={reload}
          reason="Use the email address the writer invited."
        />
      </div>
    );
  return <Document data={data} onSignedIn={reload} />;
}

function Document({
  data,
  onSignedIn,
}: {
  data: Extract<ReturnType<typeof Route.useLoaderData>, { content: string }>;
  onSignedIn: () => void;
}) {
  const { slug } = Route.useParams();
  const title = shareTitle(data.title, data.content);
  // Math loads only for text that uses it, and the page is drawn again once it has.
  const [mathVersion, setMathVersion] = useState(0);
  useEffect(() => {
    if (!hasMathSyntax(data.content) || isMathLoaded()) return;
    ensureMath()
      .then(() => setMathVersion((v) => v + 1))
      .catch((error) => console.error(error));
  }, [data.content]);
  const html = useMemo(
    // source lines mark each block, which is how a comment finds the block it belongs to
    () => renderMarkdown(data.content, "github", {}, { sourceLines: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.content, mathVersion],
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
          {data.kind === "private" && (
            <>
              <Lock className="mr-1 inline size-3.5" aria-hidden="true" />
              Only the people the writer named can open this.{" "}
            </>
          )}
          A copy shared with mdstudio on {shareDate(data.publishedAt)}. Available until{" "}
          {shareDate(data.expiresAt)}.{" "}
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
        <ShareComments
          slug={slug}
          html={html}
          body={body}
          enabled={data.comments}
          onSignedIn={() => data.kind === "private" && onSignedIn()}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
