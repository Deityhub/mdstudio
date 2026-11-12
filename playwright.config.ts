import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";

// Runs against the production node-server build, so the real CSP and SSR output are exercised.
// Build first: `bun run e2e` does both.
const PORT = 4173;
// A second server that confirms email addresses, for the specs about sign-up protection. Mail goes
// to a folder of JSON files that those specs read (E2E_MAIL_DIR), and X-Forwarded-For is believed
// so a spec can pretend to be several visitors.
const MAIL_PORT = 4381;
env["E2E_MAIL_DIR"] ??= mkdtempSync(join(tmpdir(), "mdstudio-e2e-mail-"));
env["E2E_MAIL_URL"] ??= `http://localhost:${MAIL_PORT}`;
// A fake GitHub for the mail server to connect to (see e2e/fake-github.ts).
const GITHUB_PORT = 4382;
env["E2E_GITHUB_URL"] ??= `http://localhost:${GITHUB_PORT}`;

// A fake Google for the mail server to sign in with (see e2e/fake-google.ts).
const GOOGLE_PORT = 4383;
env["E2E_GOOGLE_URL"] ??= `http://localhost:${GOOGLE_PORT}`;

// A throwaway database per run, so accounts made by the specs never pile up in ./data.
const data = () => mkdtempSync(join(tmpdir(), "mdstudio-e2e-"));
// The main server's folder is known to the specs, so one can make an account an admin directly in
// its database (the first account made is the admin, which a spec running alongside others cannot rely on).
env["E2E_DATA_DIR"] ??= data();
// and the mail server's, for the specs that need an admin there (a server-wide switch must not be thrown while other specs run)
env["E2E_MAIL_DATA_DIR"] ??= data();

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!env["CI"],
  retries: env["CI"] ? 1 : 0,
  reporter: env["CI"] ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "bun e2e/fake-github.ts",
      url: `http://localhost:${GITHUB_PORT}/__state`,
      env: { PORT: String(GITHUB_PORT) },
      reuseExistingServer: false,
    },
    {
      command: "bun e2e/fake-google.ts",
      url: `http://localhost:${GOOGLE_PORT}/ready`,
      env: { PORT: String(GOOGLE_PORT) },
      reuseExistingServer: false,
    },
    {
      command: "node .output/server/index.mjs",
      url: `http://localhost:${PORT}`,
      env: {
        PORT: String(PORT),
        NODE_ENV: "production",
        DATA_DIR: env["E2E_DATA_DIR"],
        // keep a version at every sync and only the last 3, so the specs can see both rules at work
        MAX_REVISIONS: "3",
        REVISION_INTERVAL_MINUTES: "0",
      },
      reuseExistingServer: !env["CI"],
    },
    {
      command: "node .output/server/index.mjs",
      url: `http://localhost:${MAIL_PORT}`,
      env: {
        PORT: String(MAIL_PORT),
        NODE_ENV: "production",
        DATA_DIR: env["E2E_MAIL_DATA_DIR"],
        MAIL_FROM: "mdstudio <noreply@example.com>",
        MAIL_OUTBOX_DIR: env["E2E_MAIL_DIR"],
        TRUST_PROXY: "1",
        // publishing to GitHub, against the fake
        GITHUB_CLIENT_ID: "e2e-client",
        GITHUB_CLIENT_SECRET: "e2e-secret",
        GH_TOKEN_KEY: Buffer.alloc(32, 5).toString("base64"),
        GITHUB_URL: env["E2E_GITHUB_URL"],
        GITHUB_API_URL: env["E2E_GITHUB_URL"],
        // signing in with Google, against the fake
        GOOGLE_CLIENT_ID: "e2e-google",
        GOOGLE_CLIENT_SECRET: "e2e-google-secret",
        GOOGLE_URL: env["E2E_GOOGLE_URL"],
      },
      // never reuse: a stray server on this port would answer without mail or the proxy setting
      reuseExistingServer: false,
    },
  ],
});
