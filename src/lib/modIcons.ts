import { invoke } from "@tauri-apps/api/core";

/** Caché en memoria de iconos de Modrinth ya resueltos (una sola llamada al backend). */
const cache = new Map<string, string>();

export function cachedModIcon(projectId: string | null | undefined): string | undefined {
  return projectId ? cache.get(projectId) : undefined;
}

export async function loadModIcons(ids: string[]): Promise<void> {
  const missing = [...new Set(ids.filter(Boolean))].filter((id) => !cache.has(id));
  if (missing.length === 0) return;
  try {
    const icons = await invoke<Record<string, string>>("mods_icons", { projectIds: missing });
    Object.entries(icons).forEach(([id, url]) => cache.set(id, url));
  } catch {
    // Los iconos son decorativos; si falla se usa el placeholder.
  }
}
