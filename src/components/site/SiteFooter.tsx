import { Link } from "@tanstack/react-router";
import { SITE } from "@/lib/seo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
        <span>
          &copy; {new Date().getFullYear()} {SITE.author}. MIT licensed.
        </span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link className="hover:text-foreground" to="/guides">
            Guides
          </Link>
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
        </nav>
      </div>
    </footer>
  );
}
