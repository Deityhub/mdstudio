import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
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
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Markdown guides
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Practical, platform-aware guides to writing Markdown that renders the same on GitHub,
          dev.to, Obsidian and any CommonMark tool. Each one explains what differs and how to avoid
          surprises.
        </p>
        <ul className="mt-10 divide-y divide-border border-y border-border">
          {GUIDES.map((g) => (
            <li key={g.slug} className="py-6">
              <h2 className="font-display text-2xl font-semibold">
                <Link
                  to="/guides/$slug"
                  params={{ slug: g.slug }}
                  className="hover:text-primary"
                  data-guide={guidePath(g.slug)}
                >
                  {g.title}
                </Link>
              </h2>
              <p className="mt-2 text-muted-foreground">{g.description}</p>
              <p className="mt-2 text-sm text-muted-foreground">Updated {formatDate(g.updated)}</p>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
