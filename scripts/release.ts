// Release helper used by the prepare-release workflow.
//   bun scripts/release.ts <patch|minor|major>
// Bumps package.json, prepends a CHANGELOG.md section built from Conventional Commits since the last
// tag, and prints the new version. Pure helpers are exported for tests.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export type Bump = "patch" | "minor" | "major";
export type RawCommit = { subject: string; body: string };

export function nextVersion(current: string, bump: Bump): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!m) throw new Error(`Not a plain semver version: ${current}`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump: ${bump}`);
}

export function parseCommit(subject: string, body = "") {
  const m = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/.exec(subject);
  if (!m) return null;
  return {
    type: m[1]!,
    scope: m[2],
    breaking: !!m[3] || /^BREAKING[ -]CHANGE:/m.test(body),
    subject: m[4]!,
  };
}

const SECTIONS: [string, string][] = [
  ["feat", "Features"],
  ["fix", "Fixes"],
  ["perf", "Performance"],
];

export function renderSection(version: string, date: string, commits: RawCommit[]): string {
  const parsed = commits.flatMap((c) => parseCommit(c.subject, c.body) ?? []);
  const line = (c: (typeof parsed)[number]) => `- ${c.scope ? `**${c.scope}:** ` : ""}${c.subject}`;
  const blocks = [
    ["Breaking changes", parsed.filter((c) => c.breaking)],
    ...SECTIONS.map(([type, title]) => [
      title,
      parsed.filter((c) => c.type === type && !c.breaking),
    ]),
  ] as [string, typeof parsed][];
  const body = blocks
    .filter(([, list]) => list.length)
    .map(([title, list]) => `### ${title}\n\n${list.map(line).join("\n")}`)
    .join("\n\n");
  return `## ${version} (${date})\n\n${body || "Maintenance and internal changes only."}\n`;
}

export function prependChangelog(existing: string, section: string): string {
  const rest = existing.replace(/^# Changelog\n+/, "").trimEnd();
  return `# Changelog\n\n${section}${rest ? `\n${rest}\n` : ""}`;
}

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function commitsSinceLastTag(): RawCommit[] {
  let range: string[] = [];
  try {
    range = [`${git("describe", "--tags", "--abbrev=0", "--match", "v*")}..HEAD`];
  } catch {
    // no tag yet: first release covers everything
  }
  const raw = git("log", "--no-merges", "--format=%s%x1f%b%x1e", ...range);
  return raw
    .split("\x1e")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [subject = "", body = ""] = r.split("\x1f");
      return { subject: subject.trim(), body };
    });
}

if (import.meta.main) {
  const bump = process.argv[2] as Bump;
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const version = nextVersion(pkg.version, bump);
  pkg.version = version;
  writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

  const section = renderSection(
    version,
    new Date().toISOString().slice(0, 10),
    commitsSinceLastTag(),
  );
  const existing = existsSync("CHANGELOG.md") ? readFileSync("CHANGELOG.md", "utf8") : "";
  writeFileSync("CHANGELOG.md", prependChangelog(existing, section));
  console.log(version);
}
