import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const source = resolve(args.find((arg) => !arg.startsWith("--")) ?? resolve(root, "../web-app/public/robots.txt"));
const target = resolve(root, "src/honeypot/paths.json");

function parseDisallowed(robots) {
  const paths = [];
  let appliesToAll = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(field)) appliesToAll = value === "*";
    else if (appliesToAll && /^disallow$/i.test(field) && value) paths.push(value);
  }
  return [...new Set(paths)];
}

const paths = parseDisallowed(readFileSync(source, "utf8"));
const invalid = paths.filter((path) => !path.startsWith("/") || path === "/" || /[*$?]/.test(path));
if (!paths.length || invalid.length) {
  console.error(`robots.txt invalido para iscas: ${paths.length ? `entradas ${invalid.join(", ")}` : "nenhum Disallow encontrado"}`);
  process.exit(1);
}

const next = `${JSON.stringify({ source: "web-app/public/robots.txt", paths }, null, 2)}\n`;
let current = "";
try {
  current = readFileSync(target, "utf8");
} catch {}

if (check) {
  if (current !== next) {
    console.error("src/honeypot/paths.json esta desatualizado em relacao ao robots.txt. Rode: npm run honeypot:sync");
    process.exit(1);
  }
  console.log(`paths.json em dia (${paths.length} iscas)`);
} else {
  writeFileSync(target, next);
  console.log(`${paths.length} iscas gravadas em src/honeypot/paths.json`);
}
