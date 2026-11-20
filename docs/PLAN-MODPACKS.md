# Plan técnico: modo de creación de modpacks

> Objetivo de la Fase 1 de Packwright. Los servidores quedan para después.

## 1. Qué hace hoy packui-next (verificado en su código)

Referencia: `C:\Users\Bryan\source\repos\packui-next`.

| Capacidad | Implementación real | Limitación |
| --- | --- | --- |
| Export | `packwiz modrinth export --output .cache/exports/<slug>.mrpack` (`src/core/infrastructure/fs/export.ts`) | Solo `.mrpack`; no genera zip de CurseForge |
| Import | `importMrpack()` lee `modrinth.index.json` y escribe `pack.toml`, `index.toml`, `*.pw.toml` | Útil, hay que copiarla |
| "Live testing" | `packwiz serve -p 8080` + `preLaunchCommand` con `packwiz-installer-bootstrap.jar` en una instancia de ATLauncher clonada | **No es hot reload**: actualiza al lanzar el juego. Requiere una instancia base ya creada |
| Editor de archivos | No existe. Solo reescritura por regex de `pack.toml` / `index.toml` / `*.pw.toml` | No se pueden editar configs arbitrarias |
| Metadatos | `name`, `author`, `version`, `description` en `pack.toml` | Sin icono, banner, resumen, categorías ni licencia |
| Procesos | `spawn` con cola global serializada, stdout+stderr mezclados, SSE a la UI | Salida no diferenciada |

**Conclusión:** el "modo desarrollador" de packui es *auto-actualización al arrancar*, no recarga en caliente. Packwright debe ser honesto al respecto e ir un paso más allá.

## 2. Verdicto

- ✅ El enfoque "primero modpacks, luego servidores" es correcto.
- ✅ `.mrpack` (no `.rmpack`) es el formato correcto y ATLauncher lo importa de forma nativa (`ImportPackUtils.java`).
- ⚠️ No es posible sustituir un `.jar` de mod en un Minecraft ya abierto: la JVM cargó las clases. Sí es posible recargar configs/resources y reiniciar en segundos sin re-descargar.
- ✅ Las mejoras reales de Packwright sobre packui: editor con validación, metadatos completos, export dual, import, preview, git/changelog y un Dev Instance con watcher.

## 3. Arquitectura

```
src-tauri/src/
  pack/       Pack, Metadata, Index, validación
  fs/         workspace seguro, path sandbox, watcher (notify)
  catalog/    Modrinth API, resolución de versiones
  export/     mrpack, curseforge, serve, README por launcher
  dev/        DevInstance, symlinks/junctions, sync, logs
  process/    CommandRunner con cola + stdout/stderr separados
  git/        commit, tag, changelog
```

Frontend: React 19 + TypeScript + Monaco/CodeMirror + Tailwind + Zustand/TanStack Query + i18n ES/EN.
Persistencia: `.packwright/config.json` (workspace, pack activo, puerto serve, ATLauncher path, locale).

## 4. Modelo de datos

### `pack.toml` (formato packwiz, intacto)
```toml
pack-format = "packwiz:1.1.0"
name = "Mi Pack"
author = "Bryan"
version = "1.0.0"
description = "Un pack de ejemplo"

[versions]
minecraft = "1.21.1"
neoforge = "21.1.0"

[index]
file = "index.toml"

[options]
datapack-folder = "datapacks"
```

### `.packwright/meta.toml` (extensiones de Packwright)
```toml
summary = "Descripción corta para la ficha"
license = "MIT"
homepage = "https://..."
source = "https://github.com/..."
categories = ["Adventure", "Performance"]
icon = "assets/icon.png"
banner = "assets/banner.png"
readme = "README.md"
```

### En el export
- `overrides/icon.png` — icono para launchers que lo respetan.
- `overrides/README.txt` — instrucciones de instalación por launcher.
- `assets/banner.png` y `README.md` — para publicación en Modrinth.

## 5. Comandos de packwiz (wrapper Rust)

Mismos que packui, más CurseForge export:

`init`, `refresh`, `list`, `modrinth add`, `curseforge add`, `remove`, `update`, `pin`, `unpin`, `modrinth export`, `curseforge export`, `serve`.

Mejoras sobre el runner de packui:
- **Cola serializada** (igual, evita escrituras concurrentes sobre `index.toml`).
- **stdout y stderr separados** (packui los mezcla) → mejor diagnóstico.
- Eventos Tauri `operation://line` para consola en vivo.
- Validación de argumentos (rechazar `\r\n"&|<>^%`).

## 6. Editor de archivos

- Árbol del workspace: `pack.toml`, `index.toml`, `mods/*.pw.toml`, `overrides/config/**`, `.packwright/meta.toml`.
- Monaco/CodeMirror con syntax highlighting TOML/JSON/YAML.
- Validación en vivo: `toml_edit::DocumentMut` en Rust → errores con línea y columna.
- Guardado atómico (escribe `.tmp` y renombra) + backup automático en `.packwright/history/`.
- **Sandbox**: resolver canonical path y rechazar cualquier ruta fuera del workspace (path traversal).
- Diff simple contra la última versión guardada (packui ya tenía snapshots; aquí se generaliza).

## 7. Export e import

| Acción | Comando / detalle |
| --- | --- |
| Modrinth | `packwiz modrinth export -o <salida>.mrpack` |
| CurseForge | `packwiz curseforge export -o <salida>.zip --side client` |
| Servidor | `packwiz curseforge export --side server` (preparación para Fase 2) |
| Auto-update | `packwiz serve -p <puerto>` + bootstrap del installer |
| Import | Leer `modrinth.index.json` → escribir `pack.toml`/`index.toml`/`*.pw.toml` → `refresh` |

Validación previa: versión no vacía, loader definido, MC version presente, sin mods duplicados, URLs/hashes válidos, icono presente.

## 8. Dev Instance (modo desarrollador)

**Verdad del motor:** no se puede reemplazar un `.jar` en caliente. Estrategia:

1. Crear instancia de prueba con `mods/` como **junction (Windows) / symlink (Unix)** al `mods/` del pack → cambios sin copiar.
2. `notify` vigila `pack.toml`, `index.toml`, `mods/`, `overrides/`.
3. Según el tipo de cambio:
   - `overrides/config`, datapacks → copiar a la instancia + sugerir `/reload`.
   - resource packs → copiar + sugerir `F3+T`.
   - `*.jar` → marcar "restart required" con botón **Restart & rejoin**.
4. `packwiz serve` en background para que el launcher actualice por HTTP.
5. Consola con logs en vivo y detección de errores (`Missing dependency`, `Crash`).
6. Reinicio rápido: relanzar launcher con la última instancia y mundo de prueba.

## 9. Funcionalidades adicionales

- Health checks: duplicados, dependencias faltantes, conflictos de versión, RAM sugerida.
- Preview de la ficha de Modrinth antes de publicar.
- Git: commit/tag por versión y changelog desde `index.toml`.
- Publicación directa a Modrinth (API) — fase tardía.
- Export de README con instrucciones por launcher (ATLauncher, Prism, Modrinth App, MultiMC).
- Perfiles base: "Vanilla+", "Performance", "Kitchen sink" con mods iniciales.

## 10. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cambios concurrentes sobre `index.toml` | Cola serializada de comandos |
| Rutas maliciosas en el editor | Sandbox con canonical path |
| Export inválido por metadata vacía | Validación previa al export |
| Expectativa de hot reload de mods | Explicación clara en la UI del Dev Instance |
| `.mrpack` sin icono visible en algunos launchers | Incluir `overrides/icon.png` + README |
