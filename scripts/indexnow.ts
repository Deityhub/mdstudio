// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver...) which URLs changed. Run after a
// deploy:  bun scripts/indexnow.ts
// The key is the name of the public/<32 hex>.txt file; engines fetch it to verify we own the site.
import { readdirSync } from "node:fs";
import { indexNowPayload, INDEXABLE_PATHS } from "../src/lib/site/seo";

const file = readdirSync("public").find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!file) throw new Error("No IndexNow key file in public/");

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(indexNowPayload(file.replace(".txt", ""), INDEXABLE_PATHS)),
});
console.log(`IndexNow responded ${res.status}`);
if (!res.ok && res.status !== 202) process.exit(1);
