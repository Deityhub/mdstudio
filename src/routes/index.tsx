import { lazy, Suspense } from "react";
import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  FileDown,
  Github,
  Lock,
  Sigma,
  ShieldCheck,
  Upload,
  Eye,
  FolderTree,
  History,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { GUIDES } from "@/lib/site/guides";
import { PROFILES } from "@/lib/markdown/profiles";
import { faqJsonLd, jsonLdScript, pageHead, SITE } from "@/lib/site/seo";
import { AUDIENCES, BRAND, FAQ, LONG_DESCRIPTION } from "@/lib/site/seo-content";

// The checker pulls in the whole Markdown engine, so it loads after the page is interactive.
const CheckerDemo = lazy(() => import("@/components/home/CheckerDemo"));

export const Route = createFileRoute("/")({
  head: () => {
    const head = pageHead({ title: BRAND.homeTitle, description: BRAND.description, path: "/" });
    return { ...head, scripts: [jsonLdScript(faqJsonLd())] };
  },
  component: Index,
});

const steps = [
  {
    title: "Write",
    body: "Draft in a full editor with a complete formatting toolbar, tables, footnotes, math and diagrams.",
  },
  {
    title: "Check",
    body: "Pick where it will be published. mdstudio previews it the way that platform renders it and flags what won't travel.",
  },
  {
    title: "Export",
    body: "Copy or download clean Markdown, or a self-contained HTML file. No lock-in, no account.",
  },
];

const features = [
  {
    icon: Eye,
    title: "What you see is what ships",
    body: "Strict CommonMark + GFM rendering. No preview-only line breaks or smart quotes.",
  },
  {
    icon: ShieldCheck,
    title: "Portability checks",
    body: "Flags raw HTML, local images, wiki-links and anything else that won't render the same everywhere.",
  },
  {
    icon: Sigma,
    title: "Math and diagrams",
    body: "KaTeX and Mermaid built in, with a warning wherever your target platform can't render them.",
  },
  {
    icon: Upload,
    title: "Import, paste, drop",
    body: "Open .md files, or paste from Google Docs, Notion and the web. It's converted to clean Markdown.",
  },
  {
    icon: FileDown,
    title: "Clean export",
    body: "Download or copy .md with UTF-8 and LF endings, optional normalizing, and self-contained images.",
  },
  {
    icon: FolderTree,
    title: "A library that scales",
    body: "Search every draft, filter by tag, organise folders by drag and drop, and move everything as a ZIP.",
  },
  {
    icon: History,
    title: "Version history",
    body: "Versions are kept as you write. Compare any of them side by side with the draft and restore it.",
  },
  {
    icon: WifiOff,
    title: "Works offline",
    body: "Open it with no connection and keep writing. Install it as an app if you like.",
  },
  {
    icon: Lock,
    title: "Private by default",
    body: "Drafts live in your browser. No account, no uploads, and AI keys never leave your session.",
  },
];

function DemoFallback() {
  return (
    <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
      Loading the checker…
    </p>
  );
}

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid items-start gap-12 py-16 md:grid-cols-[1.1fr_1fr] md:py-24">
          <div>
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-primary">
              Markdown editor
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              Write once.
              <br />
              Render the same <em className="text-primary">everywhere.</em>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              mdstudio is an open-source Markdown editor with a live preview that matches GitHub,
              dev.to and Obsidian, and a checker that flags anything that won&rsquo;t travel. Then
              export a clean file that just works.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/editor">
                  Start writing <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#try-it">Try the checker</a>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              No account needed. Drafts stay in your browser.
            </p>
          </div>
          {/* Decorative: the real, interactive version is further down the page. */}
          <div
            aria-hidden="true"
            className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
          >
            <div className="flex gap-1.5 border-b border-border px-4 py-3">
              <span className="size-2.5 rounded-full bg-muted-foreground/30" />
              <span className="size-2.5 rounded-full bg-muted-foreground/30" />
              <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="grid min-w-0 grid-cols-1 text-sm sm:grid-cols-2">
              <pre className="min-w-0 overflow-x-auto border-b border-border bg-paper p-5 font-mono text-[13px] leading-relaxed text-muted-foreground sm:border-b-0 sm:border-r">{`# Hello
Some **bold** text
on two lines.

- [x] portable
- [ ] surprises`}</pre>
              <div className="md-preview p-5 text-sm">
                <div className="font-display text-2xl font-semibold">Hello</div>
                <p>
                  Some <strong>bold</strong> text on two lines.
                </p>
                <ul>
                  <li className="task-list-item">
                    <input type="checkbox" checked disabled readOnly tabIndex={-1} /> portable
                  </li>
                  <li className="task-list-item">
                    <input type="checkbox" disabled tabIndex={-1} /> surprises
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border py-16" aria-labelledby="how-heading">
          <h2 id="how-heading" className="font-display text-2xl font-semibold sm:text-3xl">
            From draft to published, without surprises
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-display text-lg font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="try-it" className="scroll-mt-6 border-t border-border py-16">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">
            See what won&rsquo;t travel
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            This is the real checker running in your browser. Edit the Markdown, switch the target,
            and watch the report change. The same sample is clean on one platform and broken on
            another.
          </p>
          <div className="mt-8">
            <ClientOnly fallback={<DemoFallback />}>
              <Suspense fallback={<DemoFallback />}>
                <CheckerDemo />
              </Suspense>
            </ClientOnly>
          </div>
        </section>

        <section
          id="features"
          className="scroll-mt-6 border-t border-border py-16"
          aria-labelledby="features-heading"
        >
          <h2 id="features-heading" className="font-display text-2xl font-semibold sm:text-3xl">
            Everything a Markdown writer needs
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title}>
                <f.icon className="size-5 text-primary" />
                <h3 className="mt-3 font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border py-16" aria-labelledby="targets-heading">
          <h2 id="targets-heading" className="font-display text-2xl font-semibold sm:text-3xl">
            Pick where you publish
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Each target profile changes the preview, the checks and the toolbar warnings, so you
            find out before your readers do.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROFILES.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-display text-lg font-semibold">{p.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.hint}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border py-16" aria-labelledby="guides-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="guides-heading" className="font-display text-2xl font-semibold sm:text-3xl">
                Guides to portable Markdown
              </h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                What differs between GitHub, dev.to, Obsidian and CommonMark, and how to write
                Markdown that survives all of them.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/guides">
                All guides <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {GUIDES.slice(0, 3).map((g) => (
              <Link
                key={g.slug}
                to="/guides/$slug"
                params={{ slug: g.slug }}
                className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent"
              >
                <h3 className="font-display text-lg font-semibold">{g.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{g.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-10 border-t border-border py-16 md:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">About {BRAND.name}</h2>
            <p className="mt-4 max-w-prose text-muted-foreground">{LONG_DESCRIPTION}</p>
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold">Who it&rsquo;s for</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
              {AUDIENCES.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-border py-16" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="font-display text-2xl font-semibold sm:text-3xl">
            Frequently asked questions
          </h2>
          <div className="mt-6 max-w-3xl divide-y divide-border border-y border-border">
            {FAQ.map((f) => (
              <details key={f.question} className="group py-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="mr-2 text-primary group-open:hidden">+</span>
                  <span className="mr-2 hidden text-primary group-open:inline">&minus;</span>
                  {f.question}
                </summary>
                <p className="mt-2 pl-5 text-muted-foreground">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mb-16 rounded-2xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Write something that renders the same everywhere
          </h2>
          <p className="mx-auto mt-3 max-w-xl opacity-90">
            Open source and private. Open the editor and start typing.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="secondary">
              <Link to="/editor">
                Start writing <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
