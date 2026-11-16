import { Link } from "@tanstack/react-router";
import { DocLayout } from "@/components/site/DocLayout";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { formatStamp } from "@/lib/site/guides-content";
import { LEGAL_PAGES, legalPath, type LegalPage as Legal } from "@/lib/site/legal";
import { cn } from "@/lib/utils";

/** A legal page: the title and date here, the text rendered (and sanitized) from content/legal. */
export function LegalPage({
  page,
  html,
  toc,
}: {
  page: Legal;
  html: string;
  toc: { text: string; id: string }[];
}) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <DocLayout toc={toc} tocTitle={page.title}>
        <article>
          <nav
            aria-label="Legal pages"
            className="mb-4 inline-flex gap-0.5 rounded-md border border-border bg-muted p-0.5 text-sm"
          >
            {LEGAL_PAGES.map((p) => (
              <Link
                key={p.slug}
                to={legalPath(p.slug)}
                aria-current={p.slug === page.slug ? "page" : undefined}
                className={cn(
                  "rounded px-2.5 py-1 text-muted-foreground",
                  p.slug === page.slug && "bg-background font-semibold text-foreground shadow-sm",
                )}
              >
                {p.slug === "privacy" ? "Privacy" : "Terms"}
              </Link>
            ))}
          </nav>
          <h1 className="font-display text-[clamp(30px,4vw,42px)] leading-tight font-semibold tracking-tight">
            {page.title}
          </h1>
          <p className="mt-3 mb-6 text-sm text-muted-foreground">
            Last updated <time dateTime={page.updated}>{formatStamp(page.updated, true)}</time>
          </p>
          {/* sanitized by renderMarkdown (rehype-sanitize) */}
          <div className="md-preview text-[17px]" dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </DocLayout>
      <SiteFooter />
    </div>
  );
}
