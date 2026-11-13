// What an account may use, in one place. Each limit has a built-in default, may be set for the
// whole server with an environment variable, may be changed by the account's plan, and may be
// overridden for one account. The most specific wins: account, then plan, then server, then default.

type Spec =
  | { type: "number"; fallback: number; env?: string; max?: number }
  | { type: "boolean"; fallback: boolean; env?: string };

export const LIMITS = {
  // storage and counts
  cloud_docs: { type: "number", fallback: 5, env: "MAX_CLOUD_DOCS" },
  revisions: { type: "number", fallback: 10, env: "MAX_REVISIONS" },
  assets: { type: "number", fallback: 10, env: "MAX_ASSETS" },
  asset_bytes: {
    type: "number",
    fallback: 10_000_000,
    env: "MAX_ASSET_BYTES",
    max: 100_000_000_000,
  },
  ai_integrations: { type: "number", fallback: 20 },
  // sharing and publishing
  share_max_days: { type: "number", fallback: 7, env: "SHARE_MAX_DAYS", max: 3650 },
  share_default_days: { type: "number", fallback: 4, env: "SHARE_DEFAULT_DAYS", max: 3650 },
  private_links: { type: "boolean", fallback: true, env: "PRIVATE_LINKS" },
  invites_per_day: { type: "number", fallback: 20 },
  github_publish: { type: "boolean", fallback: true },
  // live editing together: people in one draft (the owner counts), live drafts an account may keep
  collab_enabled: { type: "boolean", fallback: true, env: "COLLAB_ENABLED" },
  collab_people: { type: "number", fallback: 3, env: "MAX_COLLAB_PEOPLE", max: 10 },
  collab_docs: { type: "number", fallback: 2, env: "MAX_COLLAB_DOCS", max: 100 },
  // rate limits (per account)
  share_changes_per_hour: { type: "number", fallback: 60 },
  comments_per_hour: { type: "number", fallback: 30 },
  github_publishes_per_hour: { type: "number", fallback: 30 },
  github_reads_per_hour: { type: "number", fallback: 120 },
  ai_changes_per_hour: { type: "number", fallback: 300 },
} as const satisfies Record<string, Spec>;

export type LimitKey = keyof typeof LIMITS;
export type Limits = {
  [K in LimitKey]: (typeof LIMITS)[K]["type"] extends "number" ? number : boolean;
};
export type LimitValue = number | boolean;
export type Source = "override" | "plan" | "server" | "env" | "default";
export type Partials = Partial<Record<LimitKey, LimitValue>>;

/** Every account is on this plan unless an admin moves it. It always exists and changes nothing. */
export const DEFAULT_PLAN = "free";

const ABSURD = 1_000_000_000;
const specOf = (key: string): Spec | undefined => (LIMITS as Record<string, Spec>)[key];

/** A server setting as a value of the limit's type, or undefined when it is missing or unusable. */
function fromEnv(spec: Spec, raw: string | undefined): LimitValue | undefined {
  if (raw === undefined) return undefined;
  if (spec.type === "boolean") return !["off", "false", "0"].includes(raw.toLowerCase());
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

/**
 * Each limit comes from the most specific layer that sets it: the account's own override, its plan,
 * the server-wide default an admin set in the dashboard, the environment variable, the built-in default.
 */
export function resolveLimits(
  read: (name: string) => string | undefined,
  layers: { overrides?: Partials; plan?: Partials; server?: Partials },
): { values: Limits; sources: Record<LimitKey, Source> } {
  const values: Record<string, LimitValue> = {};
  const sources: Record<string, Source> = {};
  for (const key of Object.keys(LIMITS) as LimitKey[]) {
    const spec = LIMITS[key] as Spec;
    const envValue = spec.env ? fromEnv(spec, read(spec.env)) : undefined;
    const picks: [LimitValue | undefined, Source][] = [
      [layers.overrides?.[key], "override"],
      [layers.plan?.[key], "plan"],
      [layers.server?.[key], "server"],
      [envValue, "env"],
    ];
    const hit = picks.find(([v]) => v !== undefined);
    [values[key], sources[key]] = hit ? [hit[0]!, hit[1]] : [spec.fallback, "default"];
  }
  return { values: values as Limits, sources: sources as Record<LimitKey, Source> };
}

/**
 * Checks one requested change: the value for a known limit, null to remove the override, or
 * "invalid" for an unknown limit, the wrong type, a fraction, a negative or an absurd size.
 */
export function parseChange(key: string, value: unknown): LimitValue | null | "invalid" {
  const spec = specOf(key);
  if (!spec) return "invalid";
  if (value === null) return null;
  if (spec.type === "boolean") return typeof value === "boolean" ? value : "invalid";
  const max = "max" in spec && spec.max ? spec.max : ABSURD;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max
    ? value
    : "invalid";
}
