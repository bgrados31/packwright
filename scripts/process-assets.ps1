<#
  Prepara los assets de Packwright para Tauri y para los dos temas.
  Entrada: public/Isotipo.png, public/Monocroma.png (2048x2048 con alpha)
  Salida:  public/packwright-mark.png, public/packwright-mark-mono-dark.png
#>
Add-Type -AssemblyName System.Drawing

$publicDir = Join-Path $PSScriptRoot '..\public'

# --- 1. Recortar margen transparente y dejar el mark cuadrado ---
$img = New-Object System.Drawing.Bitmap((Join-Path $publicDir 'Isotipo.png'))
$minX = $img.Width; $minY = $img.Height; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $img.Height; $y += 32) {
    for ($x = 0; $x -lt $img.Width; $x += 32) {
        if ($img.GetPixel($x, $y).A -gt 8) {
            if ($x -lt $minX) { $minX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
$pad = [int]($img.Width * 0.015)
$minX = [math]::Max(0, $minX - 32 - $pad); $minY = [math]::Max(0, $minY - 32 - $pad)
$maxX = [math]::Min($img.Width - 1, $maxX + 32 + $pad)
$maxY = [math]::Min($img.Height - 1, $maxY + 32 + $pad)
$size = [math]::Max($maxX - $minX, $maxY - $minY)
$cx = [int](($minX + $maxX) / 2); $cy = [int](($minY + $maxY) / 2)
$left = [math]::Max(0, $cx - [int]($size / 2))
$top = [math]::Max(0, $cy - [int]($size / 2))
$size = [math]::Min($size, [math]::Min($img.Width - $left, $img.Height - $top))

$crop = New-Object System.Drawing.Rectangle($left, $top, $size, $size)
$cropped = $img.Clone($crop, $img.PixelFormat)
$final = New-Object System.Drawing.Bitmap(1024, 1024)
$g = [System.Drawing.Graphics]::FromImage($final)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($cropped, 0, 0, 1024, 1024)
$final.Save((Join-Path $publicDir 'packwright-mark.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $final.Dispose(); $cropped.Dispose(); $img.Dispose()
"OK: packwright-mark.png"

# --- 2. Monocromo oscuro para el tema claro (ColorMatrix, rápido) ---
$mono = New-Object System.Drawing.Bitmap((Join-Path $publicDir 'Monocroma.png'))
$dark = New-Object System.Drawing.Bitmap($mono.Width, $mono.Height)
$g2 = [System.Drawing.Graphics]::FromImage($dark)
$g2.Clear([System.Drawing.Color]::Transparent)
$matrixValues = @(
    @(0, 0, 0, 0, 0),
    @(0, 0, 0, 0, 0),
    @(0, 0, 0, 0, 0),
    @(0, 0, 0, 1, 0),
    @([float](26/255), [float](29/255), [float](35/255), 0, 1)
)
$matrix = New-Object System.Drawing.Imaging.ColorMatrix(,$matrixValues)
$attrs = New-Object System.Drawing.Imaging.ImageAttributes
$attrs.SetColorMatrix($matrix)
$rect = New-Object System.Drawing.Rectangle(0, 0, $mono.Width, $mono.Height)
$g2.DrawImage($mono, $rect, 0, 0, $mono.Width, $mono.Height, [System.Drawing.GraphicsUnit]::Pixel, $attrs)
$dark.Save((Join-Path $publicDir 'packwright-mark-mono-dark.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g2.Dispose(); $attrs.Dispose(); $dark.Dispose(); $mono.Dispose()
"OK: packwright-mark-mono-dark.png"
