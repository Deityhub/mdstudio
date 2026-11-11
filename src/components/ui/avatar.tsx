import { useState } from "react";
import { cn } from "@/lib/utils";

/** A round picture of the person, or the first letter of their name when there is none (or it fails to load). */
export function Avatar({
  src,
  label,
  className,
}: {
  src?: string | null | undefined;
  label: string;
  className?: string;
}) {
  // remember which address failed, so a new picture gets its own try
  const [failed, setFailed] = useState<string | null>(null);
  return src && src !== failed ? (
    <img
      src={src}
      alt=""
      // some hosts (Google's) refuse an image request that carries another site's address
      referrerPolicy="no-referrer"
      onError={() => setFailed(src)}
      className={cn("size-6 shrink-0 rounded-full object-cover", className)}
    />
  ) : (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium uppercase text-primary-foreground",
        className,
      )}
    >
      {label.charAt(0)}
    </span>
  );
}
