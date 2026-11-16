import type { ReactNode } from "react";

/** One setting: what it is on the left, its control on the right. */
export function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border px-4 py-4 last:border-b-0 sm:px-5">
      <div className="min-w-0 flex-1 basis-60">
        <h2 className="font-sans text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
