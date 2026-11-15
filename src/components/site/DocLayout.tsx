import { useEffect, useState, type ReactNode } from "react";
import { SITE_WIDTH } from "./SitePieces";
import { cn } from "@/lib/utils";

/** How far below the top of the window a heading counts as "being read". */
const READING_LINE = 120;

/** The id of the section being read: the last one whose heading has reached the reading line. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? "");
  const key = ids.join("|");
  useEffect(() => {
    if (ids.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const doc = document.documentElement;
      // at the very bottom the last section is the one being read, even if it is too short to reach the line
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 2)
        return setActive(ids.at(-1)!);
      let current = ids[0]!;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= READING_LINE) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // the ids, joined: the array itself is new on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}

/**
 * A page of reading (a guide, a legal page): its sections listed in a sticky column on the left,
 * with the one being read marked, and the text beside it. The list is shown for as long as the
 * window has room for it beside the text (from 1024px) and hidden below that.
 */
export function DocLayout({
  toc,
  tocTitle,
  children,
}: {
  toc: { text: string; id: string }[];
  tocTitle: string;
  children: ReactNode;
}) {
  const active = useActiveSection(toc.map((t) => t.id));
  return (
    <main className={cn(SITE_WIDTH, "flex items-start gap-12 py-7 sm:py-12")}>
      {toc.length > 0 && (
        <nav
          aria-label="On this page"
          className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] w-55 shrink-0 overflow-y-auto text-sm lg:block"
        >
          <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {tocTitle}
          </p>
          <ol>
            {toc.map((t) => {
              const on = t.id === active;
              return (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    aria-current={on ? "location" : undefined}
                    className={cn(
                      "block py-1.25 pl-3 transition-colors hover:text-foreground",
                      on
                        ? "font-medium text-foreground shadow-[inset_2px_0_0_var(--color-primary)]"
                        : "text-muted-foreground shadow-[inset_1px_0_0_var(--color-border)] hover:shadow-[inset_2px_0_0_var(--color-primary)]",
                    )}
                  >
                    {t.text}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      {/* centred when the list is hidden (or there is none); beside the list otherwise */}
      <div className={cn("mx-auto w-full max-w-190 min-w-0 flex-1", toc.length > 0 && "lg:mx-0")}>
        {children}
      </div>
    </main>
  );
}
