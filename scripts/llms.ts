// Writes public/llms.txt from the site copy and the guides' front matter: `bun run llms`.
import { writeFileSync } from "node:fs";
import { readGuideCatalogue } from "../infra/guide-catalogue";
import { llmsTxt } from "../src/lib/site/llms";

writeFileSync("public/llms.txt", llmsTxt(readGuideCatalogue()));
console.log("public/llms.txt written");
