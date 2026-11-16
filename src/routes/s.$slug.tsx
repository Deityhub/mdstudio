import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReaderSignIn } from "@/components/share/ReaderSignIn";
import { ShareComments } from "@/components/share/Comments";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Chip, SITE_WIDTH } from "@/components/site/SitePieces";
import { Standalone, StandaloneBox } from "@/components/site/Standalone";
import { cn } from "@/lib/utils";
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
      <Standalone>
        <StandaloneBox>
          <Chip tone="line" className="self-start">
            <Lock className="size-3.5" aria-hidden="true" /> Private review link
          </Chip>
          <h1 className="font-display text-[22px] font-semibold">This document is private</h1>
          <p className="text-muted-foreground">
            The writer shared it with specific people. Sign in with the email address they used to
            open it.
          </p>
          <Button size="lg" className="w-full" onClick={() => setSignIn(true)}>
            Sign in
          </Button>
          <p className="text-[13px] text-muted-foreground">
            You come straight back here after signing in.
          </p>
        </StandaloneBox>
        <ReaderSignIn
          open={signIn}
          onOpenChange={setSignIn}
          onSignedIn={reload}
          reason="Use the email address the writer invited."
        />
      </Standalone>
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
    () => renderMarkdown(data.content, "gfm-extended", {}, { sourceLines: true }),
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

  const report = `${SITE.repo}/issues/new?title=${encodeURIComponent("Report a shared page")}&body=${encodeURIComponent(`/s/${slug}`)}`;
  // The bar, the text and the footer share one width: wide enough for the comments column while it
  // shows, and just the text (centred) when it does not.
  const [side, setSide] = useState(false);
  const width = side ? "max-w-310" : "max-w-230";
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className={cn("mx-auto flex h-14 items-center gap-3 px-4 sm:px-8", width)}>
          <Logo markClassName="size-6" textClassName="text-base" />
          <Chip tone="line" className="hidden sm:inline-flex">
            {data.comments ? "Shared for review" : "Shared copy"}
          </Chip>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button asChild size="sm">
              <Link to="/editor">Open the editor</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className={cn(SITE_WIDTH, "flex-1", width)}>
        <div className="flex flex-wrap items-start gap-10 pt-9 pb-14">
          <article className="min-w-0 flex-[999_1_560px]">
            <p className="mb-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {data.kind === "private" && (
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3.5" aria-hidden="true" />
                  Only the people the writer named can open this.
                </span>
              )}
              <span>A copy shared with mdstudio on {shareDate(data.publishedAt)}.</span>
              <span>Available until {shareDate(data.expiresAt)}.</span>
            </p>
            {!/<h1[\s>]/.test(html) && <h1 className="sr-only">{title}</h1>}
            <div
              ref={body}
              className="md-preview text-[17px]"
              // sanitized by the same pipeline as the editor's preview
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <p className="mt-8 flex flex-wrap gap-3.5 text-sm text-muted-foreground">
              <span>Made with mdstudio</span>
              <a
                className="text-primary underline-offset-4 hover:underline"
                href={report}
                target="_blank"
                rel="noopener noreferrer"
              >
                Report this page
              </a>
            </p>
          </article>
          {/* the comments column, while it shows */}
          <div className={side ? "min-w-0 flex-[1_1_320px]" : "contents"}>
            <ShareComments
              slug={slug}
              html={html}
              body={body}
              enabled={data.comments}
              onSignedIn={() => data.kind === "private" && onSignedIn()}
              onSideChange={setSide}
            />
          </div>
        </div>
      </main>
      <SiteFooter widthClass={width} />
    </div>
  );
}
