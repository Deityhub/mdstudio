import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { guideCatalogue, legalCatalogue } from "./infra/guide-catalogue-plugin";
import { isPreview, workerConfig } from "./infra/worker-config";

// Deploy target is chosen at build time: Cloudflare Workers by default,
// `NITRO_PRESET=node-server` for the self-hosted Docker image.
const appVersion: string = JSON.parse(readFileSync("package.json", "utf8")).version;
const preset = process.env["NITRO_PRESET"] ?? "cloudflare-module";

export default defineConfig(({ command }) => ({
  server: { host: "::", port: 8080 },
  css: { transformer: "lightningcss" },
  // Preview deployments tell crawlers to stay away (see src/lib/server/csp.ts).
  define: {
    "import.meta.env.VITE_PREVIEW": JSON.stringify(String(isPreview(process.env))),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  resolve: {
    alias: [
      // The Workers bundle must not contain better-sqlite3 (see src/server/node-driver.ts).
      ...(preset === "cloudflare-module"
        ? [
            {
              find: "@/server/node-mail",
              replacement: fileURLToPath(
                new URL("./src/server/node-mail.stub.ts", import.meta.url),
              ),
            },
            {
              find: "@/server/node-storage",
              replacement: fileURLToPath(
                new URL("./src/server/node-storage.stub.ts", import.meta.url),
              ),
            },
            {
              find: "@/server/node-collab",
              replacement: fileURLToPath(
                new URL("./src/server/node-collab.stub.ts", import.meta.url),
              ),
            },
            {
              find: "@/server/node-driver",
              replacement: fileURLToPath(
                new URL("./src/server/node-driver.stub.ts", import.meta.url),
              ),
            },
          ]
        : []),
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  plugins: [
    guideCatalogue(),
    legalCatalogue(),
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      // src/server.ts is our SSR error wrapper; nitro builds from it.
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    // ponytail: nitro only runs for production builds, dev uses Vite's own server
    ...(command === "build"
      ? [
          nitro({
            preset,
            // The self-hosted server holds the sockets itself. On Workers the app forwards the
            // upgrade to a Durable Object, and nitro's own handler would take it first.
            ...(preset !== "cloudflare-module" && { features: { websocket: true } }),
            ...(preset === "cloudflare-module" && {
              cloudflare: {
                nodeCompat: true,
                deployConfig: true,
                wrangler: workerConfig(process.env),
              },
            }),
          }),
        ]
      : []),
    viteReact(),
  ],
}));
