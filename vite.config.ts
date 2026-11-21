import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import { readdirSync, rmSync } from "node:fs";
// @ts-expect-error type error without @types/node package
import { join } from "node:path";
const host = process.env.TAURI_DEV_HOST;

/**
 * Vite copia todo `public/` a `dist/` y Tauri incrusta `dist/` en el binario.
 * Los `.exe` de `public/` están gitignoreados (herramientas locales del dev),
 * así que no deben acabar en el instalador: cada MB cuenta.
 */
const stripLocalBinaries = {
  name: "strip-local-binaries",
  apply: "build" as const,
  closeBundle() {
    const out = join(process.cwd(), "dist");
    for (const entry of readdirSync(out, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) {
        rmSync(join(out, entry.name), { force: true });
        console.log(`[strip-local-binaries] removed dist/${entry.name}`);
      }
    }
  },
};

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), stripLocalBinaries],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
