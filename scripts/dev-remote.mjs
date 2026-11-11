// Runs the built app locally on workerd with its D1 binding pointed at the shared *preview*
// database (never production), so sign-in and sync can be tried against real remote data.
//   bun run dev:remote            build, then serve on http://localhost:8080
//   bun run dev:remote --migrate  also apply pending migrations to the preview database first
// Needs `wrangler login` once. No hot reload: stop it, change code and run it again.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

// latest, so the local workerd is as new as the date the build stamps on the Worker
const WRANGLER = ["--yes", "wrangler@latest"];
const id =
  process.env.D1_PREVIEW_DATABASE_ID ??
  execFileSync("gh", ["variable", "get", "D1_PREVIEW_DATABASE_ID"], { encoding: "utf8" }).trim();
if (!id) throw new Error("Set D1_PREVIEW_DATABASE_ID or the repository variable of that name.");

// The preview bucket for hosted images is optional: without it image upload stays switched off.
let bucket = process.env.R2_PREVIEW_BUCKET;
if (bucket === undefined) {
  try {
    bucket = execFileSync("gh", ["variable", "get", "R2_PREVIEW_BUCKET"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    bucket = "";
  }
}

// The preview build names the Worker and binds the preview database (infra/worker-config.ts).
execFileSync("bun", ["run", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PREVIEW_WORKER_NAME: "mdstudio-pr-0",
    D1_DATABASE_ID: id,
    ...(bucket && { R2_BUCKET: bucket }),
  },
});

const config = ".output/server/wrangler.json";
const local = ".output/server/wrangler.remote.json";
const json = JSON.parse(readFileSync(config, "utf8"));
// The build stamps today's date, which a workerd that is a day behind refuses to start with.
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
if (json.compatibility_date > yesterday) json.compatibility_date = yesterday;
// `wrangler dev` does not hand the shell's variables to the Worker, so pass on the secrets the
// deployed Worker has (see "Upload Worker secrets" in .github/workflows/release.yml): from the
// shell, else from .env (only these names are read from it). The file written is in .output, which
// git ignores. GH_OAUTH_* is what the repository secrets are called for GitHub's own prefix rule.
const dotenv = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
const pick = (...names) => names.map((n) => process.env[n] || dotenv[n]).find(Boolean);
const secrets = {
  GITHUB_CLIENT_ID: pick("GITHUB_CLIENT_ID", "GH_OAUTH_CLIENT_ID"),
  GITHUB_CLIENT_SECRET: pick("GITHUB_CLIENT_SECRET", "GH_OAUTH_CLIENT_SECRET"),
  ...Object.fromEntries(
    [
      "GH_TOKEN_KEY",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "RESEND_API_KEY",
      "MAILTRAP_API_TOKEN",
      "MAIL_FROM",
      "TURNSTILE_SECRET",
      "TURNSTILE_SITE_KEY",
    ].map((name) => [name, pick(name)]),
  ),
};
for (const [name, value] of Object.entries(secrets)) if (value) (json.vars ??= {})[name] = value;
const missing = Object.keys(secrets).filter((name) => !secrets[name]);
if (missing.length) console.log(`Not set (that feature stays off): ${missing.join(", ")}`);
for (const db of json.d1_databases ?? []) db.remote = true;
for (const bucket of json.r2_buckets ?? []) bucket.remote = true;
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
