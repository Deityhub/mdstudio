import { useAccount } from "@/lib/account/store";

/** A notice an admin set (for example about maintenance), shown above the editor. */
export function SiteNotice() {
  const { notice } = useAccount();
  if (!notice) return null;
  return (
    <div
      role="status"
      className="shrink-0 border-b border-border bg-warning/15 px-3 py-1.5 text-center text-sm text-foreground"
    >
      {notice}
    </div>
  );
}
