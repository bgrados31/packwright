# Identidad visual de Packwright — prompts maestros

> Todo lo necesario para generar el isotipo, el icono de app y las imágenes del repo.
> Los prompts están en inglés (los modelos responden mejor); la explicación está en español.
> **Regla:** nunca pidas texto legible dentro de la imagen. Añade "Packwright" después en Figma/Canva.

---

## 1. El concepto: *El Sello del Forjador*

Queremos huir del cliché de "martillo + yunque + bloque de Minecraft". La idea propia es:

> **Un sello de artesano.** Una placa cuadrada con las cuatro esquinas recortadas (como la cara de un bloque visto de frente, pero abstracto). En su interior, un **yunque en negativo que al mismo tiempo dibuja la letra P**. Una única diagonal —la herramienta del forjador— cruza de abajo-izquierda a arriba-derecha y, donde toca la placa, **se desprenden tres píxeles cuadrados**: los mods. Falta un cuarto hueco: el sitio del siguiente mod.

Por qué funciona:
- El **P** es el monograma de Packwright y hace de isotipo.
- La **placa recortada** remite a un bloque sin copiar assets de Minecraft.
- Los **píxeles desprendidos** = mods instalados; el **hueco vacío** = "siempre queda sitio para uno más".
- La **diagonal** es el gesto de "forjar/escribir", no un rayo ni un láser genérico.
- Es **asimétrico a propósito** en los píxeles: se siente hecho a mano, no generado.

**Paleta (la misma de la app):**
| Uso | Hex |
| --- | --- |
| Fondo oscuro / superficie | `#0F1116` |
| Placa / marca | `#F2F3F7` |
| Violeta (acento principal) | `#5B4BE0` |
| Cian (acento secundario) | `#3DDAD7` |
| Gris neutro (píxel dado) | `#9AA4B8` |

---

## 2. Prompt maestro — isotipo (el que debes usar)

Copia este bloque completo:

```
A single custom app icon for a desktop tool called "Packwright", a Minecraft
modpack studio. Concept: "The Wright's Seal".

Design a flat vector mark made of exactly these elements:
1. A square plate with all four corners cut off at 45 degrees (a beveled
   square, like the face of an abstract building block). It is NOT a hexagon
   and NOT a circle. Clean sharp corners, 2px maximum corner radius.
2. Inside the plate, a negative-space blacksmith anvil silhouette that is
   simultaneously readable as the capital letter "P": the anvil horn forms
   the bowl of the P, the anvil body forms its vertical stem. This dual
   reading is the core of the mark.
3. One single diagonal stroke running from bottom-left to upper-right across
   the plate, like a craftsman's finishing pass. Only this stroke carries a
   subtle gradient from violet #5B4BE0 to cyan #3DDAD7. No other gradients.
4. Where the stroke exits the plate, three small perfect squares detach in
   sequence: one violet #5B4BE0, one cyan #3DDAD7, one muted grey #9AA4B8.
   Leave an empty outlined square slot after them, suggesting room for one
   more mod. The three squares are intentionally NOT evenly spaced.

Style: flat vector, geometric, crisp edges, optical centering, consistent
2px stroke weight, premium indie developer-tool aesthetic, calm and precise,
not playful, not childish. Off-white mark #F2F3F7 on transparent background.

The full mark must stay legible at 32x32 pixels: at small size the anvil-P
still reads; the three squares may merge into a single accent detail.

NO text, NO letters other than the implied P, NO words, NO logo lockup,
NO 3D render, NO photorealism, NO neon glow, NO circuit-board patterns,
NO hexagon tech badge, NO rocket, NO crown, NO generic AI symmetry,
NO Minecraft blocks or Mojang assets, NO CurseForge or Modrinth logos,
NO watermark, NO signature. Square 1:1 composition, transparent background.
```

### Versión corta (si el modelo tiene límite de tokens)

```
Flat vector app icon: a beveled square plate containing a negative-space
anvil that doubles as the letter "P". One diagonal violet-to-cyan stroke
crosses it; three small square pixels detach and one empty slot remains.
Off-white #F2F3F7 mark, accents #5B4BE0 and #3DDAD7, transparent background,
crisp 2px strokes, legible at 32px. No text, no 3D, no glow, no game logos,
no hexagon, no generic AI look. Square 1:1.
```

---

## 3. Negative prompt global (añadir siempre al final)

```
blurry, noisy, low resolution, text, letters, watermark, signature, photorealistic,
3D render, isometric, neon glow, circuit board, hexagon badge, rocket, crown,
skull, generic robot, childish mascot, oversaturated colors, rainbow gradient,
Minecraft logo, Mojang assets, CurseForge logo, Modrinth logo, Steam icon,
cluttered composition, extra elements, cropped edges, jagged lines
```

---

## 4. Variantes

### 4.1 Monocromo (taskbar / bandeja / favicon)
```
The exact same "Wright's Seal" mark rendered as a single flat white silhouette
on transparent background. No color, no gradient, no pixels separated, no text.
Optimized for 16px and 20px rendering: simplify the three detached squares
into one small solid square. Crisp, high contrast, perfectly centered.
```

### 4.2 Icono de app con fondo (para tauri icon)
```
The Wright's Seal mark centered on a solid #0F1116 square background with
16% padding on all sides. Flat vector, no text, no border, no rounded corners
on the background. The off-white mark with violet and cyan accents must read
clearly at 32px. Square 1:1, high contrast, crisp edges.
```

### 4.3 Banner del README (1920×640)
```
Wide 1920x640 banner for a developer tool. Background #F7F8FA (light) with
an extremely subtle 32px grid in #E4E7EC, almost invisible. On the left third,
the Wright's Seal mark in off-white on a #0F1116 rounded rectangle, medium
size. On the right two thirds: completely empty clean space with a faint
#5B4BE0 hairline starting from the mark. No text, no letters, no mockup.
Editorial, minimal, generous whitespace, professional, calm. No gradients
except the hairline. No shadows beyond a very soft one under the mark tile.
```

### 4.4 Open Graph (1200×630)
```
1200x630 social preview image. Light #F7F8FA background, minimal editorial
layout. The Wright's Seal mark centered slightly left, about 180px tall.
A thin #5B4BE0 vertical rule next to it. Large empty area on the right for a
title added later. Flat, clean, high contrast, no text, no photos, no 3D.
```

### 4.5 Textura sutil (fondo de app — solo si se usa)
```
Nearly invisible seamless pattern on #F7F8FA: a 32px grid of 1px lines in
#E4E7EC with a single tiny #5B4BE0 dot every 8th cell. Extremely low contrast,
Fully tileable, no text, no characters, no icons, no bright elements.
```

### 4.6 Mascota (solo para onboarding/errores, opcional)
```
A tiny blocky craftsman character: a small off-white square body with the
Wright's Seal P on its chest, two short arms, one holding an oversized flat
hammer. Minimal 2px strokes, two dot eyes, violet #5B4BE0 scarf, one cyan
#3DDAD7 pixel floating above. Friendly but neutral, not childish, flat vector,
transparent background, no text, no copyrighted character resemblance.
```

### 4.7 Mockup de UI (actualizado al diseño minimalista actual)
```
Clean desktop app UI screenshot, 1440x900, minimalist light theme #F7F8FA.
Top bar 56px tall with a small beveled-square "P" logo, the wordmark on the
left and a theme toggle icon on the right. Centered content: a single white
card with 12px radius and a very soft shadow containing a short form with
three fields and one violet button. Generous whitespace, system sans-serif
typography, thin #E4E7EC borders, no gradients, no dark panels, no emoji,
no console, no decorative graphics. Use placeholder lines instead of readable
text. Modern editorial SaaS aesthetic, calm and professional, no watermark.
```

---

## 5. Cómo integrarlo en la app

1. Descarga el master como `packwright-mark.png` (PNG transparente, 1024×1024) y el monocromo como `packwright-mark-mono.png`.
2. Genera todos los iconos de Tauri con:
   ```bash
   bun run tauri icon public/packwright-mark.png
   ```
   Esto reemplaza `src-tauri/icons/` (ICO, ICNS, PNG en todos los tamaños, StoreLogo).
3. Pon el mark en `public/packwright-mark.png` y úsalo en el header de React en lugar del actual cuadrado con la letra "P".
4. El banner va en `docs/screenshots/banner.png` y se referencia desde el README.

---

## 6. Criterios de aceptación

Antes de aprobar la imagen, comprueba:

- [ ] El yunque **también se lee como P** sin que nadie te lo explique.
- [ ] La placa tiene **esquinas recortadas**, no es un hexágono ni un círculo.
- [ ] Solo la diagonal tiene degradado; el resto es color plano.
- [ ] Los tres píxeles y el hueco vacío se distinguen.
- [ ] Funciona a 32 px sin convertirse en un tazón.
- [ ] No hay ni una sola letra real en la imagen.
- [ ] No se parece a un logo de IA genérico (sin circuitos, sin glow, sin corona).
