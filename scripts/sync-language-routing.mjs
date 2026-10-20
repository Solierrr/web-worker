import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceArgument = process.argv.indexOf("--web-app");
const sourceRoot = resolve(sourceArgument >= 0 ? process.argv[sourceArgument + 1] : resolve(root, "../web-app"));
const check = process.argv.includes("--check");
const files = ["routing/routing.ts", "routing/routing.data.ts", ...["pt-BR", "en-US", "es-ES"].map((language) => `locales/${language}/routes.json`)];

for (const file of files) {
  const content = await readFile(resolve(sourceRoot, "src/config/i18n", file), "utf8");
  const target = resolve(root, "src/i18n", file);
  if (check) {
    if (await readFile(target, "utf8") !== content) throw new Error(`Language routing snapshot differs: ${file}`);
  } else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}
console.log(check ? "Language routing snapshot matches web-app." : "Language routing snapshot synchronized.");
