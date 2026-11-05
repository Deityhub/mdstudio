// Keeps Tailwind class names in the form Tailwind itself recommends, the same suggestions its editor
// extension shows as warnings: `flex-shrink-0` becomes `shrink-0`, `h-4 w-4` becomes `size-4`,
// `data-[disabled]:` becomes `data-disabled:`, `w-[16px]` becomes `w-4`, and so on. The rules come
// from Tailwind's own design system for this project's styles.css, so nothing is guessed here.
//
//   bun run tailwind:check    lists what should change and fails if anything does (CI runs this)
//   bun run tailwind:fix      rewrites the files
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type DesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>;

const ROOT = resolve(import.meta.dirname, "..");
// "single", 'single', and `template` strings without ${} (the static part of anything else is
// still a plain string literal of its own).
const LITERAL = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\$\n]|\\.|\$(?!\{))*)`/g;

export async function loadSystem(base = ROOT, cssFile = "src/styles.css") {
  const css = readFileSync(join(base, cssFile), "utf8");
  return __unstable__loadDesignSystem(css, {
    base: join(base, resolve(cssFile, "..").slice(base.length)),
  });
}

/** One string of classes in its recommended form, or the same string when it is already there. */
export function canonicalizeClasses(ds: DesignSystem, classes: string): string {
  const tokens = classes.split(/\s+/).filter(Boolean);
  if (!tokens.length || classes.length > 600 || /[<>{}();=]/.test(classes)) return classes;
  const css = ds.candidatesToCss(tokens);
  const valid = tokens.filter((_, i) => css[i] !== null && css[i] !== undefined);
  // a string that is not made of classes (a message, a path) is left alone
  if (!valid.length) return classes;
  const others = tokens.filter((_, i) => css[i] === null || css[i] === undefined);
  // anything that is neither a utility nor a plain class name (a sentence, a selector) is not ours
  if (others.some((t) => !/^[a-z][\w-]*$/.test(t)) || others.length > valid.length) return classes;
  // Each class keeps its place: first every one is renamed on its own, then the ones Tailwind can
  // merge (`h-4 w-4` into `size-4`) are replaced by the merged class where the first of them was.
  const renamed = tokens.map((t, i) =>
    css[i] === null || css[i] === undefined
      ? t
      : (ds.canonicalizeCandidates([t], { rem: 16 })[0] ?? t),
  );
  const validNow = renamed.filter((_, i) => css[i] !== null && css[i] !== undefined);
  const merged = ds.canonicalizeCandidates(validNow, { rem: 16, collapse: true });
  const out = [...renamed];
  const added = merged.filter((c) => !validNow.includes(c));
  const gone = validNow.filter((c) => !merged.includes(c));
  for (const c of added) {
    const at = out.findIndex((t) => gone.includes(t));
    if (at >= 0) out.splice(at, 0, c);
  }
  const result = out.filter((t) => !gone.includes(t)).join(" ");
  return result === tokens.join(" ") ? classes : result;
}

export type Change = { line: number; from: string; to: string };

/** The source with every class string in its recommended form, and what changed. */
export function rewriteSource(ds: DesignSystem, source: string) {
  const changes: Change[] = [];
  const output = source.replace(
    LITERAL,
    (whole, a?: string, b?: string, c?: string, offset?: number) => {
      const text = a ?? b ?? c ?? "";
      const next = canonicalizeClasses(ds, text);
      if (next === text) return whole;
      const quote = whole[0]!;
      changes.push({
        line: source.slice(0, offset).split("\n").length,
        from: text.trim(),
        to: next.trim(),
      });
      return quote + next + quote;
    },
  );
  return { output, changes };
}

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(tsx?|css)$/.test(name) && !/\.(test|spec)\.|routeTree\.gen/.test(name)) yield path;
  }
}

async function main() {
  const fix = process.argv.includes("--fix");
  const ds = await loadSystem();
  let total = 0;
  for (const file of sources(join(ROOT, "src"))) {
    if (file.endsWith(".css")) continue;
    const { output, changes } = rewriteSource(ds, readFileSync(file, "utf8"));
    if (!changes.length) continue;
    total += changes.length;
    const rel = file.slice(ROOT.length + 1);
    if (fix) writeFileSync(file, output);
    else for (const c of changes) console.log(`${rel}:${c.line}\n  - ${c.from}\n  + ${c.to}`);
  }
  if (fix) console.log(total ? `Rewrote ${total} class strings.` : "Nothing to change.");
  else if (total) {
    console.error(
      `\n${total} class strings are not in Tailwind's recommended form. Run: bun run tailwind:fix`,
    );
    process.exit(1);
  } else console.log("All Tailwind classes are in the recommended form.");
}

if (import.meta.main) await main();
