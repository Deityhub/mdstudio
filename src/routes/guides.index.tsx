import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Chip, SITE_WIDTH, TILE } from "@/components/site/SitePieces";
import { cn } from "@/lib/utils";
import { formatStamp } from "@/lib/site/guides-content";
import { GUIDES, guidePath, type Guide } from "@/lib/site/guides";
import { breadcrumbJsonLd, jsonLdScript, pageHead } from "@/lib/site/seo";

const TITLE = "Markdown Guides: Portable, Cross-Platform Writing | mdstudio";
const DESCRIPTION =
  "Practical guides to writing Markdown that renders the same on GitHub, blogging platforms, Obsidian and CommonMark: line breaks, images, math, diagrams and more.";

export const Route = createFileRoute("/guides/")({
  head: () => ({
    ...pageHead({ title: TITLE, description: DESCRIPTION, path: "/guides" }),
    scripts: [
      jsonLdScript(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Guides", path: "/guides" },
        ]),
      ),
    ],
  }),
  component: GuidesIndex,
});

/** When a guide went out, and how long it takes to read, at the far right of the same line. */
function Meta({ guide, time = false }: { guide: Guide; time?: boolean }) {
  return (
    <p className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <time dateTime={guide.published}>{formatStamp(guide.published, time)}</time>
      <span>{guide.minutes} min read</span>
    </p>
  );
}

function GuidesIndex() {
  const [latest, ...rest] = GUIDES;
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className={SITE_WIDTH}>
        <section className="pt-10 pb-8 sm:pt-14">
          <h1 className="font-display text-[clamp(34px,5vw,58px)] leading-[1.05] font-bold tracking-tight">
            Markdown guides
          </h1>
          <p className="mt-5 max-w-170 text-lg text-muted-foreground">
            Practical, platform-aware guides to writing Markdown that renders the same on GitHub,
            blogging platforms, Obsidian and any CommonMark tool, and how to review, write together
            and publish it. Each one says what differs and how to avoid surprises.
          </p>
        </section>
        {latest && (
          <article
            aria-labelledby="latest-guide"
            className={cn(TILE, "relative p-5 transition-colors hover:bg-accent sm:p-8")}
          >
            <Chip>Latest guide</Chip>
            <h2
              id="latest-guide"
              className="mt-4 font-display text-[clamp(24px,3vw,34px)] leading-tight font-semibold tracking-tight"
            >
              <Link
                to="/guides/$slug"
                params={{ slug: latest.slug }}
                className="after:absolute after:inset-0"
                data-guide={guidePath(latest.slug)}
              >
                {latest.title}
              </Link>
            </h2>
            <p className="mt-3 max-w-170 text-lg text-muted-foreground">{latest.description}</p>
            <Meta guide={latest} time />
          </article>
        )}
        {rest.length > 0 && (
          <section aria-labelledby="all-guides" className="pt-12 pb-16">
            <h2 id="all-guides" className="font-display text-2xl font-semibold">
              All guides
            </h2>
            <ul className="mt-4 border-t border-border">
              {rest.map((g) => (
                <li key={g.slug} className="group relative border-b border-border py-5">
                  <h3 className="font-display text-lg font-semibold">
                    <Link
                      to="/guides/$slug"
                      params={{ slug: g.slug }}
                      className="transition-colors group-hover:text-primary after:absolute after:inset-0"
                      data-guide={guidePath(g.slug)}
                    >
                      {g.title}
                    </Link>
                  </h3>
                  <p className="mt-1.5 max-w-170 text-muted-foreground">{g.description}</p>
                  <Meta guide={g} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
