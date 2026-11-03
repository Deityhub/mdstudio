import { z } from "zod";

/**
 * The checker's rule settings. One set lives in the browser and applies to every draft; a draft
 * can change individual rules from its front matter (see `applyOverrides`). The set can be
 * exported and imported as JSON so a team can share the same standards.
 */

export const SEVERITIES = ["error", "warning", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];
const severity = z.enum(SEVERITIES);

/** The portability rules in `checkPortability`, with the label shown in the settings. */
export const BUILTIN_RULES = [
  { id: "raw-html", label: "Raw HTML", severity: "warning" },
  { id: "unclosed-html", label: "Unclosed HTML tag", severity: "warning" },
  { id: "missing-alt", label: "Image without alt text", severity: "warning" },
  { id: "local-image", label: "Local image path", severity: "warning" },
  { id: "data-image", label: "Embedded (base64) image", severity: "info" },
  { id: "local-link", label: "Link to a local file", severity: "warning" },
  { id: "math", label: "Math where it isn't rendered", severity: "warning" },
  { id: "mermaid", label: "Mermaid where it isn't rendered", severity: "warning" },
  { id: "alert", label: "GitHub alert where it isn't rendered", severity: "warning" },
  { id: "highlight", label: "==Highlight==", severity: "warning" },
  { id: "wiki-link", label: "[[Wiki link]]", severity: "warning" },
  { id: "container", label: "::: container", severity: "warning" },
  { id: "fence-lang", label: "Code block without a language", severity: "info" },
  { id: "trailing-break", label: "Trailing-space line break", severity: "warning" },
  { id: "mixed-bullets", label: "Mixed bullet markers", severity: "info" },
  { id: "gfm-table", label: "Table in strict CommonMark", severity: "warning" },
  { id: "gfm-task", label: "Task list in strict CommonMark", severity: "warning" },
  { id: "gfm-strike", label: "Strikethrough in strict CommonMark", severity: "warning" },
  { id: "gfm-footnote", label: "Footnote in strict CommonMark", severity: "warning" },
] as const satisfies readonly { id: string; label: string; severity: Severity }[];
export type BuiltinId = (typeof BUILTIN_RULES)[number]["id"];
const BUILTIN_IDS: readonly string[] = BUILTIN_RULES.map((r) => r.id);

const count = z.number().int().min(0).max(100_000);
const limits = { enabled: z.boolean(), severity };

const range = (min: number | undefined, max: number | undefined) =>
  z.object({ ...limits, min: count.optional(), max: count.optional() }).default({
    enabled: false,
    severity: "warning",
    ...(min !== undefined && { min }),
    ...(max !== undefined && { max }),
  });

const STANDARDS = z.object({
  "title-length": range(undefined, 60),
  "description-length": range(50, 160),
  "required-fields": z
    .object({ ...limits, fields: z.array(z.string().min(1).max(40)).max(20) })
    .default({ enabled: false, severity: "warning", fields: ["title", "description"] }),
  "heading-structure": z
    .object({ ...limits, singleH1: z.boolean(), noSkips: z.boolean() })
    .default({ enabled: false, severity: "warning", singleH1: true, noSkips: true }),
  "word-count": range(300, undefined),
  "tag-count": z
    .object({ ...limits, max: count })
    .default({ enabled: false, severity: "warning", max: 5 }),
});
export type Standards = z.infer<typeof STANDARDS>;
export type StandardId = keyof Standards;
export const STANDARD_IDS = Object.keys(STANDARDS.shape) as StandardId[];

export const CUSTOM_LIMITS = { rules: 50, pattern: 200, message: 200, name: 60 } as const;

const CUSTOM = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "lower-case letters, digits and dashes"),
  name: z.string().min(1).max(CUSTOM_LIMITS.name),
  pattern: z.string().min(1).max(CUSTOM_LIMITS.pattern),
  /** A regular expression, or plain text to find. */
  regex: z.boolean(),
  caseSensitive: z.boolean(),
  /** Plain text only: match whole words. */
  wholeWord: z.boolean(),
  /** What to tell the writer; `{match}` becomes the text that was found. */
  message: z.string().min(1).max(CUSTOM_LIMITS.message),
  severity,
  enabled: z.boolean(),
});
export type CustomRule = z.infer<typeof CUSTOM>;

const builtinEntry = z
  .object({ enabled: z.boolean().optional(), severity: severity.optional() })
  .strict();

const CONFIG = z.object({
  version: z.literal(1),
  builtin: z
    .record(z.string(), builtinEntry)
    .refine((o) => Object.keys(o).every((k) => BUILTIN_IDS.includes(k)), "unknown built-in rule")
    .default({}),
  standards: STANDARDS.default({}),
  custom: z
    .array(CUSTOM)
    .max(CUSTOM_LIMITS.rules)
    .refine((l) => new Set(l.map((r) => r.id)).size === l.length, "custom rule ids must be unique")
    .default([]),
});
export type CheckConfig = Omit<z.infer<typeof CONFIG>, "builtin"> & {
  builtin: Partial<
    Record<BuiltinId, { enabled?: boolean | undefined; severity?: Severity | undefined }>
  >;
};

export const DEFAULT_CONFIG: CheckConfig = CONFIG.parse({ version: 1 }) as CheckConfig;

/** A usable config from anything: the defaults when the input is not a valid one. */
export function parseConfig(input: unknown): CheckConfig {
  const r = CONFIG.safeParse(input);
  return r.success ? (r.data as CheckConfig) : structuredClone(DEFAULT_CONFIG);
}

export const exportConfig = (config: CheckConfig) => JSON.stringify(config, null, 2) + "\n";

const MAX_FILE = 200_000;

/** Reads a rules file, with a readable reason when it can't. */
export function importConfig(text: string): { config: CheckConfig } | { error: string } {
  if (text.length > MAX_FILE) return { error: "That file is too large to be a rules file." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "That isn't valid JSON." };
  }
  const r = CONFIG.safeParse(raw);
  if (r.success) return { config: r.data as CheckConfig };
  const first = r.error.issues[0];
  return {
    error:
      `Those rules aren't valid: ${first?.path.join(".") || "file"} ${first?.message ?? ""}`.trim(),
  };
}

/* ---------------- a draft's own settings ---------------- */

const PARAMS: Record<StandardId, z.ZodTypeAny> = {
  "title-length": z.object({ min: count, max: count }).partial().strict(),
  "description-length": z.object({ min: count, max: count }).partial().strict(),
  "required-fields": z
    .object({ fields: z.array(z.string().min(1).max(40)).max(20) })
    .partial()
    .strict(),
  "heading-structure": z.object({ singleH1: z.boolean(), noSkips: z.boolean() }).partial().strict(),
  "word-count": z.object({ min: count, max: count }).partial().strict(),
  "tag-count": z.object({ max: count }).partial().strict(),
};

/**
 * Applies the `checks:` map from a draft's front matter on top of the config: `rule: false` turns
 * a rule off, `rule: true` on, `rule: warning` (or error, info) sets its severity, and for a
 * standard `rule: { max: 80 }` sets its limits. Returns what it could not understand as notes.
 */
export function applyOverrides(
  base: CheckConfig,
  raw: unknown,
): { config: CheckConfig; notes: string[] } {
  if (raw === undefined || raw === null) return { config: base, notes: [] };
  if (typeof raw !== "object" || Array.isArray(raw))
    return {
      config: base,
      notes: [
        '"checks" in the front matter should be a list of settings, like "wiki-link: false".',
      ],
    };
  const config = structuredClone(base);
  const notes: string[] = [];
  for (const [id, value] of Object.entries(raw)) {
    const sev = severity.safeParse(value);
    if (BUILTIN_IDS.includes(id)) {
      const key = id as BuiltinId;
      if (typeof value === "boolean")
        config.builtin[key] = { ...config.builtin[key], enabled: value };
      else if (sev.success) config.builtin[key] = { ...config.builtin[key], severity: sev.data };
      else notes.push(`"${id}" should be true, false, error, warning or info.`);
    } else if ((STANDARD_IDS as string[]).includes(id)) {
      const std = config.standards[id as StandardId] as Record<string, unknown>;
      if (typeof value === "boolean") std["enabled"] = value;
      else if (sev.success) Object.assign(std, { enabled: true, severity: sev.data });
      else {
        const params = PARAMS[id as StandardId]!.safeParse(value);
        if (params.success) Object.assign(std, { enabled: true }, params.data);
        else
          notes.push(
            `"${id}" has settings that don't fit: ${params.error.issues[0]?.path.join(".") ?? ""}`.trim(),
          );
      }
    } else {
      const rule = config.custom.find((r) => r.id === id);
      if (rule && typeof value === "boolean") rule.enabled = value;
      else if (rule && sev.success) Object.assign(rule, { severity: sev.data, enabled: true });
      else notes.push(`Unknown check "${id}".`);
    }
  }
  return { config, notes };
}
