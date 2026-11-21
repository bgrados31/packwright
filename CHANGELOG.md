# Changelog

Todas las Novedades Relevantes de Packwright se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Cada push a `main` publica una release con versión patch nueva (`0.1.0` → `0.1.1` → `0.1.2`, ver `.github/workflows/release.yml`); las notas de cada release se generan desde los commits entre tags.

## [0.1.0] — 2026-11-21

### Added

- Eliminación completa de modpacks y servidores con modal de confirmación que exige escribir el nombre exacto.
- Puntos de entrada para borrar: tarjetas de pack (grid y lista), Zona de peligro en Details, tarjeta de servidor y panel del servidor.
- Borrado de packs y servidores con validación de `pack.toml` / `server.toml`, parada previa del proceso y limpieza de estado.
- Kit de marketing y escaparate del producto: `docs/SHOWCASE.md`, metadatos Open Graph/Twitter y galería de 11 capturas reales en `docs/screenshots/`.
- Release automático en cada push a `main`, con instaladores multiplataforma y changelog generado desde el tag anterior.
- Tests de seguridad: path traversal, redacción de secretos, ping TCP y borrado seguro.

### Changed

- Pestaña **Details** rediseñada: preview con icono/banner reales, contadores de resumen y categorías, chips en vivo y enlaces web/source.
- Temas claro y obsidiana con `color-scheme`, bootstrap antes del primer paint, contraste AA y anillos de foco visibles.
- Rediseño del flujo de secretos: `config_get` nunca devuelve tokens, `config_set` los preserva, comando explícito para borrarlos y CSP estricto.
- Ping de Minecraft migrado de UDP a TCP con timeout y parseo incremental.
- Cliente HTTP compartido (pool/TLS reutilizado), opciones de Monaco memoizadas y polling limitado a la pestaña activa.
- El build excluye ejecutables locales de `public/` para no inflar el instalador (de ~400 MiB a ~21 MiB).

### Fixed

- Paths traversal en `file_restore`, `server_dir` y `pack_root`.
- Pánico por offsets UTF-8 en diagnósticos TOML.
- `server_create` ya no borra servidores con `server.toml` incompatible.
- Procesos huérfanos: `kill` + `wait`, `kill_on_drop` y estados con `try_wait`.
- Atajos `Ctrl/Cmd+K` dentro de inputs, avatares obsoletos y listeners huérfanos en modales.
- Archivos malformados (meta, listas de jugadores) ya no se sobrescriben silenciosamente.

### Security

- Tokens de Modrinth/CurseForge y secreto de playit redactados del frontend.
- CSP sin `unsafe-inline`/`unsafe-eval` en `script-src`, compatible con Monaco.
- Validación centralizada de rutas (`paths::safe_component` / `contained`).
