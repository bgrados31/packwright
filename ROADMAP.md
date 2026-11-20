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
- [x] `packwiz serve` con start/stop y URL para launchers

### 1.6 Dev Instance
- [ ] Instancia de prueba con junction/symlink del `mods/`
- [ ] File watcher (`notify`) y sync de `overrides/`
- [ ] Consola de logs en vivo y detección de errores
- [ ] Restart & rejoin en un clic

## Fase 2 — Calidad y publicación
- [ ] Git: commit/tag por versión + changelog
- [ ] Publicación directa a Modrinth (API)
- [ ] Perfiles base de packs
- [x] i18n ES / EN
- [ ] Command palette y atajos

## Fase 3 — Servidores (el plan original)
- [ ] Workspace con packs y servidores
- [ ] Templates: Vanilla, Paper, Purpur, Forge, NeoForge, Fabric, Velocity
- [ ] Setup automático (jar, eula, properties, JVM args, Java)
- [ ] start/stop/restart + consola en vivo
- [ ] Sync cliente ↔ servidor
- [ ] Túnel sin port forwarding (playit.gg)
- [ ] Bedrock + GeyserMC
- [ ] Backups, jugadores (ops/whitelist/bans)
- [ ] Agente remoto opcional (SSH)

## Fuera de alcance
- Hosting 24/7 en la nube (la app es local-first)
- Hot-replace de `.jar` en Minecraft en ejecución (limitación de la JVM)
- Móvil como objetivo principal
