/**
 * Genera el `latest.json` que consume el plugin de updater de Tauri.
 *
 * Los instaladores ya fueron compilados y descargados como artifacts de GitHub
 * Actions. Aquí se firman con la clave privada (secreto TAURI_SIGNING_PRIVATE_KEY)
 * y se publica el manifiesto con las URLs de la release.
 *
 * Uso: node scripts/build-updater-json.mjs <version> <tag>
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

const [version = "", tag = ""] = process.argv.slice(2);
if (!version || !tag) {
  console.error("Uso: node scripts/build-updater-json.mjs <version> <tag>");
  process.exit(1);
}

const root = process.cwd();
const artifacts = join(root, "artifacts");
const repo = "bgrados31/packwright";

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(artifacts);

function find(predicate, description) {
  const match = files.find(predicate);
  if (!match) throw new Error(`No se encontró ${description} en artifacts/`);
  return match;
}

function sign(file) {
  console.log(`Firmando ${relative(root, file)}…`);
  execFileSync("bun", ["run", "tauri", "signer", "sign", "--app-version", version, file], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const signature = readFileSync(`${file}.sig`, "utf8").trim();
  if (!signature) throw new Error(`Firma vacía para ${file}`);
  return {
    signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(basename(file))}`,
  };
}

const windows = find((file) => file.endsWith("_x64-setup.exe"), "instalador de Windows");
const macos = find((file) => file.endsWith(".app.tar.gz"), "bundle de macOS");
const linux = find((file) => file.endsWith("_amd64.AppImage"), "AppImage de Linux");

const mac = sign(macos);
const platforms = {
  "windows-x86_64": sign(windows),
  // El bundle universal sirve para ambas arquitecturas de macOS.
  "darwin-aarch64": { ...mac },
  "darwin-x86_64": { ...mac },
  "linux-x86_64": sign(linux),
};

const notesPath = join(artifacts, "release-notes", "CHANGELOG_RELEASE.md");
const notes = existsSync(notesPath) ? readFileSync(notesPath, "utf8").trim() : `Packwright ${version}`;

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

writeFileSync(join(root, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log("latest.json generado:");
console.log(JSON.stringify(manifest, null, 2));
