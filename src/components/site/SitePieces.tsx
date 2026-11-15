import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The width every public page's content keeps to. */
export const SITE_WIDTH = "mx-auto w-full max-w-300 px-4 sm:px-8";

/** A bordered tile on a panel background (features, guides, platforms). */
export const TILE = "rounded-md border border-border bg-muted p-4.5";

/** A small label: a reading time, a status, a kind. */
export function Chip({
  children,
  tone = "accent",
  className,
}: {
  children: ReactNode;
  tone?: "accent" | "line" | "warn";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold whitespace-nowrap",
        tone === "accent" && "bg-accent text-primary",
        tone === "line" && "border border-border text-muted-foreground",
        tone === "warn" && "bg-warning/15 text-warning",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The closing call to action: a tinted band with a heading and a button. */
export function Band({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-5 rounded-md bg-accent p-6 sm:p-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
