import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { isPreview, workerConfig } from "./infra/worker-config";

// Deploy target is chosen at build time: Cloudflare Workers by default,
// `NITRO_PRESET=node-server` for the self-hosted Docker image.
const preset = process.env["NITRO_PRESET"] ?? "cloudflare-module";

export default defineConfig(({ command }) => ({
  server: { host: "::", port: 8080 },
  css: { transformer: "lightningcss" },
  // Preview deployments tell crawlers to stay away (see src/lib/csp.ts).
  define: { "import.meta.env.VITE_PREVIEW": JSON.stringify(String(isPreview(process.env))) },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  plugins: [
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
