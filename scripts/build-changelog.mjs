/**
 * Genera las notas de release a partir de los commits de conventional commits.
 *
 * Uso: node scripts/build-changelog.mjs [<tag-anterior>] <version>
 * Ej.: node scripts/build-changelog.mjs v0.1.0 0.1.1
 *      node scripts/build-changelog.mjs "" 0.1.0   (primera release: todos los commits)
 */
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const since = args.length >= 2 ? (args[0] ?? "") : "";
const version = args.length >= 2 ? args[1] : args[0];

if (!version) {
  console.error("Uso: node scripts/build-changelog.mjs [<tag-anterior>] <version>");
  process.exit(1);
}

const range = since ? `${since}..HEAD` : "HEAD";
const raw = execFileSync(
  "git",
  ["log", "--no-merges", "--pretty=format:%s%x1f%h", range],
  { encoding: "utf8" },
).trim();

const labels = {
  feat: "Novedades",
  fix: "Correcciones",
  perf: "Rendimiento",
  refactor: "Refactorización",
  build: "Compilación",
  ci: "CI/CD",
  docs: "Documentación",
  test: "Tests",
  style: "Estilos",
  chore: "Mantenimiento",
  revert: "Reversiones",
  otros: "Otros cambios",
};

const groups = new Map();

if (raw) {
  for (const line of raw.split("\n")) {
    const [subject, hash] = line.split("\x1f");
    const match = /^(\w+)(?:\([^)]*\))?(!)?:\s*(.+)$/.exec(subject ?? "");
    const key = match ? (match[1].toLowerCase() in labels ? match[1].toLowerCase() : "otros") : "otros";
    const message = match ? match[3] : subject;
    const breaking = match?.[2] ? " **(breaking)**" : "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(`- ${message}${breaking} (\`${hash}\`)`);
  }
}

let output = `## Packwright ${version}\n`;
if (groups.size === 0) {
  output += "\nSin cambios desde la release anterior.\n";
} else {
  const order = [...Object.keys(labels), ...groups.keys()];
  const seen = new Set();
  for (const key of order) {
    if (seen.has(key) || !groups.has(key)) continue;
    seen.add(key);
    output += `\n### ${labels[key]}\n\n${groups.get(key).join("\n")}\n`;
  }
}

console.log(output.trim());
