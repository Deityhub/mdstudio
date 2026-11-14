import { Suspense, lazy, useEffect } from "react";
import { setSearchOpen, useSearchOpen } from "@/lib/search/registry";

// The palette's code loads the first time it opens, so pages pay nothing until then.
const SearchPalette = lazy(() => import("./SearchPalette"));

/**
 * Opens search on Ctrl/⌘ Shift P anywhere, and on Ctrl/⌘ K outside the editor's text (where it
 * stays "Link"). Every page has the shortcuts; the home page has no button for it (SiteHeader).
 */
export function SearchHost() {
  const open = useSearchOpen();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const inEditor = e.target instanceof Element && !!e.target.closest(".cm-editor");
      if ((key === "p" && e.shiftKey) || (key === "k" && !e.shiftKey && !inEditor)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <SearchPalette />
    </Suspense>
  );
}
