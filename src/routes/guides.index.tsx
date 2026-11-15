import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Chip, SITE_WIDTH, TILE } from "@/components/site/SitePieces";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/site/guides-content";
import { GUIDES, guidePath } from "@/lib/site/guides";
import { breadcrumbJsonLd, jsonLdScript, pageHead } from "@/lib/site/seo";

const TITLE = "Markdown Guides: Portable, Cross-Platform Writing | mdstudio";
const DESCRIPTION =
  "Practical guides to writing Markdown that renders the same on GitHub, dev.to, Obsidian and CommonMark: line breaks, images, math, diagrams and more.";

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

function GuidesIndex() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className={SITE_WIDTH}>
        <section className="pt-10 pb-6 sm:pt-14">
          <h1 className="font-display text-[clamp(34px,5vw,58px)] leading-[1.05] font-bold tracking-tight">
            Markdown guides
          </h1>
          <p className="mt-5 max-w-170 text-lg text-muted-foreground">
            Practical, platform-aware guides to writing Markdown that renders the same on GitHub,
            dev.to, Obsidian and any CommonMark tool. Each one explains what differs and how to
            avoid surprises.
          </p>
        </section>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4 pb-16">
          {GUIDES.map((g) => (
            <li key={g.slug} className={cn(TILE, "relative transition-colors hover:bg-accent")}>
              <Chip>Updated {formatDate(g.updated)}</Chip>
              <h2 className="mt-2.5 font-display text-base font-semibold">
                <Link
                  to="/guides/$slug"
                  params={{ slug: g.slug }}
                  className="after:absolute after:inset-0"
                  data-guide={guidePath(g.slug)}
                >
                  {g.title}
                </Link>
              </h2>
              <p className="mt-1.5 text-muted-foreground">{g.description}</p>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
