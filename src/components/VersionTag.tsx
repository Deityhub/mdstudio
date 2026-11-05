import { cn } from "@/lib/utils";

/** The release this build is, set from package.json at build time (see vite.config.ts). */
const BUILT_VERSION = import.meta.env.VITE_APP_VERSION;

/** A small "v0.2.0" next to the logo, so it is clear which release is running. */
export function VersionTag({
  version = BUILT_VERSION ?? "",
  className,
}: {
  version?: string;
  className?: string;
}) {
  const number = version.replace(/^v/, "");
  if (!number) return null;
  return (
    <span
      aria-label={`Version ${number}`}
      title={`mdstudio v${number}`}
      className={cn(
        "shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground",
        className,
      )}
    >
      v{number}
    </span>
  );
}
