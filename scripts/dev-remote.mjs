// Runs the built app locally on workerd with its D1 binding pointed at the shared *preview*
// database (never production), so sign-in and sync can be tried against real remote data.
//   bun run dev:remote            build, then serve on http://localhost:8080
//   bun run dev:remote --migrate  also apply pending migrations to the preview database first
// Needs `wrangler login` once. No hot reload: stop it, change code and run it again.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const WRANGLER = ["--yes", "wrangler@4"];
const id =
  process.env.D1_PREVIEW_DATABASE_ID ??
  execFileSync("gh", ["variable", "get", "D1_PREVIEW_DATABASE_ID"], { encoding: "utf8" }).trim();
if (!id) throw new Error("Set D1_PREVIEW_DATABASE_ID or the repository variable of that name.");

// The preview build names the Worker and binds the preview database (infra/worker-config.ts).
execFileSync("bun", ["run", "build"], {
  stdio: "inherit",
  env: { ...process.env, PREVIEW_WORKER_NAME: "mdstudio-pr-0", D1_DATABASE_ID: id },
});

const config = ".output/server/wrangler.json";
const local = ".output/server/wrangler.remote.json";
const json = JSON.parse(readFileSync(config, "utf8"));
for (const db of json.d1_databases ?? []) db.remote = true;
writeFileSync(local, JSON.stringify(json, null, 2));

if (process.argv.includes("--migrate"))
  execFileSync(
    "npx",
    [...WRANGLER, "d1", "migrations", "apply", "DB", "--remote", "--config", local],
    {
      stdio: "inherit",
    },
  );

spawn("npx", [...WRANGLER, "dev", "--config", local, "--port", "8080"], { stdio: "inherit" }).on(
  "exit",
  (code) => process.exit(code ?? 0),
);
