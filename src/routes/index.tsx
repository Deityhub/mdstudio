import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, FileDown, Github, ShieldCheck, Upload, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { faqJsonLd, jsonLdScript, pageHead, SITE } from "@/lib/seo";
import { AUDIENCES, BRAND, FAQ, LONG_DESCRIPTION } from "@/lib/seo-content";

export const Route = createFileRoute("/")({
  head: () => {
    const head = pageHead({ title: BRAND.homeTitle, description: BRAND.description, path: "/" });
    return { ...head, scripts: [jsonLdScript(faqJsonLd())] };
  },
  component: Index,
});

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
    icon: Upload,
    title: "Import, paste, drop",
    body: "Open .md files, or paste from Google Docs, Notion and the web. It's converted to clean Markdown.",
  },
  {
    icon: FileDown,
    title: "Clean export",
    body: "Download or copy .md with UTF-8 and LF endings, optional normalizing, and self-contained images.",
  },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-4 sm:px-6 sm:py-6">
        <span className="min-w-0 font-display text-base font-semibold sm:text-xl">
          <span className="text-primary">md</span>studio
        </span>
        <Button asChild variant="ghost">
          <a
            href={SITE.repo}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="mdstudio on GitHub (opens in a new tab)"
          >
            <Github className="h-4 w-4" /> GitHub <ArrowUpRight className="h-4 w-4" />
          </a>
        </Button>
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid gap-12 py-16 items-start md:grid-cols-[1.1fr_1fr] md:py-24">
          <div>
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-primary">
              Free Markdown editor
            </p>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
              Write once.
              <br />
              Render the same <em className="text-primary">everywhere.</em>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              mdstudio is a free, open-source Markdown editor with a live preview that matches
              GitHub, dev.to and Obsidian, and a checker that flags anything that won&rsquo;t
              travel. Then export a clean file that just works.
            </p>
            <div className="mt-8 flex gap-3">
              <Button asChild size="lg">
                <Link to="/editor">
                  Start writing <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              No account needed. Drafts stay in your browser.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex gap-1.5 border-b border-border px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="grid min-w-0 grid-cols-1 text-sm sm:grid-cols-2">
              <pre className="min-w-0 overflow-x-auto border-b border-border bg-paper sm:border-b-0 sm:border-r p-5 font-mono text-[13px] leading-relaxed text-muted-foreground">{`# Hello
Some **bold** text
on two lines.

- [x] portable
- [ ] surprises`}</pre>
              <div className="md-preview p-5 text-sm">
                <h1 className="!mt-0 !text-2xl">Hello</h1>
                <p>
                  Some <strong>bold</strong> text on two lines.
                </p>
                <ul>
                  <li className="task-list-item">
                    <input type="checkbox" checked disabled readOnly /> portable
                  </li>
                  <li className="task-list-item">
                    <input type="checkbox" disabled /> surprises
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
        <section className="grid gap-6 border-t border-border py-16 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title}>
              <f.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-3 font-display text-lg font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
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
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>
            &copy; {new Date().getFullYear()} {SITE.author}. MIT licensed.
          </span>
          <a className="hover:text-foreground" href={SITE.repo} rel="noopener noreferrer">
            Source on GitHub
          </a>
          <a
            className="hover:text-foreground"
            href={`${SITE.repo}/blob/main/CHANGELOG.md`}
            rel="noopener noreferrer"
          >
            Changelog
          </a>
          <Link className="hover:text-foreground" to="/editor">
            Open the editor
          </Link>
        </div>
      </footer>
    </div>
  );
}
