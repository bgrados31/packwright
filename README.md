# Packwright

> Build modpacks. Launch servers. One desktop app.

**Packwright** es un estudio de escritorio para crear y mantener modpacks de Minecraft (con [packwiz](https://packwiz.infra.link/)) **y** arrancar/gestionar servidores propios, inspirado en la experiencia de [SquidServers](https://squidservers.com/en). Todo en local, multiplataforma (Windows, macOS y Linux) y con una sola biblioteca de mods compartida.

## ¿Por qué?

Hoy las herramientas están separadas:

| Herramienta | Qué hace | Limitación |
| --- | --- | --- |
| `packwiz` | Metadatos de modpacks en TOML | Solo CLI |
| `packui-next` | UI web para modpacks | Solo packs, solo navegador |
| SquidServers / Aternos / Pterodactyl | Servidores | No crean packs, algunos son de pago o requieren servidor |

Packwright une las dos mitades: **lo que instalas en el cliente y lo que corres en el servidor salen de la misma fuente de verdad**.

## Concepto central

```
                 ┌────────────────────────┐
                 │   Workspace Packwright │
                 │  (un solo caché de mods)│
                 └───────────┬────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
     ┌────────────────┐            ┌────────────────┐
     │  Modpack       │            │  Server        │
     │  pack.toml     │  ◀─ sync ─▶│  Paper/Forge/  │
     │  mods/*.pw.toml│            │  Fabric/Velocity│
     └────────────────┘            └────────────────┘
              │                             │
              ▼                             ▼
     Launcher (ATLauncher,         start/stop + consola
     Prism, Modrinth App)          + túnel opcional
```

## Funcionalidades planeadas

### Modpacks
- Crear/editar packs packwiz (`pack.toml`, versión de Minecraft y loader).
- Catálogo de Modrinth y CurseForge con búsqueda, filtros y detalle de versiones.
- Instalar, actualizar, fijar (pin) y quitar mods.
- Health checks: duplicados, dependencias faltantes, conflictos de versión.
- Importar `.mrpack` / packs de CurseForge; exportar para launchers.

### Servidores
- Templates: Vanilla, Paper, Purpur, Forge, NeoForge, Fabric, Velocity/Bungee.
- Setup automático: descarga del `.jar`, `eula.txt`, `server.properties`, JVM args (preset Aikar).
- Detección e instalación guiada de Java (17/21 según la versión).
- Ciclo de vida: start / stop / restart con consola en vivo y logs.
- Túnel opcional tipo playit.gg para jugar sin port forwarding.
- Bedrock Dedicated Server + GeyserMC para crossplay.
- Backups con snapshots y restore.
- Gestión de jugadores: ops, whitelist, bans.

### Compartido
- Sincronización cliente ↔ servidor (mods client-only / server-only).
- Un solo caché de descargas y hashes.
- Interfaz en español e inglés.
- Atajos de teclado / command palette.

Ver el plan detallado en [ROADMAP.md](ROADMAP.md).

## Stack

| Capa | Tecnología | Motivo |
| --- | --- | --- |
| Backend / nativo | **Rust** (Tauri 2) | filesystem, TOML, lanzar packwiz, supervisar procesos, descargas, backups |
| UI | **React 19 + TypeScript** | catálogo, dashboards, editores, i18n |
| Build UI | Vite 8 | desarrollo rápido del frontend |
| Escritorio | **Tauri 2** | un codebase → Windows, macOS y Linux; binarios pequeños |

## Requisitos

- [Bun](https://bun.sh/) >= 1.4 (o Node + npm)
- [Rust](https://rustup.rs/) estable
- En Windows: **MSVC Build Tools** (Visual Studio C++ Build Tools)
- [packwiz](https://packwiz.infra.link/installation/) en el PATH (para las operaciones de packs)
- Opcional: ATLauncher / Prism / Modrinth App

## Desarrollo

```bash
bun install
bun run tauri dev        # app de escritorio con hot reload
```

Solo el frontend (más rápido, sin Rust):

```bash
bun run dev              # Vite en http://localhost:1420
```

Build de producción:

```bash
bun run tauri build      # instaladores .msi / .deb / .dmg
```

## Relación con `packui-next`

`packui-next` fue el prototipo web que validó la idea de gestionar packs con UI. Packwright es su evolución: misma idea de catálogo y gestión, pero como aplicación de escritorio real y con gestión de servidores. El código se reutilizará donde tenga sentido.

## Estado

🚧 Proyecto en fase inicial (MVP). No lanzar aún en producción.

## Licencia

Pendiente de definir.
