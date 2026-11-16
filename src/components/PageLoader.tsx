import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/Logo";

/**
 * What a page shows while it loads: the mark, drawn stroke by stroke (the source page, the rendered
 * page, then its lines) on a loop, with the name under it. Fills the space it is given.
 */
export function PageLoader({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex min-h-dvh flex-col items-center justify-center gap-5", className)}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" className="page-loader size-20">
        <rect
          x="6"
          y="10"
          width="34"
          height="44"
          rx="6"
          strokeWidth="4"
          pathLength="1"
          className="page-loader-source fill-none stroke-primary"
        />
        <rect
          x="24"
          y="10"
          width="34"
          height="44"
          rx="6"
          className="page-loader-page fill-primary"
        />
        <path
          d="M32 24h18M32 33h18M32 42h11"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength="1"
          className="page-loader-lines stroke-primary-foreground"
        />
        <path
          d="M14 24l6 4-6 4"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="1"
          className="page-loader-prompt fill-none stroke-primary"
        />
      </svg>
      <Wordmark className="text-xl" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
