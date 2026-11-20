# Roadmap de Packwright

> Prioridad actual: **Fase 1 — creación de modpacks**. Los servidores pasan al final.
> Diseño detallado en [docs/PLAN-MODPACKS.md](docs/PLAN-MODPACKS.md).

## Fase 0 — Fundación ✅
- [x] Scaffold Tauri 2 + React 19 + TypeScript (Vite 8)
- [x] Repo en GitHub, identidad Git y gh CLI
- [x] Rust 1.100 + MSVC Build Tools
- [x] README con visión y arquitectura
- [x] CI (build frontend + cargo check en Win/Linux/Mac)
- [x] App de escritorio compilada y ejecutada
- [x] Plan técnico del modo modpack

## Fase 1 — Modpacks (en curso)

### 1.1 Núcleo ✅
- [x] Modelo de dominio `PackInfo` + parser de `pack.toml` con `toml_edit`
- [x] Config persistente en `%APPDATA%\packwright\config.json` + workspace por defecto
- [x] `CommandRunner`: cola serializada, stdout/stderr separados, eventos `operation://*`
- [x] Crear pack (`packwiz init`) con metadata, loader automático y `meta.toml`
- [x] Listar packs, detectar issues y abrir carpeta
- [x] UI inicial: formulario, tarjetas de pack y consola en vivo

### 1.2 Editor de archivos ✅
- [x] Monaco local con tokenizador TOML, temas propios y lenguajes TOML/JSON/YAML/MD/XML
- [x] Validación TOML/JSON en vivo con `toml_edit` / `serde_json` y marcadores en Monaco
- [x] Guardado atómico (.tmp + rename) + historial con restore
- [x] Sandbox de rutas (path traversal) y Ctrl+S
- [x] Árbol multi-root configurable (Pack / Packwiz / Packwright) con carpetas, filtro y context menu
- [x] Pestañas reordenables por drag & drop, menú contextual y cierres (others/right/all)
- [x] Renombrar / crear / eliminar archivos, con protección de los archivos gestionados por packwiz
- [x] Ajustes de editor persistentes: fuente, tabulación, minimapa y word wrap
- [x] Temas claro y obsidiana (negro azulado), paleta del isotipo e icono de ventana corregido
- [x] Versiones reales de MC (Mojang) y loader (Fabric/Forge/NeoForge/Purpur) con caché offline

### 1.3 Metadatos profesionales ✅
- [x] Campos extendidos en `.packwright/meta.toml` con guardado atómico
- [x] Icono automático en cada pack + botón "Usar isotipo"
- [x] Resumen, licencia, web, código y categorías (máx. 6)
- [x] Generador de README con instrucciones por launcher
- [x] Preview de la ficha + pestaña "Detalles" en el editor
- [x] Banner y Open Graph conectados al README
- [x] Icono, banner y galería de imágenes subibles, visibles en las cards del pack

### 1.4 Catálogo e instalación de mods ✅
- [x] Cliente Modrinth: paginación real, multi-filtro por categoría, tipos (mod/resourcepack/datapack/shader), entorno y orden
- [x] `modrinth add` / `remove` / `update` / `pin` / `unpin` / `refresh` (individual y en lote)
- [x] Preview con descripción Markdown sanitizada, galería, versiones agrupadas y validación de dependencias/conflictos
- [x] Install rápido, toasts con estados y horario de operaciones
- [x] Historial por pack con mods, dependencias y salida de cada operación
- [x] Iconos de mods cacheados, tags con color y health checks (duplicados / sin fuente)

### 1.5 Export / import ✅
- [x] Export `.mrpack` (Modrinth) y `.zip` (CurseForge client/server) con modal simple y validación previa
- [x] Consola flotante opcional (modo debug) para toda la salida de packwiz
- [x] Import `.mrpack` existente (mods, overrides, metadata y packwiz refresh)
- [x] Import desde Modrinth (búsqueda, enlace de proyecto o URL directa al `.mrpack`, detección automática)
- [x] `packwiz serve` con start/stop y URL para launchers

### 1.6 Dev Instance ✅
- [x] Instancia de prueba con symlink/junction del `mods/` (fallback a copia)
- [x] File watcher (`notify`) y sync automático de `overrides/`
- [x] Logs en vivo con detección de errores (marcados como stderr)
- [x] Launch / restart & rejoin / stop desde la app
- [x] Botón único "Play": serve + instancia + watcher + launcher en un paso
- [x] Migración de metadata del pack a la instancia (nombre, autor, descripción, icono, banner, Java)
- [x] Autodetección de Java (PATH, JAVA_HOME, runtimes de launchers) y ruta configurable en Settings

## Fase 2 — Calidad y publicación ✅
- [x] Git: init/status/commit/tag + changelog
- [x] Publicación directa a Modrinth (token + project ID en Settings)
- [x] Perfiles base de packs (Performance, Vanilla+, Kitchen sink)
- [x] i18n ES / EN
- [x] Command palette (Ctrl/Cmd+K) y atajos

## Fase 3 — Servidores ✅ (núcleo)
- [x] Workspace con packs y servidores
- [x] Templates: Vanilla, Paper, Purpur, Forge, NeoForge, Fabric, Velocity
- [x] Setup automático (jar oficial vía APIs: Fill v3 para Paper/Velocity, Mojang, Fabric, Forge, NeoForge y Purpur; eula, properties, Java; JVM args fijos `-Xmx2G`)
- [x] start/stop/restart + consola en vivo con stdin interactivo, autocompletado e historial de comandos
- [x] Sync cliente ↔ servidor (mods)
- [x] Bedrock + GeyserMC (instalador del plugin)
- [x] Backups, jugadores (ops/whitelist/bans)
- [x] Túnel playit.gg: agente `playitd` instalable, secret persistido, start/stop y consola en vivo
- [ ] Agente remoto opcional (SSH) — fuera del alcance actual

## Fuera de alcance
- Agente remoto SSH (opcional en el plan original; no implementado)
- Hosting 24/7 en la nube (la app es local-first)
- Hot-replace de `.jar` en Minecraft en ejecución (limitación de la JVM)
- Móvil como objetivo principal
