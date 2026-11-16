import { Link } from "@tanstack/react-router";
import { SITE } from "@/lib/site/seo";
import { cn } from "@/lib/utils";

const VERSION = import.meta.env.VITE_APP_VERSION;
const link = "hover:text-foreground";

/** Two groups: what this is on the left, where to read more on the right. */
export function SiteFooter({ widthClass = "max-w-300" }: { widthClass?: string } = {}) {
  return (
    <footer className="border-t border-border">
      <div
        className={cn(
          "mx-auto flex flex-wrap items-center justify-between gap-x-6.5 gap-y-3 px-4 pt-7 pb-10 text-sm text-muted-foreground sm:px-8",
          widthClass,
        )}
      >
        <span>mdstudio{VERSION ? ` · v${VERSION.replace(/^v/, "")}` : ""} · MIT</span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6.5 gap-y-2">
          <Link className={link} to="/guides">
            Guides
          </Link>
          <Link className={link} to="/privacy">
            Privacy
          </Link>
          <Link className={link} to="/terms">
            Terms
          </Link>
          <a
            className={link}
            href={`${SITE.repo}/blob/main/CHANGELOG.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Changelog
          </a>
        </nav>
      </div>
    </footer>
  );
}
