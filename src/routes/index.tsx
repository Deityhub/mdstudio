import { lazy, Suspense } from "react";
import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Eye, Lock, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { GUIDES } from "@/lib/site/guides";
import { PROFILES } from "@/lib/markdown/profiles";
import { faqJsonLd, jsonLdScript, pageHead, SITE } from "@/lib/site/seo";
import { AUDIENCES, BRAND, FAQ } from "@/lib/site/seo-content";

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
    body: "A full editor with a formatting toolbar, tables, footnotes, math and diagrams, and a preview that shows CommonMark and GFM exactly, with no preview-only tricks.",
  },
  {
    title: "Check",
    body: "Pick where it is going. The preview and the checks follow that target, and every problem is a click away from its line. Turn rules on or off, or add your own.",
  },
  {
    title: "Collaborate",
    body: "Invite people by email and write the same draft together, online or off. Everyone's cursor shows, each person has their own Undo, and offline edits merge when the network returns. Up to 3 people per draft.",
  },
  {
    title: "Review",
    body: "Share a read-only copy that expires in 1 to 7 days, public or only for the people you name. Signed-in readers comment on the words they select; you resolve them from the editor.",
  },
  {
    title: "Publish",
    body: "Commit to a GitHub branch, open a pull request or post a gist, with your images committed beside the file. Or export clean Markdown or HTML and publish it anywhere.",
  },
];

const principles = [
  {
    icon: Eye,
    title: "Your Markdown is the product",
    body: "The text is the single source of truth. Nothing rewrites it and nothing adds syntax of its own. The preview never adds line breaks or smart quotes, so what you see is what the file says.",
  },
  {
    icon: Lock,
    title: "Local-first",
    body: "Drafts are saved in your browser as you type, and the editor works with no connection once loaded. Cloud drafts are a choice you make per draft, not a default. AI runs on your own key, straight from your browser to your provider.",
  },
  {
    icon: Server,
    title: "Yours to run",
    body: "MIT licensed. One docker compose up runs the whole thing with your own database and storage. The hosted site is the same code.",
  },
];

const alsoInTheBox = [
  "Search every draft by name or by the words inside it, with folders, tags, and ZIP import and export",
  "Version history, compared side by side with the draft, restored in one click",
  "AI on your own key: rewrite, shorten, translate, proofread, or Fix with AI on a flagged check, always shown as a diff you accept or reject",
  "Paste from Google Docs, Notion or the web and get clean Markdown",
  "Install it as an app",
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
        <section className="grid items-center gap-12 py-16 md:grid-cols-[1fr_1.1fr] md:py-24">
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
              mdstudio is an open-source Markdown editor that checks your writing before it leaves
              for GitHub, a blog or a docs site. The preview follows the rules of the target you
              pick, and a checker points at every line that will break somewhere else. When it is
              ready, send it for review, write it with someone else, or publish it from the same
              page.
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
              No account needed. Drafts stay in your browser until you choose otherwise.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <img
              src="/home-editor-light.png"
              width={1600}
              height={700}
              alt="The mdstudio editor: a Markdown draft beside its preview, with the portability report open on the left listing what will not travel."
              className="block h-auto w-full dark:hidden"
            />
            <img
              src="/home-editor-dark.png"
              width={1600}
              height={700}
              alt="The mdstudio editor: a Markdown draft beside its preview, with the portability report open on the left listing what will not travel."
              className="hidden h-auto w-full dark:block"
            />
          </div>
        </section>

        <section id="try-it" className="scroll-mt-6 border-t border-border py-16">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">
            See what won&rsquo;t travel
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            This is the real checker, running in your browser. Edit the Markdown, switch the target,
            and watch the report change. The same sample is clean for one target and broken for
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
          aria-labelledby="how-heading"
        >
          <h2 id="how-heading" className="font-display text-2xl font-semibold sm:text-3xl">
            From first draft to published
          </h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
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
          <p className="mt-8 max-w-3xl text-sm text-muted-foreground">
            Writing, checking and exporting need no account and no connection. Collaborating,
            reviewing and publishing keep a draft in your cloud, which needs an email address you
            confirm.
          </p>
        </section>

        <section className="border-t border-border py-16" aria-labelledby="built-heading">
          <h2 id="built-heading" className="font-display text-2xl font-semibold sm:text-3xl">
            What it is built on
          </h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {principles.map((f) => (
              <div key={f.title}>
                <f.icon className="size-5 text-primary" />
                <h3 className="mt-3 font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-10 border-t border-border py-16 md:grid-cols-2">
          <div aria-labelledby="box-heading">
            <h2 id="box-heading" className="font-display text-2xl font-semibold sm:text-3xl">
              Also in the box
            </h2>
            <ul className="mt-6 list-disc space-y-2 pl-5 text-muted-foreground">
              {alsoInTheBox.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div aria-labelledby="who-heading">
            <h2 id="who-heading" className="font-display text-2xl font-semibold sm:text-3xl">
              Who it&rsquo;s for
            </h2>
            <ul className="mt-6 list-disc space-y-2 pl-5 text-muted-foreground">
              {AUDIENCES.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-border py-16" aria-labelledby="targets-heading">
          <h2 id="targets-heading" className="font-display text-2xl font-semibold sm:text-3xl">
            Pick where you publish
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Each target changes the preview, the checks and the toolbar warnings, so you find out
            before your readers do.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROFILES.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-display text-lg font-semibold">{p.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.hint}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
            The targets are named for their rules, not for a website. They are our best reading of
            how each family of tools renders Markdown, and where a platform differs, the guides say
            how.
          </p>
        </section>

        <section className="border-t border-border py-16" aria-labelledby="guides-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="guides-heading" className="font-display text-2xl font-semibold sm:text-3xl">
                Guides
              </h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Where Markdown flavors differ, and how to review, write together and publish it.
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

        <section className="border-t border-border py-16" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="font-display text-2xl font-semibold sm:text-3xl">
            Frequently asked questions
          </h2>
          <div className="mt-6 border-t border-border md:columns-2 md:gap-x-12">
            {FAQ.map((f) => (
              <details
                key={f.question}
                className="group break-inside-avoid border-b border-border py-4"
              >
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
            Open source, local-first and yours to run. Open the editor and start typing.
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
