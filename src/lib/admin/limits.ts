// How the admin dashboard names and groups the account limits (the server's list is in
// src/server/limits/catalog.ts). A test keeps the two in step.
export type LimitGroup = "Storage and counts" | "Sharing and publishing" | "Rate limits";

export const LIMIT_INFO: Record<string, { label: string; group: LimitGroup; unit?: string }> = {
  cloud_docs: { label: "Cloud drafts", group: "Storage and counts" },
  revisions: { label: "Versions kept per draft", group: "Storage and counts" },
  assets: { label: "Hosted images", group: "Storage and counts" },
  asset_bytes: { label: "Hosted image storage", group: "Storage and counts", unit: "bytes" },
  ai_integrations: { label: "AI integrations", group: "Storage and counts" },
  share_max_days: { label: "Longest share link", group: "Sharing and publishing", unit: "days" },
  share_default_days: {
    label: "Default share link",
    group: "Sharing and publishing",
    unit: "days",
  },
  private_links: { label: "Links for named people", group: "Sharing and publishing" },
  invites_per_day: { label: "Invitations a day", group: "Sharing and publishing" },
  github_publish: { label: "Publish to GitHub", group: "Sharing and publishing" },
  share_changes_per_hour: { label: "Share changes an hour", group: "Rate limits" },
  comments_per_hour: { label: "Comments an hour", group: "Rate limits" },
  github_publishes_per_hour: { label: "GitHub publishes an hour", group: "Rate limits" },
  github_reads_per_hour: { label: "GitHub lookups an hour", group: "Rate limits" },
  ai_changes_per_hour: { label: "AI integration saves an hour", group: "Rate limits" },
};

export const GROUPS: LimitGroup[] = ["Storage and counts", "Sharing and publishing", "Rate limits"];

/** A byte count for people: 10 MB, 1.5 GB. */
export function bytes(n: number): string {
  if (n < 1000) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let i = -1;
  do {
    v /= 1000;
    i++;
  } while (v >= 1000 && i < units.length - 1);
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`;
}

/** What to send to turn one set of limits into another: a value to set, or null to remove one. */
export function limitDiff(
  before: Record<string, number | boolean>,
  after: Record<string, number | boolean>,
): Record<string, number | boolean | null> {
  const out: Record<string, number | boolean | null> = {};
  for (const [k, v] of Object.entries(after)) if (before[k] !== v) out[k] = v;
  for (const k of Object.keys(before)) if (!(k in after)) out[k] = null;
  return out;
}

/** A date and time for the dashboard, or "never". */
export const when = (ms: number | null | undefined) =>
  ms
    ? new Date(ms).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "never";
