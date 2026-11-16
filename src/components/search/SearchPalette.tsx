import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAccount } from "@/lib/account/store";
import { documentStore, indexedDbStore } from "@/lib/storage/documentStore";
import { cloudOwners, isVisibleDoc } from "@/lib/sync/meta";
import { setTheme } from "@/lib/ui/theme";
import { draftEntries, siteEntries, type SearchNav } from "@/lib/search/entries";
import { type SearchEntry, groupResults, rankEntries } from "@/lib/search/rank";
import { registeredEntries, requestJump, setSearchOpen } from "@/lib/search/registry";

type Draft = Parameters<typeof draftEntries>[0][number];

/** The search palette: drafts and their text, the page's commands, settings and pages. */
export default function SearchPalette() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const account = useAccount();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([documentStore.list(), cloudOwners(indexedDbStore)]).then(([all, owners]) => {
      if (live) setDrafts(all.filter((d) => isVisibleDoc(owners, d, account.user?.id)));
    });
    return () => {
      live = false;
    };
  }, [account.user?.id]);

  const close = () => setSearchOpen(false);
  const nav: SearchNav = useMemo(
    () => ({
      go: (to) => void navigate({ to }),
      openDraft: (id, line) => {
        if (line) requestJump(id, line);
        if (path !== `/editor/${id}`)
          void navigate({ to: "/editor/$docId", params: { docId: id } });
      },
      setTheme,
    }),
    [navigate, path],
  );

  const groups = useMemo(() => {
    const who = { signedIn: !!account.user, isAdmin: !!account.user?.isAdmin };
    const fixed = [...registeredEntries(), ...siteEntries(nav, who)];
    if (!query.trim())
      return groupResults(
        [...draftEntries(drafts, "", nav).slice(0, 5), ...registeredEntries().slice(0, 5)],
        5,
      );
    return groupResults([...draftEntries(drafts, query, nav), ...rankEntries(query, fixed)]);
  }, [query, drafts, nav, account.user]);
  const flat = groups.flatMap((g) => g.items);
  const current = flat[Math.min(active, flat.length - 1)];

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (e: SearchEntry | undefined) => {
    if (!e) return;
    close();
    e.run();
  };

  let index = -1;
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="top-4 max-h-[calc(100dvh-2rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[12vh] sm:max-w-xl [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Find drafts, words in drafts, commands, settings and pages.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="search-results"
            aria-activedescendant={current ? `search-${current.id}` : undefined}
            aria-label="Search"
            placeholder="Search drafts, commands, settings…"
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, flat.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(current);
              }
            }}
          />
        </div>
        <div
          ref={list}
          id="search-results"
          role="listbox"
          aria-label="Results"
          className="max-h-[60dvh] overflow-y-auto p-1"
        >
          {!flat.length && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {query.trim() ? "Nothing found." : "Type to search."}
            </p>
          )}
          {groups.map((g) => (
            <div key={g.group} role="group" aria-label={g.group}>
              <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                {query.trim() || g.group !== "Drafts" ? g.group : "Recent drafts"}
              </p>
              {g.items.map((e) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={e.id}
                    id={`search-${e.id}`}
                    data-index={i}
                    role="option"
                    aria-selected={e === current}
                    className="cursor-pointer rounded-md px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(e)}
                  >
                    <span className="block truncate">{e.title}</span>
                    {e.hint && (
                      <span className="block truncate text-xs text-muted-foreground">{e.hint}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className="hidden border-t border-border px-3 py-2 text-xs text-muted-foreground sm:block">
          ↑ ↓ to move · Enter to open · Esc to close
        </p>
      </DialogContent>
    </Dialog>
  );
}
