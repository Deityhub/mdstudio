import { ArrowUpRight, Github } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site/seo";

/** Header for the public pages: logo (home), theme toggle and the GitHub link. */
export function SiteHeader() {
  return (
    <header className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-4 sm:px-6 sm:py-6">
      <Logo
        className="justify-self-start"
        markClassName="size-8"
        textClassName="text-xl sm:text-2xl"
      />
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Button asChild variant="ghost">
          <a
            href={SITE.repo}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="mdstudio on GitHub (opens in a new tab)"
          >
            <Github className="size-4" /> GitHub <ArrowUpRight className="size-4" />
          </a>
        </Button>
      </div>
    </header>
  );
}
