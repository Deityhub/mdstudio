// Fails when an installed package has a license outside the policy. Run: bun run licenses
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { verdict } from "./license-policy";

const root = "node_modules";
const dirs = readdirSync(root).flatMap((n) =>
  n.startsWith(".")
    ? []
    : n.startsWith("@")
      ? readdirSync(`${root}/${n}`).map((s) => `${n}/${s}`)
      : [n],
);

const failures: string[] = [];
let count = 0;
for (const dir of dirs) {
  const file = `${root}/${dir}/package.json`;
  if (!existsSync(file)) continue;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const license =
    typeof pkg.license === "string"
      ? pkg.license
      : (pkg.license?.type ?? pkg.licenses?.map((l: { type: string }) => l.type).join(" OR "));
  count++;
  const v = verdict(pkg.name ?? dir, license);
  if (!v.ok) failures.push(`${pkg.name ?? dir}@${pkg.version}: ${v.reason}`);
}

if (failures.length) {
  console.error(`License check failed:\n${failures.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`License check passed (${count} packages).`);
