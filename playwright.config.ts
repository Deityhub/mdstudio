import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";

// Runs against the production node-server build, so the real CSP and SSR output are exercised.
// Build first: `bun run e2e` does both.
const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!env["CI"],
  retries: env["CI"] ? 1 : 0,
  reporter: env["CI"] ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "node .output/server/index.mjs",
    url: `http://localhost:${PORT}`,
    // A throwaway database per run, so accounts made by the specs never pile up in ./data.
    env: {
      PORT: String(PORT),
      NODE_ENV: "production",
      DATA_DIR: mkdtempSync(join(tmpdir(), "mdstudio-e2e-")),
    },
    reuseExistingServer: !env["CI"],
  },
});
