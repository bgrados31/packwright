# Prompts de identidad visual para Packwright

Copia y pega estos prompts en **Gemini (Imagen)**, **ChatGPT (dall·e)** o el generador que prefieras. Están en inglés porque los modelos suelen entender mejor la terminología de diseño; debajo explico cada uno en español.

> ⚠️ **Regla de oro:** los generadores escriben mal el texto. Pídeles **solo el símbolo (isotipo)** y añade la palabra "Packwright" después con Figma/Inkscape/Canva. Nunca pidas texto legible dentro de la imagen.

## Concepto de marca

**Packwright** = *el herrero de los modpacks*. Un yunque + un bloque de Minecraft + un martillo que forja mods. Identidad: herramienta de desarrollo, oscura, precisa, con acentos violeta/cian.

**Paleta obligatoria**
| Uso | Color |
| --- | --- |
| Fondo | `#0B1020` (azul marino casi negro) |
| Primario | `#7C5CFF` (violeta) |
| Secundario | `#3DDAD7` (cian) |
| Texto | `#E7E9F3` |
| Superficie | `#121830` |

**Estilo:** vector plano, geométrico, silueta fuerte, legible a 32 px, sin 3D, sin fotorrealismo, sin degradados excepto el acento violeta→cian.

---

## 1. Isotipo / icono de app (el más importante)

```
Minimal flat vector app icon for a Minecraft modpack studio called "Packwright".
A stylized blacksmith anvil fused with a pixelated cubic game block, a small
hammer striking the block and releasing violet (#7C5CFF) and cyan (#3DDAD7)
square sparks. Bold geometric silhouette, perfectly centered, symmetrical,
consistent 2px strokes, single cohesive mark. Deep navy background #0B1020
with a subtle violet-to-cyan gradient only on the accent. Square 1:1.
NO text, NO letters, NO words, NO mockup, NO 3D render, NO photorealism,
NO Minecraft logo, NO copied game assets, transparent background option too.
Must remain recognizable at 32x32 pixels.
```

**Español:** el símbolo: yunque + bloque + martillo con chispas cian/violeta. Sin texto. Es el que se usa para el `.ico`, `.icns` y el favicon.

---

## 2. Versión monocroma (para taskbar / bandeja)

```
The same anvil-block-hammer mark as a flat monochrome white silhouette on
transparent background, ultra clean, high contrast, no color, no text,
centered, 1:1 square, designed for a Windows taskbar and macOS menu bar.
```

---

## 3. Banner para README / GitHub

```
Wide developer-tool banner, 16:9, 1920x640. Dark navy #0B1020 background with
a subtle grid of tiny squares. On the left, the Packwright anvil-block-hammer
mark in violet #7C5CFF and cyan #3DDAD7 with soft glow. On the right, generous
negative space reserved for a headline (do NOT write any text). Floating
around the mark: abstract mod-file cards, small gears and cube outlines.
Flat vector, modern SaaS aesthetic, clean, premium, no photorealism, no text.
```

**Español:** banner ancho con el símbolo a la izquierda y espacio vacío a la derecha para poner el título tú mismo.

---

## 4. Open Graph / imagen social (1200×630)

```
Social share image 1200x630 for a desktop app called Packwright. Dark navy
background, the anvil-block-hammer mark slightly large in the center-left,
violet and cyan glow, a few faint modpack card silhouettes behind it,
strong negative space on the right for a title added later. Flat vector,
high contrast, no text, no letters, no logos, no 3D.
```

---

## 5. Textura de fondo para la UI

```
Seamless subtle background pattern for a dark game-development desktop app.
Deep navy #0B1020 base, very low contrast grid of 8px squares, faint outlines
of tiny pickaxes, anvils and cubes scattered sparsely, occasional violet
#7C5CFF and cyan #3DDAD7 pixel glints. Flat, minimal, tileable, low contrast
so UI text stays readable. No text, no characters, no bright elements.
```

---

## 6. Mascota opcional (para onboarding / error states)

```
Cute small blocky golem mascot for a Minecraft modpack tool: a chunky pixel
cube character with a tiny blacksmith apron, holding an oversized hammer,
cyan glowing eyes, violet armor plates, friendly expression, flat vector,
simple shapes, 3/4 view, transparent background, no text, not copied from
any existing game or brand.
```

---

## 7. Mockup de la UI (para capturas del README)

```
Realistic desktop application UI screenshot, 1440x900, dark theme #0B1020
with surface panels #121830 and violet #7C5CFF accents. Left column: a form
titled "Create modpack" with input fields and a violet primary button. Right
area: a responsive grid of modpack cards, each with a small icon, a title,
tag chips like "MC 1.21.1", "neoforge", "mods", and a warning list. Bottom of
the left column: a black monospace console panel with green and red log lines.
Top bar with a hexagonal "PW" brand mark. Clean modern SaaS dashboard,
perfect alignment, generous spacing. Use placeholder shapes and gibberish
instead of readable text, no real logos, no browser chrome, no watermark.
```

**Español:** sirve para generar las capturas del README antes de tener la app terminada. Después las reemplazamos por capturas reales.

---

## Negative prompt global (añade al final de cualquiera)

```
blurry, low resolution, text, watermark, signature, photorealistic, 3D render,
Minecraft official logo, Mojang branding, CurseForge logo, Modrinth logo,
cluttered, oversaturated, neon overload, distorted shapes, extra fingers
```

---

## Checklist de entregables

Pide siempre **PNG con fondo transparente** y, si el modelo lo permite, también SVG:

| Archivo | Uso | Tamaño |
| --- | --- | --- |
| `packwright-mark.png` | Isotipo maestro | 1024×1024 |
| `packwright-mark-mono.png` | Monocromo | 512×512 |
| `packwright-banner.png` | README / GitHub | 1920×640 |
| `packwright-og.png` | Open Graph | 1200×630 |
| `packwright-pattern.png` | Textura UI | 512×512 tileable |
| `packwright-mascot.png` | Onboarding | 512×512 |

Cuando tengas el PNG maestro, Tauri genera **todos** los iconos necesarios (ICO, ICNS, PNG en 8 tamaños, StoreLogo) con un solo comando:

```bash
bun run tauri icon public/packwright-mark.png
```

Eso sobrescribe `src-tauri/icons/` y deja la app lista para empaquetar en Windows, macOS y Linux.
