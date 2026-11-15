import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Settings } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const link = "text-muted-foreground hover:text-foreground";

/** Header for the public pages: logo, the main links, theme, and the way into the editor. */
export function SiteHeader() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const guides = path.startsWith("/guides");
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-16 max-w-300 items-center gap-7 px-4 sm:px-8">
        <Logo markClassName="size-7" textClassName="text-lg" />
        <nav aria-label="Main" className="hidden gap-5.5 text-sm md:flex">
          <Link to="/" hash="features" className={link}>
            Features
          </Link>
          <Link
            to="/guides"
            className={cn(guides ? "font-semibold text-foreground" : link)}
            aria-current={guides ? "page" : undefined}
          >
            Guides
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link to="/settings" search={{ tab: "" }} aria-label="Settings" title="Settings">
              <Settings className="size-4" />
            </Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link to="/editor">Open the editor</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                <Menu className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link to="/editor">Open the editor</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/" hash="features">
                  Features
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/guides">Guides</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
