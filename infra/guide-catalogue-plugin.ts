import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { readGuideCatalogue } from "./guide-catalogue";

// What each guide says about itself (slug, title, description, order and dates) is in its own front
// matter (content/guides/<slug>.md). This hands it to the catalogue as a module, so lists, the
// sitemap and structured data know it without loading any guide text, and a new guide needs no
// change to the code.
export function guideCatalogue(): Plugin {
  const id = "virtual:guide-catalogue";
  const dir = "content/guides";
  return {
    name: "guide-catalogue",
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(resolved) {
      if (resolved !== `\0${id}`) return null;
      for (const file of readdirSync(dir)) this.addWatchFile(resolve(dir, file));
      return `export default ${JSON.stringify(readGuideCatalogue(dir))};`;
    },
  };
}
