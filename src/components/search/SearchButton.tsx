import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setSearchOpen } from "@/lib/search/registry";

/** Opens the search palette (also Ctrl/⌘ K). */
export function SearchButton({ className }: { className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label="Search"
      title="Search (Ctrl/⌘ K)"
      onClick={() => setSearchOpen(true)}
    >
      <Search className="size-4" />
    </Button>
  );
}
