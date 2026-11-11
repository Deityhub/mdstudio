import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { formatDate } from "@/lib/site/guides-content";
import type { LegalPage as Legal } from "@/lib/site/legal";

/** A legal page: the title and date here, the text rendered (and sanitized) from content/legal. */
export function LegalPage({ page, html }: { page: Legal; html: string }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <article>
          <h1 className="font-display text-3xl/tight font-semibold tracking-tight sm:text-5xl">
            {page.title}
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated {formatDate(page.updated)}
          </p>
          <div className="md-preview mt-8" dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
