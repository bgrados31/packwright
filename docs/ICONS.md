# Iconos de Packwright (flujo oficial de Tauri)

Basado en https://tauri.app/develop/icons/. **No inventar iconos a mano**: se genera un set desde una sola imagen.

## Regla

1. El archivo fuente es **`public/packwright-mark.png`** (PNG cuadrado, cuadrado 1:1, con transparencia).
2. Se ejecuta:

   ```bash
   bun run tauri icon public/packwright-mark.png
   ```

3. Tauri genera `src-tauri/icons/` para todos los destinos:

   | Archivo | Plataforma |
   | --- | --- |
   | `icon.ico` (capas 16/24/32/48/64/256, **32 primero**) | Windows |
   | `icon.icns` | macOS |
   | `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, `64x64.png` | Linux / general |
   | `Square*Logo.png`, `StoreLogo.png` | AppX / Microsoft Store |
   | `android/mipmap-*/…` | Android |
   | `ios/AppIcon-*.png` | iOS |

4. `src-tauri/tauri.conf.json` declara los iconos de escritorio:

   ```json
   "bundle": {
     "active": true,
     "targets": "all",
     "icon": [
       "icons/32x32.png",
       "icons/128x128.png",
       "icons/128x128@2x.png",
       "icons/icon.icns",
       "icons/icon.ico"
     ]
   }
   ```

5. Para **desarrollo** (donde el ejecutable no se empaqueta), Tauri recomienda que la capa de 32 px del ICO vaya primero. Packwright additionally establece el icono de la ventana en `setup()` con `window.set_icon()` cargando `icons/icon.ico` (features `image-ico`).

## Regenerar los assets fuente

Si cambia el isotipo o el monocromo:

```bash
powershell -ExecutionPolicy Bypass -File scripts/process-assets.ps1
bun run tauri icon public/packwright-mark.png
```

`process-assets.ps1` recorta el margen de `Isotipo.png` y crea la versión oscura del `Monocroma.png` para el tema claro.

## Verificación

- `bun run tauri dev` → el icono de la barra de tareas debe ser el isotipo naranja, no el de Tauri.
- `bun run tauri build` → los instaladores deben mostrar el mismo icono.
