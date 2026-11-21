# Packwright — Kit de escaparate y marketing

> Copy listo para usar en la web del producto, redes sociales, lanzamiento y demo.
> Voz: cercana, técnica sin ser fría, centrada en **quitar fricción** al creador de Minecraft.

---

## 1. Posicionamiento

**Categoría:** estudio de escritorio para modpacks y servidores de Minecraft.

**Promesa:** *lo que instalas en el cliente y lo que corres en el servidor salen de la misma fuente de verdad.*

**Diferencial:** las herramientas actuales resuelven una mitad (packwiz/packui para packs, Aternos/Pterodactyl para servidores). Packwright une ambas en local, con una sola biblioteca de mods y sin depender de un servicio externo.

**Público objetivo:** creadores de modpacks, administradores de servidores pequeños y grupos de amigos que quieren jugar con el mismo pack.

---

## 2. Titulares y eslóganes

**Principal**
> Build modpacks. Launch servers. One desktop app.

**Alternativas**
- *Tu modpack y tu servidor, por fin en el mismo sitio.*
- *Deja de pelear con TOML. Empieza a jugar.*
- *El estudio local para crear, probar y compartir modpacks de Minecraft.*
- *Todo lo que tu modpack necesita. Nada que no necesita.*
- *Crea el pack. Enciende el servidor. Juega.*

**Subtítulo corto**
> Un workspace local, una biblioteca de mods, cero cuentas que crear.

**Elevator pitch (30 s)**
> Packwright es una app de escritorio que te permite crear modpacks con packwiz y arrancar tu propio servidor de Minecraft desde la misma interfaz. Buscas mods en Modrinth, los instalas con un clic, editas los archivos con validación en vivo y pulsas Play para probarlo todo en una instancia real. Cuando funciona, exportas para tu launcher o sincronizas el servidor. Todo en local, en Windows, macOS y Linux.

---

## 3. Beneficios (para web y tienda)

| Característica | Beneficio para el usuario |
| --- | --- |
| Catálogo integrado | Encuentra e instala mods sin salir de la app; las dependencias se resuelven solas. |
| Editor con validación | Olvídate de syntax errors en `pack.toml`: los ves mientras escribes. |
| Botón Play | De la idea a una instancia jugable en un clic, con serve, watcher y launcher incluidos. |
| Servidores integrados | Crea, configura y respalda un servidor sin abrir una terminal. |
| Cliente ↔ servidor | Un solo inventario de mods para ambas partes; adiós a copiar jars. |
| Local-first | Tus archivos y tus secretos se quedan en tu equipo. |
| Claro y obsidiana | Trabaja cómodo de día y de noche, con contraste legible. |
| Command palette | `Ctrl/Cmd+K` y atajos para moverse sin tocar el ratón. |

---

## 4. Casos de uso

1. **El pack de la comunidad** — un creador mantiene su pack, publica README e icono, exporta `.mrpack` y publica en Modrinth sin cambiar de herramienta.
2. **La noche de juegos** — un grupo elige mods del catálogo, pulsa Play, prueba en local y enciende el servidor para todos con la misma lista.
3. **El servidor casero** — un administrador configura Paper, ajusta JVM y properties, monitorea jugadores con ping real y hace backups antes de actualizar.
4. **El modder** — prepara metadatos profesionales, genera el README con instrucciones por launcher y versiona con Git desde la propia app.

---

## 5. Copy para lanzamiento

**Hilo / Post anuncio (ES)**
> 🚧 Llevamos tiempo construyendo Packwright y ya es usable: un estudio de escritorio para crear modpacks **y** arrancar servidores de Minecraft en la misma app.
>
> 🔧 Busca mods en Modrinth, edita pack.toml con validación en vivo, pulsa Play para probar tu pack y sincroniza el servidor.
> 🌙 Temas claro y obsidiana, command palette y todo en local.
>
> Es MVP, así que cada feedback cuenta. ¿Qué te gustaría ver primero?

**Versión corta (EN)**
> Packwright is a local-first desktop studio for building Minecraft modpacks and running your own server from the same workspace. Modrinth catalog, live TOML validation, one-click Play, server backups and a real MC ping. MVP is out — feedback welcome.

**LinkedIn**
> Hoy presento Packwright: una app de escritorio que une dos mundos que normalmente están separados —crear modpacks y gestionar servidores de Minecraft.
>
> Construida con Tauri 2, React 19 y Rust. Local-first, multiplataforma y pensada para que quien crea un pack no tenga que pelear con terminales ni con herramientas desconectadas.
>
> Está en fase MVP. Si haces modpacks o mantienes un servidor, me encantaría saber qué te falta.

---

## 6. Guion de demo (90 s)

1. **Home (0:00)** — «Este es el panel: un vistazo a tus packs, mods y launchers.»
2. **Modpacks (0:15)** — «Aquí está mi pack. Filtro, busco y abro.»
3. **Mods (0:30)** — «Busco un mod en Modrinth, veo versiones y dependencias e instalo en un clic.»
4. **Editor (0:50)** — «Los archivos se editan aquí con resaltado y validación; el error aparece antes de guardar.»
5. **Play (1:05)** — «Pulsamos Play: se levanta serve, la instancia y el watcher.»
6. **Servidor (1:20)** — «Y el mismo pack se sincroniza con mi servidor, con consola y backups.»
7. **Cierre (1:30)** — «Todo local. Packwright.»

---

## 7. Identidad visual

| Uso | Color | Hex |
| --- | --- | --- |
| Naranja de marca | acento principal / CTA | `#C74A2E` |
| Navy | superficie oscura / texto | `#232C3A` |
| Hueso | texto claro / fondos | `#F0F1F5` |
| Ámbar | acento secundario | `#D98A3F` |

- Isotipo: **«El Sello del Forjador»** (yunque + P + tres píxeles y un hueco vacío para el siguiente mod).
- Fuentes: Inter (UI) y Cascadia Code (código).
- Tono: artesanal, preciso, sin clichés de bloques de Minecraft.

Recursos: `public/banner_readme.jpg`, `public/open_graph.jpg`, `public/packwright-mark.png`, prompts en [ASSETS-PROMPT.md](ASSETS-PROMPT.md).

---

## 8. Capturas del producto

Todas tomadas de la app real en ejecución.

- `screenshots/01-home-light.jpg`, `screenshots/06-home-dark.jpg` — inicio en ambos temas.
- `screenshots/02-modpacks-light.jpg`, `screenshots/07-modpacks-dark.jpg` — biblioteca de packs.
- `screenshots/03-mods-light.jpg`, `screenshots/10-mods-dark.jpg` — catálogo de mods.
- `screenshots/04-editor-light.jpg`, `screenshots/11-editor-dark.jpg` — editor Monaco.
- `screenshots/05-details-light.jpg` — metadatos y preview del pack.
- `screenshots/08-servers-dark.jpg`, `screenshots/09-server-detail-dark.jpg` — servidores.

**Uso sugerido:** README, ficha de descarga, hilo de lanzamiento, slide de demo y Open Graph.
