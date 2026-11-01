// Copies the KaTeX stylesheet and woff2 fonts from node_modules into public/katex so the app
// serves them itself (offline, no CDN, CSP font-src 'self'). Run after changing the katex version:
//   bun run vendor:katex
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const src = "node_modules/katex";
const out = "public/katex";
mkdirSync(`${out}/fonts`, { recursive: true });

// the "swap" stylesheet uses font-display: swap, so text never stays invisible while fonts load
copyFileSync(`${src}/dist/katex-swap.min.css`, `${out}/katex.min.css`);
for (const f of readdirSync(`${src}/dist/fonts`).filter((n) => n.endsWith(".woff2")))
  copyFileSync(`${src}/dist/fonts/${f}`, `${out}/fonts/${f}`);
copyFileSync(`${src}/LICENSE`, `${out}/LICENSE-katex.txt`);

const { version } = JSON.parse(readFileSync(`${src}/package.json`, "utf8"));
writeFileSync(`${out}/VERSION`, `${version}\n`);
console.log(`vendored KaTeX ${version}`);
