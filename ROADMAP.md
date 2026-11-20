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

### 1.1 Núcleo
- [ ] Modelo de dominio: `Workspace`, `Pack`, `Metadata`, `Index`, `Mod`
- [ ] Config persistente `.packwright/config.json`
- [ ] `CommandRunner`: cola serializada, stdout/stderr separados, eventos en vivo
- [ ] Crear pack (`packwiz init`) y abrir/importar existente

### 1.2 Editor de archivos
- [ ] Árbol de archivos del pack + Monaco/CodeMirror
- [ ] Validación TOML en vivo con `toml_edit`
- [ ] Guardado atómico + historial/backup
- [ ] Sandbox de rutas (path traversal)

### 1.3 Metadatos profesionales
- [ ] Campos extendidos en `.packwright/meta.toml`
- [ ] Icono (`overrides/icon.png`) y banner
- [ ] Descripción markdown larga, autor, licencia, categorías
- [ ] Preview de la ficha antes de exportar

### 1.4 Catálogo e instalación de mods
- [ ] Cliente Modrinth (búsqueda, filtros, versiones compatibles)
- [ ] `modrinth add` / `curseforge add` / `remove` / `update` / `pin`
- [ ] Health checks (duplicados, dependencias, conflictos)

### 1.5 Export / import
- [ ] Export `.mrpack` (Modrinth)
- [ ] Export `.zip` (CurseForge, client y server)
- [ ] Import `.mrpack` existente
- [ ] `packwiz serve` + README de instalación por launcher
- [ ] Validación previa al export

### 1.6 Dev Instance
- [ ] Instancia de prueba con junction/symlink del `mods/`
- [ ] File watcher (`notify`) y sync de `overrides/`
- [ ] Consola de logs en vivo y detección de errores
- [ ] Restart & rejoin en un clic

## Fase 2 — Calidad y publicación
- [ ] Git: commit/tag por versión + changelog
- [ ] Publicación directa a Modrinth (API)
- [ ] Perfiles base de packs
- [ ] i18n ES / EN
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
