import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type LogoVariant = "full" | "mark" | "wordmark";

/** The two-pages mark (source page and rendered page). Colors follow the theme tokens. */
export function LogoMark({ className }: { className?: string | undefined }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("h-7 w-7 shrink-0", className)}>
      <rect
        x="6"
        y="10"
        width="34"
        height="44"
        rx="6"
        strokeWidth="4"
        className="fill-none stroke-primary"
      />
      <rect x="24" y="10" width="34" height="44" rx="6" className="fill-primary" />
      <path
        d="M32 24h18M32 33h18M32 42h11"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-primary-foreground"
      />
      <path
        d="M14 24l6 4-6 4"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="fill-none stroke-primary"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("truncate font-display font-semibold", className)}>
      <span className="text-primary">md</span>studio
    </span>
  );
}

/**
 * The mdstudio brand. `variant` picks the mark, the wordmark or both; by default the whole logo
 * is a link home. Pass `link={false}` where it must not navigate (previews, the link's own page).
 */
export function Logo({
  variant = "full",
  link = true,
  className,
  markClassName,
  textClassName,
}: {
  variant?: LogoVariant;
  link?: boolean;
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  const parts: ReactNode = (
    <>
      {variant !== "wordmark" && <LogoMark className={markClassName} />}
      {variant !== "mark" && <Wordmark className={cn("text-lg", textClassName)} />}
    </>
  );
  const classes = cn("inline-flex min-w-0 items-center gap-2", className);
  if (!link) return <span className={classes}>{parts}</span>;
  return (
    <Link
      to="/"
      // the mark alone has no text, so the link needs a name; with text the text is the name
      {...(variant === "mark" ? { "aria-label": "mdstudio home" } : {})}
      className={classes}
    >
      {parts}
    </Link>
  );
}
