/**
 * Aplica una versión a todos los archivos que la declaran.
 * Se usa en CI antes de compilar para que el instalador lleve la versión
 * correspondiente al tag/release, sin necesidad de hacer commit del bump.
 *
 * Uso: node scripts/set-version.mjs 1.2.3
 */
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version ?? "")) {
  console.error("Uso: node scripts/set-version.mjs <version>  (ej. 1.2.3)");
  process.exit(1);
}

// Reemplazo puntual para conservar el formato y los saltos de línea originales.
const targets = [
  ["package.json", /"version"\s*:\s*"[^"]+"/],
  ["src-tauri/tauri.conf.json", /"version"\s*:\s*"[^"]+"/],
  ["src-tauri/Cargo.toml", /^version\s*=\s*"[^"]+"/m],
];

for (const [file, pattern] of targets) {
  const original = readFileSync(file, "utf8");
  if (!pattern.test(original)) {
    throw new Error(`No se encontró la versión en ${file}`);
  }
  const updated = original.replace(pattern, (match) =>
    file.endsWith(".toml")
      ? `version = "${version}"`
      : match.replace(/:\s*"[^"]+"/, `: "${version}"`),
  );
  writeFileSync(file, updated);
  console.log(`${file} -> ${version}`);
}
