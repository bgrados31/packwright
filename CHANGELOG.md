# Changelog

Todas las Novedades Relevantes de Packwright se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Cada push a `main` publica una release con versión patch nueva (`0.1.0` → `0.1.1` → `0.1.2`, ver `.github/workflows/release.yml`); las notas de cada release se generan desde los commits entre tags.

## [Unreleased]

### Added

- Gestor de instancias completo en Launcher: entidades propias e independientes con `instance.json`, icono y carpeta; crear, listar, detallar, editar, clonar y eliminar con confirmación por nombre.
- Nuevos comandos `instance_create/update/delete/clone/detail/list/install/play` e `icon_*`, con nombres seguros, sandbox de rutas y backup antes de sobrescribir metadatos.
- Creación guiada con catálogo real de Minecraft, versión de loader (recomendada o concreta), vista previa (Java, mods estimados y estado) y atajo `Ctrl/Cmd+I` / acción en la paleta.

- Configuración avanzada por instancia: resolución/fullscreen, argumentos JVM aplicados al arrancar y runtime Java; estados explícitos `installing`, `error`, `ready`, `needs-install` y `playing`.
- Idiomas français, Deutsch y Português con cobertura completa del diccionario y selector en Ajustes; `Ctrl/Cmd+K` alterna entre los cinco idiomas soportados.

### Changed

- Carga diferida de idiomas y de las vistas pesadas (editor, servidores, launcher, ajustes, modales): el bundle inicial pasa de ~592 kB a ~313 kB (gzip 162 → 93 kB).

- Launcher integrado para vanilla/Fabric/Quilt/Forge/NeoForge: instala el runtime (cliente, librerías, assets y natives) o ejecuta el instalador oficial del loader, y arranca Minecraft dentro de la app con los mods del pack sincronizados, consola en vivo y perfil por pack.
- Gestor de JDK propios: descarga automática de Java 8/17/21 desde Adoptium/Microsoft, selección por versión de Minecraft y uso sin `JAVA_HOME` ni instalación manual.
- «Play & connect»: arranca automáticamente un servidor de Packwright y conecta el cliente a `127.0.0.1:puerto`; también acepta direcciones personalizadas.
- Vista **Launcher** en la barra lateral, botón Jugar en el editor, atajo `Ctrl/Cmd+5` y acción en la paleta de comandos.

- Nueva raíz **Game instance** en el editor: explora y edita los archivos reales de la instancia (`config/`, `mods/`, `options.txt`, logs…) junto a los del pack, con backups atómicos y sandbox de rutas.
- Apertura rápida de archivos con `Ctrl/Cmd+P` entre todas las raíces, con búsqueda por nombre, ruta y subsecuencia.
- Resaltado de sintaxis para `.properties`/`.cfg`/`.ini` y logs de Minecraft, además de LTS, sticky scroll, autocompletado y cuidado del cursor en Monaco.

- Barra superior global con migas de pan, búsqueda de comandos y acciones rápidas (tema, nueva instancia, atajos).
- Panel de atajos de teclado accesible con `?` o desde la paleta de comandos: `Ctrl/Cmd+1..4` para navegar, `Ctrl/Cmd+N` para crear un pack y `Ctrl/Cmd+S` para guardar.
- Enlace de salto al contenido y anillo de foco visible en los nuevos controles.
- Drag & drop en el explorador: arrastrar un archivo a una carpeta lo mueve de verdad (en pack e instancia, con misma raíz y sandbox); soltarlo sobre otro archivo reordena la vista y se guarda por carpeta.

### Changed

- Paleta de comandos agrupada por categorías, con recuento de resultados, pistas de atajos y scroll automático sobre la opción seleccionada.
- Notificaciones con barra de progreso, pausa al pasar el ratón y ciclo de vida gestionado por cada toast (los avisos en curso ya no caducan).
- La barra lateral muestra en vivo si Packwiz está disponible.
- «Configure roots» es ahora un único panel en la cabecera del explorador, en lugar de repetirse bajo cada raíz.

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
