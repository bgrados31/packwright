# Roadmap de Packwright

## Fase 0 — Fundación ✅
- [x] Scaffold Tauri 2 + React 19 + TypeScript (Vite)
- [x] Repo en GitHub y config de identidad Git
- [x] README con visión y arquitectura
- [ ] MSVC Build Tools (Windows) para poder compilar
- [ ] CI básico (typecheck + lint + build)

## Fase 1 — MVP
Objetivo: crear un pack y arrancar un servidor desde la misma app.

- [ ] Modelo de dominio: `Workspace`, `Pack`, `Server`, `Mod`
- [ ] Persistencia local: `.packwright/config.json` + carpetas por pack/servidor
- [ ] Comandos Rust (Tauri commands):
  - `pack_create`, `pack_list`, `pack_add_mod`, `pack_remove_mod`, `pack_update`
  - `packwiz` como proceso externo (stdout/stderr en_stream)
  - `server_create`, `server_start`, `server_stop`, `server_status`
- [ ] UI: shell de la app, navegación, dashboard del workspace
- [ ] Crear pack (nombre, MC version, loader: Forge/NeoForge/Fabric/Paper)
- [ ] Crear servidor desde template (Vanilla / Paper)
- [ ] Consola en vivo con logs del servidor
- [ ] Selector/Instalador de Java

## Fase 2 — Catálogo y sincronización
- [ ] Cliente Modrinth en Rust (búsqueda, perfiles, versiones)
- [ ] Cliente CurseForge (API key opcional)
- [ ] UI de catálogo con filtros y detalle de mod
- [ ] Instalar mods en pack y en servidor desde el catálogo
- [ ] Sync cliente ↔ servidor (client-only / server-only)
- [ ] Health checks del pack
- [ ] Import `.mrpack` / export para launchers

## Fase 3 — Servidores avanzados
- [ ] Templates: Purpur, Forge, NeoForge, Fabric, Velocity/Bungee
- [ ] `server.properties` y JVM args editor (preset Aikar)
- [ ] Túnel sin port forwarding (playit.gg)
- [ ] Bedrock Dedicated Server + GeyserMC
- [ ] Backups y restore
- [ ] Gestión de ops / whitelist / bans

## Fase 4 — Pulido y distribución
- [ ] i18n ES / EN (baseline del packui-next)
- [ ] Command palette y atajos
- [ ] Actualizador automático de la app
- [ ] Firmas y publicación de instaladores (Windows/macOS/Linux)
- [ ] Agente remoto opcional (SSH) para servidores externos

## Fuera de alcance (por ahora)
- Hosting 24/7 en la nube (la app es local-first, como SquidServers)
- Soporte para móvil como objetivo principal
- Editor de TOML manual como interfaz principal (se prefiere UI)
