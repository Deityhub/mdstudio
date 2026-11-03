import { checkPortability, splitFrontMatter, type Issue, type Profile } from "../markdown/markdown";
import { applyOverrides, type CheckConfig } from "./config";
import { runCustomRules } from "./custom";
import { runStandards } from "./standards";

/** The line of the `checks:` key in the front matter, for notes about it. */
function checksLine(md: string): number {
  const lines = md.split(/\r?\n/);
  const at = lines.slice(0, lines.indexOf("---", 1) + 1).findIndex((l) => l.startsWith("checks:"));
  return at < 0 ? 1 : at + 1;
}

/**
 * Everything the Checks panel shows: the portability rules for the profile (with the writer's
 * on/off and severity choices), the publication standards they turned on, and their own rules,
 * after the draft's front matter has had its say.
 */
export function runChecks(md: string, profile: Profile, base: CheckConfig): { issues: Issue[] } {
  const { config, notes } = applyOverrides(base, splitFrontMatter(md).data?.["checks"]);

  const portability = checkPortability(md, profile).flatMap((i): Issue[] => {
    const setting = config.builtin[i.rule as keyof CheckConfig["builtin"]];
    if (setting?.enabled === false) return [];
    return [setting?.severity ? { ...i, severity: setting.severity } : i];
  });

  const own: Issue[] = [
    ...runStandards(md, config.standards),
    ...runCustomRules(md, config.custom),
    ...notes.map((message): Issue => ({
      line: checksLine(md),
      rule: "checks-config",
      message,
      severity: "info",
    })),
  ];
  // by line; at the same line the built-in rules come first, as they did before
  const issues = [...portability, ...own].sort((a, b) => a.line - b.line);
  return { issues };
}
