import { fencedLines, type Issue } from "../markdown/markdown";
import { CUSTOM_LIMITS, type CustomRule } from "./config";

/** Only the start of a very long line is searched, and a rule reports at most this many lines. */
const MAX_LINE = 2000;
const MAX_HITS = 50;
const MAX_SHOWN = 40;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(rule: CustomRule): RegExp {
  const flags = `u${rule.caseSensitive ? "" : "i"}`;
  const source = rule.regex
    ? rule.pattern
    : rule.wholeWord
      ? `(?<![\\p{L}\\p{N}_])${escape(rule.pattern)}(?![\\p{L}\\p{N}_])`
      : escape(rule.pattern);
  return new RegExp(source, flags);
}

/**
 * Why a rule can't be used, or null when it can. The nested-repeat check is a rough guard against
 * patterns like `(a+)+$` that can take exponential time; a regex cannot be interrupted, so such
 * a pattern is refused up front.
 * ponytail: a heuristic, not a proof; swap for a regex-complexity checker if abuse shows up.
 */
export function validateCustomRule(rule: CustomRule): string | null {
  if (!rule.name.trim()) return "Give the rule a name.";
  if (!rule.pattern) return "Enter the pattern to look for.";
  if (!rule.message.trim()) return "Enter the message to show.";
  if (rule.pattern.length > CUSTOM_LIMITS.pattern)
    return `The pattern is longer than ${CUSTOM_LIMITS.pattern} characters.`;
  if (rule.regex && /\([^)]*[+*][^)]*\)[+*{]/.test(rule.pattern))
    return "This pattern repeats a repeat (like (a+)+), which can freeze the editor. Simplify it.";
  try {
    compile(rule);
  } catch {
    return "That isn't a valid pattern.";
  }
  return null;
}

/** The first line after a front matter block at the very top, or 0 when there is none. */
function frontMatterLines(lines: string[]): number {
  if (lines[0] !== "---") return 0;
  const end = lines.indexOf("---", 1);
  return end < 0 ? 0 : end + 1;
}

/** Runs the writer's own rules over the text, outside code blocks and front matter. */
export function runCustomRules(md: string, rules: CustomRule[]): Issue[] {
  const active = rules.filter((r) => r.enabled && !validateCustomRule(r));
  if (!active.length) return [];
  const lines = md.split(/\r?\n/);
  const skip = fencedLines(lines);
  const fm = frontMatterLines(lines);
  const issues: Issue[] = [];
  for (const rule of active) {
    const re = compile(rule);
    let hits = 0;
    for (let i = fm; i < lines.length && hits < MAX_HITS; i++) {
      if (skip.has(i)) continue;
      const m = re.exec(lines[i]!.slice(0, MAX_LINE));
      if (!m) continue;
      hits++;
      const found = m[0].length > MAX_SHOWN ? `${m[0].slice(0, MAX_SHOWN)}…` : m[0];
      issues.push({
        line: i + 1,
        rule: rule.id,
        severity: rule.severity,
        group: "custom",
        message: rule.message.replaceAll("{match}", found),
      });
    }
  }
  return issues;
}
