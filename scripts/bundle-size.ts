// Guards the size of the Cloudflare Worker (.output/server). Cloudflare's free plan allows 3 MiB
// of compressed Worker code; we keep well under it and keep browser-only libraries out.
//   bun run build && bun run bundle:check
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

export type BundleFile = { path: string; rawBytes: number; gzipBytes: number };
export type BundleReport = { files: BundleFile[]; rawBytes: number; gzipBytes: number };
export type Limits = { maxGzipBytes: number; forbidden: string[] };

const MiB = 1024 * 1024;

/** Free-plan limit is 3 MiB; this budget leaves plenty of room for growth. */
export const LIMITS: Limits = {
  maxGzipBytes: 1.5 * MiB,
  // Libraries that only run in the browser (loaded on demand there); they must not be bundled
  // into the server build.
  forbidden: ["mermaid", "elkjs", "katex", "cytoscape", "dagre", "d3", "chevrotain"],
};

function listModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return listModules(path);
    return e.name.endsWith(".mjs") || e.name.endsWith(".js") ? [path] : [];
  });
}

export function measureBundle(dir: string): BundleReport {
  const files = listModules(dir)
    .map((path) => {
      const data = readFileSync(path);
      return {
        path: relative(dir, path),
        rawBytes: statSync(path).size,
        gzipBytes: gzipSync(data, { level: 9 }).length,
      };
    })
    .sort((a, b) => b.rawBytes - a.rawBytes);
  return {
    files,
    rawBytes: files.reduce((n, f) => n + f.rawBytes, 0),
    gzipBytes: files.reduce((n, f) => n + f.gzipBytes, 0),
  };
}

export function checkBundle(report: BundleReport, limits: Limits): string[] {
  const problems: string[] = [];
  if (report.gzipBytes > limits.maxGzipBytes)
    problems.push(
      `Worker is ${(report.gzipBytes / MiB).toFixed(2)} MiB gzipped, over the budget of ${(limits.maxGzipBytes / MiB).toFixed(2)} MiB.`,
    );
  for (const name of limits.forbidden) {
    const leaked = report.files.filter((f) => f.path.toLowerCase().includes(name));
    if (leaked.length)
      problems.push(
        `Browser-only library "${name}" is bundled into the Worker (${leaked.map((f) => f.path).join(", ")}). Load it behind import.meta.env.SSR so the server build drops it.`,
      );
  }
  return problems;
}

if (import.meta.main) {
  const dir = process.argv[2] ?? ".output/server";
  if (!existsSync(dir)) {
    console.error(`${dir} does not exist. Run "bun run build" first.`);
    process.exit(1);
  }
  const report = measureBundle(dir);
  console.log(
    `Worker modules: ${report.files.length}, ${(report.rawBytes / MiB).toFixed(2)} MiB raw, ${(report.gzipBytes / MiB).toFixed(2)} MiB gzipped (budget ${(LIMITS.maxGzipBytes / MiB).toFixed(2)} MiB, Cloudflare free-plan limit 3 MiB)`,
  );
  for (const f of report.files.slice(0, 8))
    console.log(`  ${(f.rawBytes / 1024).toFixed(0).padStart(6)} KiB  ${f.path}`);
  const problems = checkBundle(report, LIMITS);
  if (problems.length) {
    console.error(`\n${problems.join("\n")}`);
    process.exit(1);
  }
}
