import { Suspense, lazy, useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { setSearchOpen, useSearchOpen } from "@/lib/search/registry";

// The palette's code loads the first time it opens, so pages pay nothing until then.
const SearchPalette = lazy(() => import("./SearchPalette"));

/**
 * Opens search on Ctrl/⌘ Shift P anywhere, and on Ctrl/⌘ K outside the editor's text (where it
 * stays "Link"). Not on the home page, which keeps its own navigation.
 */
export function SearchHost() {
  const open = useSearchOpen();
  const home = useRouterState({ select: (s) => s.location.pathname === "/" });
  useEffect(() => {
    if (home) return;
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
  }, [home]);
  if (!open || home) return null;
  return (
    <Suspense fallback={null}>
      <SearchPalette />
    </Suspense>
  );
}
