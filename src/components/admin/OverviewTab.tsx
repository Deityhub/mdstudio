import { useEffect, useState } from "react";
import { type Overview, adminApi } from "@/lib/admin/api";
import { bytes } from "@/lib/admin/limits";

export function OverviewTab() {
  const [o, setO] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    adminApi.overview().then(setO, () => setFailed(true));
  }, []);
  if (failed) return <p className="text-sm text-destructive">Couldn't load the overview.</p>;
  if (!o) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const cards: [string, string | number, string?][] = [
    ["Accounts", o.accounts, `${o.newThisWeek} new this week`],
    ["Admins", o.admins],
    ["Suspended", o.suspended],
    ["Email not confirmed", o.unverified],
    ["Cloud drafts", o.drafts],
    ["Live share links", o.shares],
    ["Hosted images", o.images, bytes(o.imageBytes)],
    ["AI integrations", o.integrations],
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map(([label, value, note]) => (
        <li key={label} className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 font-serif text-2xl">{value.toLocaleString()}</div>
          {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
        </li>
      ))}
    </ul>
  );
}
