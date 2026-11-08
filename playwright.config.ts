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
// A fake GitHub for the mail server to connect to (see e2e/fake-github.mjs).
const GITHUB_PORT = 4382;
env["E2E_GITHUB_URL"] ??= `http://localhost:${GITHUB_PORT}`;

// A throwaway database per run, so accounts made by the specs never pile up in ./data.
const data = () => mkdtempSync(join(tmpdir(), "mdstudio-e2e-"));

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
      command: "node e2e/fake-github.mjs",
      url: `http://localhost:${GITHUB_PORT}/__state`,
      env: { PORT: String(GITHUB_PORT) },
      reuseExistingServer: false,
    },
    {
      command: "node .output/server/index.mjs",
      url: `http://localhost:${PORT}`,
      env: {
        PORT: String(PORT),
        NODE_ENV: "production",
        DATA_DIR: data(),
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
        DATA_DIR: data(),
        MAIL_FROM: "mdstudio <noreply@example.com>",
        MAIL_OUTBOX_DIR: env["E2E_MAIL_DIR"],
        TRUST_PROXY: "1",
        // publishing to GitHub, against the fake
        GITHUB_CLIENT_ID: "e2e-client",
        GITHUB_CLIENT_SECRET: "e2e-secret",
        GH_TOKEN_KEY: Buffer.alloc(32, 5).toString("base64"),
        GITHUB_URL: env["E2E_GITHUB_URL"],
        GITHUB_API_URL: env["E2E_GITHUB_URL"],
      },
      // never reuse: a stray server on this port would answer without mail or the proxy setting
      reuseExistingServer: false,
    },
  ],
});
